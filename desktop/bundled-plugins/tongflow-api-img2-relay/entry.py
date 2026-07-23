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
DEFAULT_MODEL = "gpt-image-2"
FIXED_SKU_PIXEL_BUDGETS = {
    "1k": 1024 * 1024,
    "2k": 2048 * 2048,
    "4k": 3840 * 2160,
}
FIXED_SKU_MAX_SIDE = {"1k": 1024, "2k": 2048, "4k": 3840}

SUPPORTED_IMAGE_MODELS = [
    "gpt-image-2",
    "gpt-image-2-1k",
    "gpt-image-2-2k",
    "gpt-image-2-4k",
]

TONGFLOW_SLOT_MODELS = {
    "image-gen": SUPPORTED_IMAGE_MODELS,
    "image-edit": SUPPORTED_IMAGE_MODELS,
    "image-fusion": SUPPORTED_IMAGE_MODELS,
}

_REQUEST_MODEL = ""


def _env(name: str, fallback: str = "") -> str:
    return (os.environ.get(name) or fallback).strip()


def _base_url() -> str:
    value = _env("IMG2_BASE_URL", _env("OPENAI_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
    if not value.lower().endswith("/v1"):
        value += "/v1"
    return value


def _api_key() -> str:
    value = _env("IMG2_API_KEY", _env("OPENAI_API_KEY"))
    if not value:
        raise RuntimeError("请在设置中填写 IMG2_API_KEY")
    return value


def _model() -> str:
    return _REQUEST_MODEL or _env("IMG2_IMAGE_MODEL", DEFAULT_MODEL)


def _timeout() -> int:
    try:
        return max(30, int(_env("IMG2_TIMEOUT", "600")))
    except ValueError:
        return 600


def _async_enabled() -> bool:
    return _env("IMG2_ASYNC", "true").lower() not in {"0", "false", "no", "off"}


def _edit_async_enabled() -> bool:
    # Some OpenAI-compatible relays accept async edit submissions but do not
    # implement GET /images/edits/{task_id}. Synchronous edits are the safest
    # interoperable default; users can still opt into async polling explicitly.
    return _env("IMG2_EDIT_ASYNC", "false").lower() not in {"0", "false", "no", "off"}


def _size(width: int | None, height: int | None) -> str | None:
    override = _env("IMG2_IMAGE_SIZE")
    if override:
        return override
    return f"{width}x{height}" if width and height else None


def _size_for_model(model: str, size: str | None) -> str | None:
    """Fit a requested size to fixed 1K/2K/4K IMG2 SKUs."""
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
    ratio = width / height

    fitted_width = math.sqrt(pixel_budget * ratio)
    fitted_height = math.sqrt(pixel_budget / ratio)
    scale = min(1.0, max_side / max(fitted_width, fitted_height))
    fitted_width *= scale
    fitted_height *= scale

    def snap(value: float) -> int:
        return max(16, int(round(value / 16)) * 16)

    return f"{snap(fitted_width)}x{snap(fitted_height)}"


def _http(url: str, *, method: str = "GET", body: bytes | None = None,
          content_type: str | None = None) -> bytes:
    headers = {"Authorization": f"Bearer {_api_key()}", "Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=_timeout()) as response:  # noqa: S310
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"IMG2 API HTTP {exc.code} ({url}): {detail or exc.reason}") from exc
    except URLError as exc:
        raise RuntimeError(f"无法连接 IMG2 API ({url}): {exc.reason}") from exc


def _json(body: bytes) -> dict[str, Any]:
    try:
        value = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        preview = body.decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"IMG2 API 返回的不是 JSON：{preview}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("IMG2 API 返回格式错误：顶层不是对象")
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


def _await_result(endpoint: str, response: dict[str, Any]):
    immediate = _finished_asset(response)
    if immediate is not None:
        return immediate
    task_id = response.get("id") or response.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        preview = json.dumps(response, ensure_ascii=False)[:500]
        raise RuntimeError(f"IMG2 API 响应中没有图片或任务 id：{preview}")
    deadline = time.monotonic() + _timeout()
    poll_endpoint = endpoint
    generation_endpoint = f"{_base_url()}/images/generations"
    while time.monotonic() < deadline:
        try:
            status_response = _json(_http(f"{poll_endpoint}/{task_id}"))
        except RuntimeError as exc:
            # Several relays use the generations status route for every image task,
            # including jobs created through /images/edits.
            if (
                poll_endpoint.endswith("/images/edits")
                and "IMG2 API HTTP 404" in str(exc)
            ):
                poll_endpoint = generation_endpoint
                status_response = _json(_http(f"{poll_endpoint}/{task_id}"))
            else:
                raise
        image = _finished_asset(status_response)
        if image is not None:
            return image
        status = str(status_response.get("status") or "").lower()
        if status in {"failed", "error", "cancelled", "canceled"}:
            detail = status_response.get("error") or status_response.get("message") or status
            raise RuntimeError(f"IMG2 图片任务失败：{detail}")
        time.sleep(2)
    raise RuntimeError(f"IMG2 图片任务超时（{_timeout()} 秒），任务 id：{task_id}")


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


def _generate(prompt: str, size: str | None):
    endpoint = f"{_base_url()}/images/generations"
    model = _model()
    payload: dict[str, Any] = {"model": model, "prompt": prompt, "n": 1}
    effective_size = _size_for_model(model, size)
    if effective_size:
        payload["size"] = effective_size
    if _async_enabled():
        payload["async"] = True
    body = json.dumps(payload).encode("utf-8")
    response = _json(_http(endpoint, method="POST", body=body, content_type="application/json"))
    return _await_result(endpoint, response)


def _edit(prompt: str, images: list[bytes], size: str | None):
    endpoint = f"{_base_url()}/images/edits"
    model = _model()
    fields = {"model": model, "prompt": prompt, "n": "1"}
    effective_size = _size_for_model(model, size)
    if effective_size:
        fields["size"] = effective_size
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
    response = _json(_http(endpoint, method="POST", body=body, content_type=content_type))
    return _await_result(endpoint, response)


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
