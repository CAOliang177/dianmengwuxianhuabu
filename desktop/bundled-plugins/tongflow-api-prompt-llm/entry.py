from __future__ import annotations

import http.client
import json
import os
import socket
import ssl
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from tongflow.models.gen_text import GenTextInput, GenTextOutput
from tongflow.node_slots import NodeSlots
from tongflow.slots import node_slot


DEFAULT_BASE_URL = "https://api.openai.com/v1"
_REQUEST_MODEL = ""
_MULTIMODAL_PREFIX = "__DIANMENG_MULTIMODAL_V1__"


def _env(name: str, fallback: str = "") -> str:
    return (os.environ.get(name) or fallback).strip()


def _api_key() -> str:
    key = _env("PROMPT_LLM_API_KEY")
    if not key:
        raise RuntimeError(
            "请在设置中填写 PROMPT_LLM_API_KEY（三方 GPT API Key）"
        )
    return key


def _model() -> str:
    model = _REQUEST_MODEL or _env("PROMPT_LLM_MODEL")
    if not model:
        raise RuntimeError(
            "请在设置中填写 PROMPT_LLM_MODEL（三方接口支持的模型 ID）"
        )
    return model


def _endpoint() -> str:
    base_url = _env("PROMPT_LLM_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    if not base_url:
        raise RuntimeError("请在设置中填写 PROMPT_LLM_BASE_URL")
    if base_url.endswith("/chat/completions"):
        return base_url
    return f"{base_url}/chat/completions"


def _timeout() -> int:
    try:
        return max(10, min(600, int(_env("PROMPT_LLM_TIMEOUT", "120"))))
    except ValueError:
        return 120


def _parse_multimodal_source(source: str) -> tuple[str, list[dict[str, str]]]:
    if not source.startswith(_MULTIMODAL_PREFIX):
        return source, []
    try:
        payload = json.loads(source[len(_MULTIMODAL_PREFIX) :])
    except json.JSONDecodeError as exc:
        raise RuntimeError("Agent 多模态素材数据损坏，请重新选择节点后再试") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Agent 多模态素材格式错误")
    text = str(payload.get("text") or "").strip()
    media: list[dict[str, str]] = []
    values = payload.get("media")
    if isinstance(values, list):
        for item in values[:6]:
            if not isinstance(item, dict) or item.get("type") != "image":
                continue
            url = str(item.get("url") or "").strip()
            if not url.startswith(("data:image/", "https://", "http://")):
                continue
            media.append(
                {
                    "type": "image",
                    "url": url,
                    "label": str(item.get("label") or "视觉参考").strip(),
                }
            )
    return text, media


def _redact(value: object, limit: int = 1200) -> str:
    text = str(value)
    secret = _env("PROMPT_LLM_API_KEY")
    if secret:
        text = text.replace(secret, "***")
    return text[:limit]


def _error_message(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return _redact(text)
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            return _redact(error.get("message") or error.get("code") or error)
        if error:
            return _redact(error)
        return _redact(payload.get("message") or payload)
    return _redact(payload)


def _post_json(body: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        _endpoint(),
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Connection": "close",
            "User-Agent": "dianmeng-infinite-canvas/0.1",
        },
    )
    last_error: Exception | None = None
    deadline = time.monotonic() + _timeout()
    for attempt in range(4):
        remaining = max(1.0, deadline - time.monotonic())
        try:
            with urlopen(request, timeout=remaining) as response:  # noqa: S310
                raw = response.read()
            payload = json.loads(raw.decode("utf-8", errors="replace"))
            if not isinstance(payload, dict):
                raise RuntimeError("大语言模型 API 返回格式错误：顶层不是对象")
            return payload
        except HTTPError as exc:
            raw = exc.read()
            message = _error_message(raw)
            if exc.code in {408, 409, 425, 429} or exc.code >= 500:
                last_error = RuntimeError(
                    f"大语言模型 API HTTP {exc.code}: {message}"
                )
            else:
                raise RuntimeError(
                    f"大语言模型 API HTTP {exc.code}: {message}"
                ) from exc
        except (
            URLError,
            ssl.SSLError,
            socket.timeout,
            TimeoutError,
            ConnectionError,
            OSError,
            http.client.IncompleteRead,
            http.client.RemoteDisconnected,
        ) as exc:
            last_error = exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("大语言模型 API 返回的不是有效 JSON") from exc
        if attempt < 3 and time.monotonic() < deadline:
            time.sleep(min(1.2 * (2**attempt), max(0.0, deadline - time.monotonic())))
        if time.monotonic() >= deadline:
            break
    raise RuntimeError(f"无法连接大语言模型 API：{_redact(last_error)}") from last_error


def _content_text(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("output_text")
                if isinstance(text, dict):
                    text = text.get("value") or text.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(part.strip() for part in parts if part.strip()).strip()
    return ""


def _extract_text(payload: dict[str, Any]) -> str:
    direct = _content_text(payload.get("output_text"))
    if direct:
        return direct
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        choice = choices[0]
        if isinstance(choice, dict):
            message = choice.get("message")
            if isinstance(message, dict):
                for key in ("content", "output_text", "reasoning_content"):
                    content = _content_text(message.get(key))
                    if content:
                        return content
            content = _content_text(choice.get("text"))
            if content:
                return content
    output = payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = _content_text(item.get("content"))
            if content:
                return content
    for key in ("response", "answer", "content", "text"):
        content = _content_text(payload.get(key))
        if content:
            return content
    fields = ", ".join(sorted(str(key) for key in payload.keys())[:12])
    raise RuntimeError(
        "大语言模型 API 没有返回可用文本，请检查接口是否兼容 OpenAI "
        f"Chat Completions 格式（实际字段：{fields or '空响应'}）"
    )


@node_slot(NodeSlots.GEN_TEXT)
def gen_text(input: GenTextInput) -> GenTextOutput:
    source, media = _parse_multimodal_source(input.text.strip())
    if not source:
        raise RuntimeError("大语言模型输入不能为空")
    instruction = (input.userPrompt or "").strip() or (
        "你是专业的 AIGC 提示词导演。理解用户意图后，只输出可以直接提交给生成模型的最终提示词，不解释过程。"
    )
    role = _env("PROMPT_LLM_INSTRUCTION_ROLE", "system").lower()
    if role not in {"system", "developer"}:
        role = "system"
    user_content: str | list[dict[str, Any]] = source
    if media:
        visual_parts: list[dict[str, Any]] = [
            {"type": "text", "text": source},
            {
                "type": "text",
                "text": "以下是用户实际选择的图片原图或视频关键帧，请先观察画面再分析。",
            },
        ]
        for item in media:
            visual_parts.append(
                {"type": "text", "text": f"视觉附件：{item['label']}"}
            )
            visual_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": item["url"], "detail": "high"},
                }
            )
        user_content = visual_parts
    body: dict[str, Any] = {
        "model": _model(),
        "messages": [
            {"role": role, "content": instruction},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
    }
    try:
        max_tokens = max(128, int(_env("PROMPT_LLM_MAX_TOKENS", "2400")))
    except ValueError:
        max_tokens = 2400
    token_param = _env("PROMPT_LLM_TOKEN_PARAM", "max_tokens")
    if token_param not in {"max_tokens", "max_completion_tokens"}:
        token_param = "max_tokens"
    body[token_param] = max_tokens
    raw_temperature = _env("PROMPT_LLM_TEMPERATURE")
    if raw_temperature:
        try:
            body["temperature"] = min(2.0, max(0.0, float(raw_temperature)))
        except ValueError:
            pass
    return GenTextOutput(success=True, text=_extract_text(_post_json(body)))


_HANDLERS: dict[str, Any] = {NodeSlots.GEN_TEXT: gen_text}


def main() -> int:
    global _REQUEST_MODEL
    try:
        request = json.loads(sys.stdin.read() or "{}")
        _REQUEST_MODEL = str(request.get("model") or "").strip()
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
