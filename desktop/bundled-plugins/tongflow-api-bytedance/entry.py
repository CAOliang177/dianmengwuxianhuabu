from __future__ import annotations

import base64
import http.client
import json
import os
import re
import socket
import ssl
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from tongflow.models.asset import Asset
from tongflow.models.image_gen_video import ImageGenVideoInput, ImageGenVideoOutput
from tongflow.models.image_image_gen_video import (
    ImageImageGenVideoInput,
    ImageImageGenVideoOutput,
)
from tongflow.models.images_gen_video import ImagesGenVideoInput, ImagesGenVideoOutput
from tongflow.models.text_gen_video import TextGenVideoInput, TextGenVideoOutput
from tongflow.node_slots import NodeSlots
from tongflow.protocol import asset, prompt_media_to_bytes
from tongflow.slots import node_slot

DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
SEEDANCE_25_MODEL = "doubao-seedance-2-5-260628"
DEFAULT_MODEL = SEEDANCE_25_MODEL

TONGFLOW_SLOT_MODELS = {
    "text-gen-video": [
        "doubao-seedance-2-5-260628",
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
    ],
    "image-gen-video": [
        "doubao-seedance-2-5-260628",
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
    ],
    "images-gen-video": [
        "doubao-seedance-2-5-260628",
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
    ],
    "image-image-gen-video": [
        "doubao-seedance-2-5-260628",
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
    ],
}

_REQUEST_MODEL = ""


def _env(name: str, fallback: str = "") -> str:
    return (os.environ.get(name) or fallback).strip()


def _api_key() -> str:
    key = _env("ARK_API_KEY", _env("VOLCENGINE_API_KEY"))
    if not key:
        raise RuntimeError("请在设置中填写 ARK_API_KEY（火山方舟 API Key）")
    return key


def _base_url() -> str:
    return _env("VOLCENGINE_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _model() -> str:
    configured = _env("VOLCENGINE_VIDEO_MODEL", DEFAULT_MODEL)
    # The canvas exposes official model aliases. When the user configured a
    # custom Ark endpoint ID, keep using that endpoint while the default 2.5
    # option is selected; explicit 2.0/2.0 Fast selections still win.
    official_models = set(TONGFLOW_SLOT_MODELS["text-gen-video"])
    if configured not in official_models and _REQUEST_MODEL in {"", DEFAULT_MODEL}:
        return configured
    return _REQUEST_MODEL or configured


def _is_seedance_25(model: str) -> bool:
    if model == SEEDANCE_25_MODEL:
        return True
    if model in {
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
    }:
        return False
    # Custom endpoint IDs do not encode their model family. Default to the 2.5
    # request schema and let advanced users opt into the legacy schema.
    schema = _env("VOLCENGINE_VIDEO_SCHEMA", "2.5").lower()
    return schema not in {"2.0", "2", "legacy"}


def _timeout() -> int:
    try:
        return max(60, int(_env("VOLCENGINE_TIMEOUT", "1800")))
    except ValueError:
        return 1800


def _redact(value: object, limit: int = 1200) -> str:
    text = str(value)
    for name in (
        "ARK_API_KEY",
        "VOLCENGINE_API_KEY",
        "VOLCENGINE_ACCESS_KEY_ID",
        "VOLCENGINE_SECRET_ACCESS_KEY",
    ):
        secret = _env(name)
        if secret:
            text = text.replace(secret, "***")
    return text[:limit]


def _http(
    url: str,
    *,
    method: str = "GET",
    body: bytes | None = None,
) -> bytes:
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Connection": "close",
            "User-Agent": "dianmeng-infinite-canvas/0.1",
        },
    )
    try:
        with urlopen(request, timeout=_timeout()) as response:  # noqa: S310
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"火山方舟 API HTTP {exc.code} ({url}): {_redact(detail or exc.reason)}"
        ) from exc
    except (
        URLError,
        ssl.SSLError,
        socket.timeout,
        TimeoutError,
        ConnectionError,
        http.client.RemoteDisconnected,
    ) as exc:
        reason = exc.reason if isinstance(exc, URLError) else exc
        raise RuntimeError(
            f"无法连接火山方舟 API ({url}): {_redact(reason)}"
        ) from exc


def _json(body: bytes) -> dict[str, Any]:
    try:
        value = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        preview = body.decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"火山方舟 API 返回的不是 JSON：{preview}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("火山方舟 API 返回格式错误：顶层不是对象")
    return value


def _ratio(width: int | None, height: int | None) -> str:
    if not width or not height or width <= 0 or height <= 0:
        return "adaptive"
    known = {
        (576, 1024): "9:16",
        (1024, 576): "16:9",
        (1024, 1024): "1:1",
        (1024, 768): "4:3",
        (768, 1024): "3:4",
        (1344, 576): "21:9",
    }
    return known.get((int(width), int(height)), "adaptive")


def _clean_prompt(prompt: str) -> str:
    # Seedance 2.5 receives ratio and duration as top-level request fields.
    # Remove controls copied from older prompt-suffix examples so they cannot
    # contradict the values selected in the canvas.
    cleaned = re.sub(r"\s*--ratio\s+\S+", "", prompt, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*--dur(?:ation)?\s+\S+", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _neutralize_frame_mode_words(prompt: str) -> str:
    """Keep reference mode authoritative without changing the canvas prompt."""
    replacements = (
        (r"首尾帧", "开场与收束构图参考"),
        (r"(?:第一帧|起始帧|开场帧|首帧)", "开场构图参考"),
        (r"(?:最后一帧|结束帧|尾帧)", "收束构图参考"),
        (r"first\s*frame|start(?:ing)?\s*frame", "opening composition reference"),
        (r"last\s*frame|end(?:ing)?\s*frame", "closing composition reference"),
    )
    normalized = prompt
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized


def _neutralize_video_extension_words(prompt: str) -> str:
    """Keep an explicit all-reference request from being reclassified as extend."""
    replacement_zh = "参考输入视频的主体状态与动作趋势，生成独立新镜头"
    replacement_en = (
        "use the input video as motion and camera reference for an independent new shot"
    )
    replacements = (
        (r"(?:续写|续拍|续接|接续)(?:这个|该|原)?(?:视频|片段|镜头)?", replacement_zh),
        (
            r"(?:把|将)?(?:这个|该|原|输入的)?(?:视频|片段|镜头)"
            r"(?:继续|接着|延长|延伸|扩展|续写|续拍)",
            replacement_zh,
        ),
        (
            r"(?:继续|接着|承接|衔接)(?:上一段|上一个|前一个|原)"
            r"(?:视频|片段|镜头)",
            replacement_zh,
        ),
        (
            r"从(?:@视频\d+|输入视频|原视频|上一段视频)(?:的)?"
            r"(?:结尾|尾帧|结束处)(?:开始|继续|往后)?",
            "参考输入视频的主体状态与动作趋势",
        ),
        (
            r"(?:extend|continue|resume)\s+(?:this|the|input|source|previous)\s+"
            r"(?:video|clip|shot)",
            replacement_en,
        ),
        (
            r"(?:video|clip|shot)\s+(?:extension|continuation)",
            replacement_en,
        ),
        (
            r"continue\s+from\s+(?:the\s+)?(?:end|last\s+frame)",
            "use the source state as reference for an independent new shot",
        ),
    )
    normalized = prompt
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    prefix = (
        "全能参考生成任务。输入视频只作为主体状态、动作、镜头、节奏和声音的参考素材。"
        "生成独立新视频，画幅和时长严格采用请求参数。"
        "不得编辑或延长输入视频；提示词中的替换、修改、保留原动作等描述，"
        "均表示在独立新视频中迁移相应参考特征，不是修改输入视频本身。"
    )
    return f"{prefix}\n{normalized.strip()}" if normalized.strip() else prefix


def _ark_video_mode_constraint(exc: RuntimeError) -> str | None:
    """Return the video mode Ark inferred from a deterministic 400 rejection."""
    message = str(exc).lower()
    if (
        "video editing" in message
        and "ratio" in message
        and "adaptive" in message
        and "duration" in message
        and "-1" in message
    ):
        return "edit"
    if (
        "video extension" in message
        and "ratio" in message
        and "adaptive" in message
    ):
        return "extend"
    return None


def _split_asset_ids(value: object) -> list[dict[str, str]]:
    raw: list[object] = []
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    raw.extend(parsed)
            except json.JSONDecodeError:
                raw.extend(re.split(r"[\s,;]+", stripped))
        else:
            raw.extend(re.split(r"[\s,;]+", stripped))
    elif isinstance(value, list):
        raw.extend(value)
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        kind = "image"
        if isinstance(item, dict):
            token = str(
                item.get("id")
                or item.get("assetId")
                or item.get("asset_id")
                or ""
            ).strip()
            candidate_kind = str(
                item.get("type") or item.get("mediaType") or item.get("kind") or ""
            ).lower()
            if "video" in candidate_kind:
                kind = "video"
            elif "audio" in candidate_kind:
                kind = "audio"
            role = str(item.get("role") or item.get("Role") or "").strip()
        else:
            role = ""
            token = str(item).strip()
            match = re.match(r"^(image|video|audio):(.+)$", token, flags=re.IGNORECASE)
            if match:
                kind = match.group(1).lower()
                token = match.group(2).strip()
            elif token.lower().startswith("video://"):
                kind, token = "video", token[8:]
            elif token.lower().startswith("audio://"):
                kind, token = "audio", token[8:]
        if not token:
            continue
        if re.fullmatch(
            r"(?:SID\[)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]?",
            token,
            flags=re.IGNORECASE,
        ):
            raise RuntimeError(
                "所选火山素材只有内部 SID，不能直接用于方舟生成。"
                "请将该素材上传到画布后连接，或换用有效的 asset://asset-... 素材。"
            )
        if not token.startswith("asset://"):
            token = f"asset://{token}"
        key = f"{kind}:{token}"
        if key not in seen:
            seen.add(key)
            material = {"id": token, "type": kind}
            if role:
                material["role"] = role
            result.append(material)
    return result


def _mime(value: object) -> str:
    if isinstance(value, Asset) and value.mime:
        return value.mime
    if isinstance(value, dict) and isinstance(value.get("mime"), str):
        return str(value["mime"])
    filename = ""
    if isinstance(value, Asset) and value.filename:
        filename = value.filename
    elif isinstance(value, dict) and isinstance(value.get("filename"), str):
        filename = str(value["filename"])
    extension = Path(filename).suffix.lower()
    by_extension = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".flac": "audio/flac",
    }
    return by_extension.get(extension, "application/octet-stream")


def _data_url(value: object) -> str:
    encoded = base64.b64encode(prompt_media_to_bytes(value)).decode("ascii")
    return f"data:{_mime(value)};base64,{encoded}"


def _image_item(value: object, *, role: str = "reference_image") -> dict[str, Any]:
    return {
        "type": "image_url",
        "image_url": {"url": _data_url(value)},
        "role": role,
    }


def _media_item(value: object, *, kind: str) -> dict[str, Any]:
    direct_url = None
    if isinstance(value, str) and value.startswith(("https://", "http://", "asset://")):
        direct_url = value
    elif isinstance(value, dict):
        candidate = value.get("url")
        if isinstance(candidate, str) and candidate.startswith(
            ("https://", "http://", "asset://")
        ):
            direct_url = candidate

    if direct_url is None and kind == "video":
        raise RuntimeError(
            "火山方舟参考视频不支持直接提交桌面端本地文件。"
            "请断开本地视频节点，点击视频生成节点的“素材库”，"
            "选择已上传的视频素材后再生成。"
        )

    field = f"{kind}_url"
    return {
        "type": field,
        field: {"url": direct_url or _data_url(value)},
        "role": f"reference_{kind}",
    }


def _asset_item(material: dict[str, str]) -> dict[str, Any]:
    kind = material.get("type", "image")
    raw = material.get("id", "")
    if not raw.startswith("asset://"):
        raw = f"asset://{raw}"
    field = f"{kind}_url"
    return {
        "type": field,
        field: {"url": raw},
        "role": material.get("role") or f"reference_{kind}",
    }


def _response_payload(response: dict[str, Any]) -> dict[str, Any]:
    data = response.get("data")
    return data if isinstance(data, dict) else response


def _find_video_url(value: object, depth: int = 0) -> str | None:
    if depth > 6:
        return None
    if isinstance(value, dict):
        for key in ("video_url", "videoUrl", "file_url", "fileUrl", "url"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
            if isinstance(candidate, dict):
                nested_url = candidate.get("url")
                if isinstance(nested_url, str) and nested_url:
                    return nested_url
        for key in ("content", "output", "result", "data", "results"):
            candidate = _find_video_url(value.get(key), depth + 1)
            if candidate:
                return candidate
    elif isinstance(value, list):
        for item in value:
            candidate = _find_video_url(item, depth + 1)
            if candidate:
                return candidate
    return None


def _create_task(
    prompt: str,
    *,
    width: int | None,
    height: int | None,
    duration: float | None,
    resolution: str | None = None,
    images: list[object] | None = None,
    videos: list[object] | None = None,
    audios: list[object] | None = None,
    asset_ids: object = None,
    operation: str | None = None,
    image_role: str = "reference_image",
    image_roles: list[str] | None = None,
    adaptive_ratio: bool = False,
) -> Asset:
    model = _model()
    is_seedance_25 = _is_seedance_25(model)
    is_video_edit = (operation or "generate").strip().lower() == "edit"
    max_images = 30 if is_seedance_25 else 9
    provided_images = [image for image in images or [] if image is not None]
    provided_videos = [video for video in videos or [] if video is not None]
    provided_audios = [audio for audio in audios or [] if audio is not None]
    materials = _split_asset_ids(asset_ids)
    image_materials = sum(1 for item in materials if item["type"] == "image")
    video_materials = sum(1 for item in materials if item["type"] == "video")
    audio_materials = sum(1 for item in materials if item["type"] == "audio")
    edit_video_count = len(provided_videos) + video_materials
    if is_video_edit and not is_seedance_25:
        raise RuntimeError("视频编辑模式仅支持 Seedance 2.5 模型")
    if is_video_edit and edit_video_count != 1:
        raise RuntimeError(
            f"Seedance 2.5 视频编辑必须且只能选择 1 个源视频，当前为 {edit_video_count} 个"
        )
    if len(provided_images) + image_materials > max_images:
        raise RuntimeError(
            f"当前模型最多支持 {max_images} 张参考图片，现有 {len(provided_images) + image_materials} 张"
        )
    if is_seedance_25 and (
        len(provided_videos) + video_materials > 10
        or len(provided_audios) + audio_materials > 10
    ):
        raise RuntimeError("Seedance 2.5 最多支持 10 个视频素材和 10 个音频素材")
    if is_seedance_25 and (
        len(provided_images)
        + len(provided_videos)
        + len(provided_audios)
        + len(materials)
        > 50
    ):
        raise RuntimeError("Seedance 2.5 单次最多支持 50 个参考素材")
    if not is_seedance_25 and (
        len(provided_videos) + video_materials > 3
        or len(provided_audios) + audio_materials > 3
    ):
        raise RuntimeError("Seedance 2.0 最多支持 3 个视频素材和 3 个音频素材")
    if (
        len(provided_audios) + audio_materials > 0
        and len(provided_images)
        + image_materials
        + len(provided_videos)
        + video_materials
        == 0
    ):
        raise RuntimeError("使用音频参考时，请至少同时连接一张图片或一个视频")

    frame_roles = {"first_frame", "last_frame"}
    has_frame_role = image_role in frame_roles or any(
        role in frame_roles for role in (image_roles or [])
    ) or any(material.get("role") in frame_roles for material in materials)
    has_visual_reference = bool(
        provided_images
        or provided_videos
        or image_materials
        or video_materials
    )
    is_reference_mode = has_visual_reference and not has_frame_role and not is_video_edit
    request_prompt = _clean_prompt(prompt)
    if is_reference_mode:
        request_prompt = _neutralize_frame_mode_words(request_prompt)
        if provided_videos or video_materials:
            request_prompt = _neutralize_video_extension_words(request_prompt)

    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": request_prompt,
        }
    ]
    for index, image in enumerate(provided_images):
        role = (
            image_roles[index]
            if image_roles is not None and index < len(image_roles)
            else image_role
        )
        content.append(_image_item(image, role=role))
    for video in provided_videos:
        content.append(_media_item(video, kind="video"))
    for audio in provided_audios:
        content.append(_media_item(audio, kind="audio"))
    for material in materials:
        content.append(_asset_item(material))

    use_adaptive_ratio = is_video_edit or adaptive_ratio or has_frame_role

    duration_max = 30 if is_seedance_25 else 15
    seconds = max(4, min(duration_max, int(round(duration or 5))))
    request_body: dict[str, Any] = {
        "model": model,
        "content": content,
        "ratio": "adaptive" if use_adaptive_ratio else _ratio(width, height),
        "duration": -1 if is_video_edit else seconds,
        "return_last_frame": False,
    }
    requested_resolution = (
        resolution or _env("VOLCENGINE_VIDEO_RESOLUTION", "720p")
    ).strip().lower()
    if is_seedance_25 or "fast" in model.lower():
        allowed_resolutions = {"480p", "720p"}
    else:
        allowed_resolutions = {"480p", "720p", "1080p", "4k"}
    request_body["resolution"] = (
        requested_resolution
        if requested_resolution in allowed_resolutions
        else "720p"
    )
    request_body["generate_audio"] = _env(
        "VOLCENGINE_GENERATE_AUDIO", "true"
    ).lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    if is_seedance_25:
        output_format = _env("VOLCENGINE_OUTPUT_FORMAT", "mp4").lower()
        request_body["output_format"] = output_format if output_format in {"mp4", "mov"} else "mp4"

    endpoint = f"{_base_url()}/contents/generations/tasks"
    try:
        response = _json(
            _http(
                endpoint,
                method="POST",
                body=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
            )
        )
    except RuntimeError as exc:
        # Ark can still override an explicit all-reference declaration and
        # classify a detailed prompt as edit/extend. These deterministic 400s
        # happen before task creation, so one provider-compliant retry is safe.
        inferred_mode = _ark_video_mode_constraint(exc)
        can_retry_mode_constraint = (
            is_reference_mode
            and bool(provided_videos or video_materials)
            and inferred_mode is not None
            and (
                request_body.get("ratio") != "adaptive"
                or (
                    inferred_mode == "edit"
                    and request_body.get("duration") != -1
                )
            )
        )
        if not can_retry_mode_constraint:
            raise
        request_body["ratio"] = "adaptive"
        if inferred_mode == "edit":
            request_body["duration"] = -1
        response = _json(
            _http(
                endpoint,
                method="POST",
                body=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
            )
        )
    payload = _response_payload(response)
    task_id = (
        response.get("id")
        or response.get("task_id")
        or payload.get("id")
        or payload.get("task_id")
    )
    if not isinstance(task_id, str) or not task_id:
        raise RuntimeError(
            f"火山方舟未返回视频任务 ID：{json.dumps(response, ensure_ascii=False)[:500]}"
        )
    return _poll_task(endpoint, task_id, str(request_body.get("output_format", "mp4")))


def _poll_task(endpoint: str, task_id: str, output_format: str = "mp4") -> Asset:
    deadline = time.monotonic() + _timeout()
    transient_failures = 0
    while time.monotonic() < deadline:
        try:
            response = _json(_http(f"{endpoint}/{task_id}"))
            transient_failures = 0
        except RuntimeError as exc:
            message = str(exc)
            is_transient = (
                "无法连接火山方舟 API" in message
                or re.search(r"API HTTP (?:429|5\d\d)\b", message) is not None
            )
            if not is_transient:
                raise
            transient_failures += 1
            delay = min(15.0, 1.5 * (2 ** min(transient_failures - 1, 4)))
            print(
                f"[tongflow] 火山方舟任务 {task_id} 查询暂时失败，{delay:.1f} 秒后重试：{_redact(message, 400)}",
                file=sys.stderr,
            )
            time.sleep(delay)
            continue
        payload = _response_payload(response)
        status = str(payload.get("status") or response.get("status") or "").lower()
        video_url = _find_video_url(payload) or _find_video_url(response)
        if status in {"succeeded", "completed", "success"} and video_url:
            return _download_video(video_url, output_format=output_format)
        if status in {"failed", "cancelled", "canceled", "expired"}:
            error = payload.get("error") or response.get("error")
            if isinstance(error, dict):
                error = error.get("message") or error.get("code")
            raise RuntimeError(f"火山方舟视频任务失败：{error or status}")
        print(
            f"[tongflow] 火山方舟视频任务 {task_id} 状态：{status or 'pending'}",
            file=sys.stderr,
        )
        time.sleep(3)
    raise RuntimeError(f"火山方舟视频任务超时（{_timeout()} 秒），任务 ID：{task_id}")


def _download_video(url: str, *, output_format: str = "mp4") -> Asset:
    last_error: Exception | None = None
    for attempt in range(3):
        request = Request(
            url,
            headers={
                "Accept": "video/mp4,video/webm,application/octet-stream,*/*",
                "Connection": "close",
                "User-Agent": "dianmeng-infinite-canvas/0.1",
            },
        )
        try:
            with urlopen(request, timeout=_timeout()) as response:  # noqa: S310
                mime = (
                    response.headers.get("Content-Type", "")
                    .split(";", 1)[0]
                    .strip()
                    .lower()
                )
                if mime and not (
                    mime.startswith("video/") or mime == "application/octet-stream"
                ):
                    raise RuntimeError(
                        f"火山方舟下载地址返回了非视频内容：{mime}"
                    )
                max_bytes = 512 * 1024 * 1024
                content_length = response.headers.get("Content-Length")
                if content_length and int(content_length) > max_bytes:
                    raise RuntimeError("生成视频超过 512 MB 安全下载上限")
                chunks: list[bytes] = []
                total = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise RuntimeError("生成视频超过 512 MB 安全下载上限")
                    chunks.append(chunk)
                body = b"".join(chunks)
                if not body:
                    raise RuntimeError("火山方舟下载地址返回了空文件")
                resolved_format = "mov" if output_format.lower() == "mov" else "mp4"
                resolved_mime = mime or (
                    "video/quicktime" if resolved_format == "mov" else "video/mp4"
                )
                return asset(
                    body,
                    mime=resolved_mime,
                    filename=f"seedance.{resolved_format}",
                )
        except (
            HTTPError,
            URLError,
            ssl.SSLError,
            socket.timeout,
            TimeoutError,
            ConnectionError,
            http.client.IncompleteRead,
            http.client.RemoteDisconnected,
        ) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (2**attempt))
    raise RuntimeError(f"下载火山方舟生成视频失败：{last_error}") from last_error


@node_slot(NodeSlots.TEXT_GEN_VIDEO)
def text_gen_video(input: TextGenVideoInput) -> TextGenVideoOutput:
    video = _create_task(
        input.text,
        width=input.width,
        height=input.height,
        duration=input.duration,
        resolution=input.resolution,
        asset_ids=input.asset_ids,
    )
    return TextGenVideoOutput(success=True, video=video)


@node_slot(NodeSlots.IMAGE_GEN_VIDEO)
def image_gen_video(input: ImageGenVideoInput) -> ImageGenVideoOutput:
    materials = _split_asset_ids(input.asset_ids)
    if input.image is None and not any(
        item["type"] == "image" for item in materials
    ):
        raise RuntimeError("首帧模式需要连接图片或从素材库选择一张图片")
    video = _create_task(
        input.text,
        width=input.width,
        height=input.height,
        duration=input.duration,
        resolution=input.resolution,
        images=[input.image] if input.image is not None else [],
        asset_ids=input.asset_ids,
        image_role="first_frame",
        adaptive_ratio=True,
    )
    return ImageGenVideoOutput(success=True, video=video)


@node_slot(NodeSlots.IMAGES_GEN_VIDEO)
def images_gen_video(input: ImagesGenVideoInput) -> ImagesGenVideoOutput:
    video = _create_task(
        input.text,
        width=input.width,
        height=input.height,
        duration=input.duration,
        resolution=input.resolution,
        images=list(input.images or []),
        videos=list(input.videos or []),
        audios=list(input.audios or []),
        asset_ids=input.asset_ids,
        operation=input.operation,
    )
    return ImagesGenVideoOutput(success=True, video=video)


@node_slot(NodeSlots.IMAGE_IMAGE_GEN_VIDEO)
def image_image_gen_video(
    input: ImageImageGenVideoInput,
) -> ImageImageGenVideoOutput:
    materials = _split_asset_ids(input.asset_ids)
    frame_count = int(input.image is not None) + int(input.end_image is not None)
    frame_count += sum(1 for item in materials if item["type"] == "image")
    if frame_count < 2:
        raise RuntimeError("首尾帧模式需要两张图片，可连接图片或从素材库选择")
    video = _create_task(
        input.text,
        width=input.width,
        height=input.height,
        duration=input.duration,
        resolution=input.resolution,
        images=[
            image
            for image in (input.image, input.end_image)
            if image is not None
        ],
        image_roles=(
            ["first_frame", "last_frame"]
            if input.image is not None and input.end_image is not None
            else ["first_frame"]
        ),
        asset_ids=input.asset_ids,
        adaptive_ratio=True,
    )
    return ImageImageGenVideoOutput(success=True, video=video)


_HANDLERS: dict[str, Any] = {
    NodeSlots.TEXT_GEN_VIDEO: text_gen_video,
    NodeSlots.IMAGE_GEN_VIDEO: image_gen_video,
    NodeSlots.IMAGES_GEN_VIDEO: images_gen_video,
    NodeSlots.IMAGE_IMAGE_GEN_VIDEO: image_image_gen_video,
}


def main() -> int:
    global _REQUEST_MODEL
    try:
        request = json.loads(sys.stdin.read() or "{}")
        requested_model = str(request.get("model") or "").strip()
        _REQUEST_MODEL = requested_model
        handler = _HANDLERS.get(str(request.get("nodeSlot") or ""))
        if handler is None:
            raise RuntimeError(f"不支持的视频节点类型：{request.get('nodeSlot')}")
        result = handler(request.get("prompt") or {})
    except Exception as exc:  # noqa: BLE001
        result = {"success": False, "error": str(exc)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
    return 0 if not isinstance(result, dict) or result.get("success", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
