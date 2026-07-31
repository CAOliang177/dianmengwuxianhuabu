from __future__ import annotations

import base64
import http.client
import json
import math
import os
import re
import socket
import ssl
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from tongflow.models.image_edit import ImageEditInput, ImageEditOutput
from tongflow.models.image_fusion import ImageFusionInput, ImageFusionOutput
from tongflow.models.image_gen import ImageGenInput, ImageGenOutput
from tongflow.node_slots import NodeSlots
from tongflow.protocol import asset, prompt_media_to_bytes
from tongflow.slots import node_slot

DEFAULT_BASE_URL = "http://ai.maxagent.top/v1"
DEFAULT_MODEL = "gemini-3-pro-image-preview"
FIXED_SKU_PIXEL_BUDGETS = {
    "1k": 1024 * 1024,
    "2k": 2048 * 2048,
    "4k": 3840 * 2160,
}
FIXED_SKU_MAX_SIDE = {"1k": 1024, "2k": 2048, "4k": 3840}
SUPPORTED_ASPECT_RATIOS = [
    ("1:1", 1, 1, 1024, 1024),
    ("5:4", 5, 4, 1280, 1024),
    ("9:16", 9, 16, 720, 1280),
    ("21:9", 21, 9, 1344, 576),
    ("16:9", 16, 9, 1280, 720),
    ("3:2", 3, 2, 1152, 768),
    ("4:3", 4, 3, 1024, 768),
    ("4:5", 4, 5, 1024, 1280),
    ("3:4", 3, 4, 768, 1024),
    ("2:3", 2, 3, 768, 1152),
]
RESOLUTION_SCALES = (1, 2, 4)

SUPPORTED_IMAGE_MODELS = [
	"gemini-3-pro-image-preview",
	"gemini-3.1-flash-image-preview",
	"gpt-image-2-pro",
]

TONGFLOW_SLOT_MODELS = {
    "image-gen": SUPPORTED_IMAGE_MODELS,
    "image-edit": SUPPORTED_IMAGE_MODELS,
    "image-fusion": SUPPORTED_IMAGE_MODELS,
}

_REQUEST_MODEL = ""


class SubmissionTimeout(RuntimeError):
    """The relay did not acknowledge a generation submission in time."""


def _env(name: str, fallback: str = "") -> str:
    return (os.environ.get(name) or fallback).strip()


def _base_url() -> str:
    value = _env("NEW_CHANNEL_BASE_URL", _env("OPENAI_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
    if not value.lower().endswith("/v1"):
        value += "/v1"
    return value


def _api_key() -> str:
    value = _env("NEW_CHANNEL_API_KEY", _env("OPENAI_API_KEY"))
    if not value:
        raise RuntimeError("请在设置中填写 NEW_CHANNEL_API_KEY")
    return value


def _model() -> str:
    return _REQUEST_MODEL or _env("NEW_CHANNEL_IMAGE_MODEL", DEFAULT_MODEL)


def _timeout() -> int:
    try:
        return max(30, int(_env("NEW_CHANNEL_TIMEOUT", "600")))
    except ValueError:
        return 600


def _submission_timeout() -> int:
    """Timeout for the initial POST, separate from async task polling."""
    try:
        configured = int(_env("NEW_CHANNEL_REQUEST_TIMEOUT", "90"))
    except ValueError:
        configured = 90
    return max(30, min(configured, _timeout()))


def _async_enabled() -> bool:
    return _env("NEW_CHANNEL_ASYNC", "true").lower() not in {"0", "false", "no", "off"}


def _edit_async_enabled() -> bool:
    # Some OpenAI-compatible relays accept async edit submissions but do not
    # implement GET /images/edits/{task_id}. Synchronous edits are the safest
    # interoperable default; users can still opt into async polling explicitly.
    return _env("NEW_CHANNEL_EDIT_ASYNC", "false").lower() not in {"0", "false", "no", "off"}


def _closest_ratio(width: int, height: int):
    actual = width / height
    return min(
        SUPPORTED_ASPECT_RATIOS,
        key=lambda item: abs(math.log(actual / (item[1] / item[2]))),
    )


def _normalize_dimensions(width: int, height: int) -> tuple[int, int]:
    ratio = _closest_ratio(width, height)
    _, _, _, base_width, base_height = ratio
    scale = min(
        RESOLUTION_SCALES,
        key=lambda candidate: (
            abs(math.log(width / (base_width * candidate)))
            + abs(math.log(height / (base_height * candidate)))
        ),
    )
    return base_width * scale, base_height * scale


def _normalize_size_string(size: str | None) -> str | None:
    if not size:
        return size
    dimensions = re.fullmatch(r"\s*(\d+)\s*x\s*(\d+)\s*", size, re.IGNORECASE)
    if not dimensions:
        return size
    width, height = int(dimensions.group(1)), int(dimensions.group(2))
    if width <= 0 or height <= 0:
        return size
    width, height = _normalize_dimensions(width, height)
    return f"{width}x{height}"


def _size(width: int | None, height: int | None) -> str | None:
    # A node's manual ratio/size is authoritative.  The environment value is
    # only a legacy fallback for requests that do not contain dimensions.
    if width and height:
        normalized_width, normalized_height = _normalize_dimensions(width, height)
        return f"{normalized_width}x{normalized_height}"
    override = _env("NEW_CHANNEL_IMAGE_SIZE")
    return _normalize_size_string(override or None)


def _size_for_model(model: str, size: str | None) -> str | None:
    """Fit a requested size when a model name explicitly ends in 1K/2K/4K."""
    if not size:
        return size
    sku = re.search(r"(?:^|-)(1k|2k|4k)$", model.strip(), re.IGNORECASE)
    dimensions = re.fullmatch(r"\s*(\d+)\s*x\s*(\d+)\s*", size, re.IGNORECASE)
    if not sku or not dimensions:
        return size

    width, height = int(dimensions.group(1)), int(dimensions.group(2))
    if width <= 0 or height <= 0:
        return size
    tier = sku.group(1).lower()
    pixel_budget = FIXED_SKU_PIXEL_BUDGETS[tier]
    max_side = FIXED_SKU_MAX_SIDE[tier]
    _, ratio_width, ratio_height, _, _ = _closest_ratio(width, height)
    multiplier = math.floor(
        min(
            math.sqrt(pixel_budget / (ratio_width * ratio_height)),
            max_side / max(ratio_width, ratio_height),
        )
    )
    multiplier = max(16, (multiplier // 16) * 16)
    return f"{ratio_width * multiplier}x{ratio_height * multiplier}"


def _http(
    url: str,
    *,
    method: str = "GET",
    body: bytes | None = None,
    content_type: str | None = None,
    timeout: int | None = None,
) -> bytes:
    headers = {"Authorization": f"Bearer {_api_key()}", "Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout or _timeout()) as response:  # noqa: S310
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"新渠道 API HTTP {exc.code} ({url}): {detail or exc.reason}") from exc
    except URLError as exc:
        if isinstance(exc.reason, (socket.timeout, TimeoutError)):
            seconds = timeout or _timeout()
            raise SubmissionTimeout(
                f"新渠道在 {seconds} 秒内没有确认收到请求。"
                "请检查中转站状态后重试；为避免重复扣费，本次不会自动重复提交。"
            ) from exc
        raise RuntimeError(f"无法连接新渠道 API ({url}): {exc.reason}") from exc
    except (socket.timeout, TimeoutError) as exc:
        seconds = timeout or _timeout()
        raise SubmissionTimeout(
            f"新渠道在 {seconds} 秒内没有确认收到请求。"
            "请检查中转站状态后重试；为避免重复扣费，本次不会自动重复提交。"
        ) from exc


def _json(body: bytes) -> dict[str, Any]:
    try:
        value = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        preview = body.decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"新渠道 API 返回的不是 JSON：{preview}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("新渠道 API 返回格式错误：顶层不是对象")
    return value


def _items(response: dict[str, Any]) -> list[Any]:
    for container in (response, response.get("result"), response.get("output")):
        if isinstance(container, dict):
            data = container.get("data") or container.get("images")
            if isinstance(data, list) and data:
                return data
    return []


def _download(url: str) -> tuple[bytes, str]:
    last_error: Exception | None = None
    for attempt in range(4):
        request = Request(
            url,
            headers={
                "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
                "Connection": "close",
                "User-Agent": "dianmeng-infinite-canvas/1.0",
            },
        )
        try:
            with urlopen(request, timeout=_timeout()) as response:  # noqa: S310
                mime = response.headers.get_content_type() or "image/png"
                return response.read(), mime
        except HTTPError as exc:
            if exc.code < 500 or attempt == 3:
                raise RuntimeError(f"下载生成图片失败：HTTP {exc.code}") from exc
            last_error = exc
        except (
            URLError,
            ssl.SSLError,
            socket.timeout,
            TimeoutError,
            ConnectionError,
            http.client.IncompleteRead,
            http.client.RemoteDisconnected,
        ) as exc:
            last_error = exc
        if attempt < 3:
            time.sleep(1.5 * (2**attempt))

    raise RuntimeError(
        f"下载生成图片失败（已自动重试 4 次）：{last_error}"
    ) from last_error


def _finished_asset(response: dict[str, Any]):
    items = _items(response)
    if not items:
        return None
    item = items[0]
    if isinstance(item, str) and item:
        raw, mime = _download(item)
        return asset(raw, mime=mime)
    if not isinstance(item, dict):
        return None
    encoded = item.get("b64_json") or item.get("base64")
    if isinstance(encoded, str) and encoded:
        if encoded.startswith("data:") and "," in encoded:
            encoded = encoded.split(",", 1)[1]
        return asset(base64.b64decode(encoded), mime="image/png")
    url = item.get("url") or item.get("image_url")
    if isinstance(url, str) and url:
        raw, mime = _download(url)
        return asset(raw, mime=mime)
    return None


def _asset_from_chat_value(value: Any, *, image_context: bool = False):
    """Extract image data from common OpenAI-compatible multimodal responses."""
    if isinstance(value, str):
        data_url = re.search(
            r"data:(image/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)",
            value,
        )
        if data_url:
            return asset(
                base64.b64decode(data_url.group(2)),
                mime=data_url.group(1),
            )
        markdown_url = re.search(r"!\[[^\]]*\]\((https?://[^)]+)\)", value)
        url = markdown_url.group(1) if markdown_url else None
        if url is None and image_context and value.startswith(("http://", "https://")):
            url = value
        if url:
            raw, mime = _download(url)
            return asset(raw, mime=mime)
        return None

    if isinstance(value, list):
        for item in value:
            found = _asset_from_chat_value(item, image_context=image_context)
            if found is not None:
                return found
        return None

    if not isinstance(value, dict):
        return None

    for key in ("b64_json", "base64", "image_base64"):
        encoded = value.get(key)
        if isinstance(encoded, str) and encoded:
            if encoded.startswith("data:"):
                found = _asset_from_chat_value(encoded, image_context=True)
                if found is not None:
                    return found
            try:
                return asset(base64.b64decode(encoded), mime="image/png")
            except (ValueError, TypeError):
                pass

    value_type = str(value.get("type") or "").lower()
    for key in (
        "images",
        "image",
        "image_url",
        "output_images",
        "content",
        "message",
        "choices",
        "data",
        "output",
        "result",
        "url",
    ):
        if key not in value:
            continue
        found = _asset_from_chat_value(
            value[key],
            image_context=image_context
            or key in {"images", "image", "image_url", "output_images", "url"}
            or "image" in value_type,
        )
        if found is not None:
            return found
    return None


def _chat_image_config(size: str | None) -> dict[str, str] | None:
    if not size:
        return None
    match = re.fullmatch(r"\s*(\d+)\s*x\s*(\d+)\s*", size, re.IGNORECASE)
    if not match:
        return None
    width, height = int(match.group(1)), int(match.group(2))
    if width <= 0 or height <= 0:
        return None

    aspect_ratio, _, _, base_width, base_height = _closest_ratio(width, height)
    scale = min(
        RESOLUTION_SCALES,
        key=lambda candidate: (
            abs(math.log(width / (base_width * candidate)))
            + abs(math.log(height / (base_height * candidate)))
        ),
    )
    image_size = {1: "1K", 2: "2K", 4: "4K"}[scale]
    return {"aspect_ratio": aspect_ratio, "image_size": image_size}


def _relay_size_hint(
    size: str | None,
    image_config: dict[str, str] | None,
) -> str | None:
    """Work around a New API distributor boundary bug for square 4K images.

    Some relays infer the tier from `size` with `longest_side > 4096`.
    Consequently an exact 4096x4096 request is incorrectly routed as 2K even
    though Google's image_config explicitly says 1:1/4K.  A one-pixel
    compatibility hint crosses that boundary; Gemini still returns its native
    documented 4096x4096 output because image_config remains authoritative.
    """
    if image_config == {"aspect_ratio": "1:1", "image_size": "4K"}:
        return "4097x4097"
    return size


def _chat_payload(
    prompt: str,
    images: list[bytes],
    size: str | None,
) -> dict[str, Any]:
    """Build a relay-compatible Gemini image request.

    Different OpenAI-compatible Gemini relays consume the same setting at
    different extension points.  In particular, New API based distributors
    expect the literal `extra_body.google.image_config` object, while some
    upstreams consume `google.image_config` after an OpenAI SDK has flattened
    `extra_body`.  Send both shapes alongside the common compatibility fields.
    Relays ignore extension fields they do not understand; the explicit prompt
    is the final compatibility fallback.
    """
    image_config = _chat_image_config(size)
    if image_config:
        prompt = (
            f"{prompt}\n\nThe OUTPUT CANVAS must be "
            f"{image_config['aspect_ratio']} at {image_config['image_size']}. "
            "Do not preserve an input image's original aspect ratio."
        )

    if images:
        content: str | list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        for blob in images:
            mime, _ = _image_type(blob)
            encoded = base64.b64encode(blob).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{encoded}"},
                }
            )
    else:
        content = prompt

    request_model = _model()
    payload: dict[str, Any] = {
        "model": request_model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.7,
    }
    if image_config:
        # Gemini image models exposed through OpenAI-compatible chat use the
        # Google extension object for hard resolution/aspect-ratio controls.
        # Keep standard `size` too for relays that translate that field instead.
        payload["modalities"] = ["text", "image"]
        payload["size"] = _relay_size_hint(size, image_config)
        camel_image_config = {
            "aspectRatio": image_config["aspect_ratio"],
            "imageSize": image_config["image_size"],
        }
        google_extension = {"image_config": image_config}
        payload["google"] = google_extension
        # Send every commonly accepted relay shape for both Gemini models.
        # The Flash preview path previously omitted these fields and silently
        # fell back to its default 1:1 / 1K output.
        payload["aspect_ratio"] = image_config["aspect_ratio"]
        payload["image_size"] = image_config["image_size"]
        payload["image_config"] = image_config
        payload["generation_config"] = {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": camel_image_config,
            "responseFormat": {"image": camel_image_config},
        }
        payload["extra_body"] = {"google": google_extension}
    return payload


def _chat_image(prompt: str, images: list[bytes], size: str | None):
    endpoint = f"{_base_url()}/chat/completions"
    payload = _chat_payload(prompt, images, size)
    response = _json(
        _http(
            endpoint,
            method="POST",
            body=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            timeout=_submission_timeout(),
        )
    )
    image = _finished_asset(response) or _asset_from_chat_value(response)
    if image is None:
        preview = json.dumps(response, ensure_ascii=False)[:800]
        raise RuntimeError(f"新渠道多模态响应中没有图片：{preview}")
    return image


def _await_result(endpoint: str, response: dict[str, Any]):
    immediate = _finished_asset(response)
    if immediate is not None:
        return immediate
    task_id = response.get("id") or response.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        preview = json.dumps(response, ensure_ascii=False)[:500]
        raise RuntimeError(f"新渠道 API 响应中没有图片或任务 id：{preview}")
    deadline = time.monotonic() + _timeout()
    poll_endpoint = endpoint
    generation_endpoint = f"{_base_url()}/images/generations"
    while time.monotonic() < deadline:
        try:
            status_response = _json(
                _http(
                    f"{poll_endpoint}/{task_id}",
                    timeout=min(30, _timeout()),
                )
            )
        except RuntimeError as exc:
            # Several relays use the generations status route for every image task,
            # including jobs created through /images/edits.
            if (
                poll_endpoint.endswith("/images/edits")
                and "新渠道 API HTTP 404" in str(exc)
            ):
                poll_endpoint = generation_endpoint
                status_response = _json(
                    _http(
                        f"{poll_endpoint}/{task_id}",
                        timeout=min(30, _timeout()),
                    )
                )
            else:
                raise
        image = _finished_asset(status_response)
        if image is not None:
            return image
        status = str(status_response.get("status") or "").lower()
        if status in {"failed", "error", "cancelled", "canceled"}:
            detail = status_response.get("error") or status_response.get("message") or status
            raise RuntimeError(f"新渠道图片任务失败：{detail}")
        time.sleep(2)
    raise RuntimeError(f"新渠道图片任务超时（{_timeout()} 秒），任务 id：{task_id}")


def _multipart(fields: dict[str, str], files: list[tuple[str, str, str, bytes]]) -> tuple[bytes, str]:
    boundary = "----dianmeng" + os.urandom(12).hex()
    marker = boundary.encode()
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.extend([b"--" + marker, f'Content-Disposition: form-data; name="{name}"'.encode(), b"", value.encode()])
    for field, filename, mime, content in files:
        parts.extend([b"--" + marker, f'Content-Disposition: form-data; name="{field}"; filename="{filename}"'.encode(), f"Content-Type: {mime}".encode(), b"", content])
    parts.extend([b"--" + marker + b"--", b""])
    return b"\r\n".join(parts), f"multipart/form-data; boundary={boundary}"


def _image_type(blob: bytes) -> tuple[str, str]:
    if blob.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if blob.startswith(b"RIFF") and blob[8:12] == b"WEBP":
        return "image/webp", "webp"
    return "image/png", "png"


def _images_generate(prompt: str, size: str | None):
    endpoint = f"{_base_url()}/images/generations"
    model = _model()
    payload: dict[str, Any] = {"model": model, "prompt": prompt, "n": 1}
    effective_size = _size_for_model(model, size)
    image_config = _chat_image_config(effective_size)
    if effective_size:
        payload["size"] = (
            _relay_size_hint(effective_size, image_config)
            if model.lower().startswith("gemini-")
            else effective_size
        )
    if image_config and model.lower().startswith("gemini-"):
        payload["aspect_ratio"] = image_config["aspect_ratio"]
        payload["image_size"] = image_config["image_size"]
        payload["generation_config"] = {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": image_config["aspect_ratio"],
                "imageSize": image_config["image_size"],
            },
        }
    if _async_enabled():
        payload["async"] = True
    body = json.dumps(payload).encode("utf-8")
    response = _json(
        _http(
            endpoint,
            method="POST",
            body=body,
            content_type="application/json",
            timeout=_submission_timeout(),
        )
    )
    return _await_result(endpoint, response)


def _images_edit(prompt: str, images: list[bytes], size: str | None):
    endpoint = f"{_base_url()}/images/edits"
    model = _model()
    fields = {"model": model, "prompt": prompt, "n": "1"}
    effective_size = _size_for_model(model, size)
    image_config = _chat_image_config(effective_size)
    if effective_size:
        fields["size"] = (
            _relay_size_hint(effective_size, image_config)
            if model.lower().startswith("gemini-")
            else effective_size
        )
    if image_config and model.lower().startswith("gemini-"):
        fields["aspect_ratio"] = image_config["aspect_ratio"]
        fields["image_size"] = image_config["image_size"]
        fields["generation_config"] = json.dumps(
            {
                "responseModalities": ["IMAGE"],
                "imageConfig": {
                    "aspectRatio": image_config["aspect_ratio"],
                    "imageSize": image_config["image_size"],
                },
            }
        )
    if _edit_async_enabled():
        fields["async"] = "true"
    fixed_gpt_image = bool(
        re.search(r"(?:^|-)gpt-image-2-(?:1k|2k|4k)$", model, re.IGNORECASE)
    )
    field = "image" if len(images) == 1 or fixed_gpt_image else "image[]"
    files = []
    for index, blob in enumerate(images):
        mime, extension = _image_type(blob)
        files.append((field, f"image_{index}.{extension}", mime, blob))
    body, content_type = _multipart(fields, files)
    response = _json(
        _http(
            endpoint,
            method="POST",
            body=body,
            content_type=content_type,
            timeout=_submission_timeout(),
        )
    )
    return _await_result(endpoint, response)


def _run_protocol_fallback(*attempts: tuple[str, Any]):
    errors: list[str] = []
    for label, operation in attempts:
        try:
            return operation()
        except SubmissionTimeout:
            # A timed-out POST may still have reached the upstream. Retrying a
            # second protocol could create and bill a duplicate image.
            raise
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label}: {exc}")
    raise RuntimeError("新渠道所有兼容协议均失败：\n" + "\n".join(errors))


def _generate(prompt: str, size: str | None):
    model = _model().lower()
    chat = ("多模态 /chat/completions", lambda: _chat_image(prompt, [], size))
    images = ("Images /images/generations", lambda: _images_generate(prompt, size))
    return _run_protocol_fallback(*(chat, images) if model.startswith("gemini-") else (images, chat))


def _edit(prompt: str, images: list[bytes], size: str | None):
    model = _model().lower()
    chat = ("多模态 /chat/completions", lambda: _chat_image(prompt, images, size))
    edits = ("Images /images/edits", lambda: _images_edit(prompt, images, size))
    return _run_protocol_fallback(*(chat, edits) if model.startswith("gemini-") else (edits, chat))


@node_slot(NodeSlots.IMAGE_GEN)
def image_gen(input: ImageGenInput) -> ImageGenOutput:
    prompt = (input.text or "").strip()
    if not prompt:
        return ImageGenOutput(success=False, error="请输入图片提示词")
    image = _generate(prompt, _size(input.width, input.height))
    return ImageGenOutput(success=True, image=image)


@node_slot(NodeSlots.IMAGE_EDIT)
def image_edit(input: ImageEditInput) -> ImageEditOutput:
    image = _edit(input.text, [prompt_media_to_bytes(input.image)], _size(input.width, input.height))
    return ImageEditOutput(success=True, image=image)


@node_slot(NodeSlots.IMAGE_FUSION)
def image_fusion(input: ImageFusionInput) -> ImageFusionOutput:
    images = [prompt_media_to_bytes(item) for item in (input.images or [])]
    if not images:
        image = _generate(input.text, _size(input.width, input.height))
    else:
        image = _edit(input.text, images, _size(input.width, input.height))
    return ImageFusionOutput(success=True, image=image)


_HANDLERS: dict[str, Any] = {
    NodeSlots.IMAGE_GEN: image_gen,
    NodeSlots.IMAGE_EDIT: image_edit,
    NodeSlots.IMAGE_FUSION: image_fusion,
}


def main() -> int:
    global _REQUEST_MODEL
    try:
        request = json.loads(sys.stdin.read() or "{}")
        requested_model = str(request.get("model") or "").strip()
        _REQUEST_MODEL = (
            requested_model if requested_model in SUPPORTED_IMAGE_MODELS else ""
        )
        handler = _HANDLERS.get(str(request.get("nodeSlot") or ""))
        if handler is None:
            raise RuntimeError(f"不支持的节点类型：{request.get('nodeSlot')}")
        result = handler(request.get("prompt") or {})
    except Exception as exc:  # noqa: BLE001
        result = {"success": False, "error": str(exc)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
    return 0 if not isinstance(result, dict) or result.get("success", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
