from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "sdk"))
SPEC = importlib.util.spec_from_file_location(
    "tongflow_api_prompt_llm_entry",
    Path(__file__).with_name("entry.py"),
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("无法加载提示词大模型插件")
ENTRY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENTRY)


class PromptLlmPluginTests(unittest.TestCase):
    def setUp(self) -> None:
        ENTRY._REQUEST_MODEL = ""

    def test_chat_completions_request_uses_configured_model_and_instruction(self) -> None:
        captured: dict[str, object] = {}

        def fake_post(body: dict[str, object]) -> dict[str, object]:
            captured.update(body)
            return {"choices": [{"message": {"content": "最终提示词"}}]}

        with (
            patch.dict(
                os.environ,
                {
                    "PROMPT_LLM_API_KEY": "test-key",
                    "PROMPT_LLM_MODEL": "provider-gpt-model",
                    "PROMPT_LLM_INSTRUCTION_ROLE": "system",
                },
                clear=False,
            ),
            patch.object(ENTRY, "_post_json", side_effect=fake_post),
        ):
            result = ENTRY.gen_text(
                {"text": "一只猫奔跑", "userPrompt": "只输出视频提示词"}
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["text"], "最终提示词")
        self.assertEqual(captured["model"], "provider-gpt-model")
        self.assertEqual(
            captured["messages"],
            [
                {"role": "system", "content": "只输出视频提示词"},
                {"role": "user", "content": "一只猫奔跑"},
            ],
        )
        self.assertFalse(captured["stream"])

    def test_base_url_accepts_root_or_full_endpoint(self) -> None:
        with patch.dict(
            os.environ,
            {"PROMPT_LLM_BASE_URL": "https://provider.example/v1/"},
            clear=False,
        ):
            self.assertEqual(
                ENTRY._endpoint(),
                "https://provider.example/v1/chat/completions",
            )
        with patch.dict(
            os.environ,
            {
                "PROMPT_LLM_BASE_URL": (
                    "https://provider.example/openai/v1/chat/completions"
                )
            },
            clear=False,
        ):
            self.assertEqual(
                ENTRY._endpoint(),
                "https://provider.example/openai/v1/chat/completions",
            )

    def test_content_array_is_supported(self) -> None:
        payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "text", "text": "第一段"},
                            {"type": "text", "text": "第二段"},
                        ]
                    }
                }
            ]
        }
        self.assertEqual(ENTRY._extract_text(payload), "第一段\n第二段")

    def test_reasoning_content_fallback_is_supported(self) -> None:
        payload = {
            "choices": [
                {"message": {"content": "", "reasoning_content": "最终答案"}}
            ]
        }
        self.assertEqual(ENTRY._extract_text(payload), "最终答案")

    def test_sse_response_is_combined_into_output_text(self) -> None:
        raw = (
            'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":" 第二段"}}]}\n\n'
            "data: [DONE]\n"
        ).encode()
        self.assertEqual(
            ENTRY._parse_api_payload(raw),
            {"output_text": "第一段 第二段"},
        )

    def test_json_wrapped_in_string_or_markdown_fence_is_supported(self) -> None:
        wrapped = __import__("json").dumps(
            '{"choices":[{"message":{"content":"字符串 JSON"}}]}'
        ).encode()
        fenced = (
            '```json\n{"choices":[{"message":{"content":"围栏 JSON"}}]}\n```'
        ).encode()
        self.assertEqual(
            ENTRY._extract_text(ENTRY._parse_api_payload(wrapped)),
            "字符串 JSON",
        )
        self.assertEqual(
            ENTRY._extract_text(ENTRY._parse_api_payload(fenced)),
            "围栏 JSON",
        )

    def test_invalid_response_includes_safe_preview(self) -> None:
        with self.assertRaisesRegex(ValueError, "响应开头"):
            ENTRY._parse_api_payload(b"<html>gateway error</html>")

    def test_multimodal_input_becomes_openai_image_parts(self) -> None:
        captured: dict[str, object] = {}

        def fake_post(body: dict[str, object]) -> dict[str, object]:
            captured.update(body)
            return {"choices": [{"message": {"content": "看到了画面"}}]}

        source = ENTRY._MULTIMODAL_PREFIX + __import__("json").dumps(
            {
                "text": "分析画面",
                "media": [
                    {
                        "type": "image",
                        "url": "data:image/jpeg;base64,AAA=",
                        "label": "视频中段",
                    }
                ],
            }
        )
        with (
            patch.dict(
                os.environ,
                {
                    "PROMPT_LLM_API_KEY": "test-key",
                    "PROMPT_LLM_MODEL": "vision-model",
                },
                clear=False,
            ),
            patch.object(ENTRY, "_post_json", side_effect=fake_post),
        ):
            result = ENTRY.gen_text({"text": source, "userPrompt": "观察画面"})

        self.assertEqual(result["text"], "看到了画面")
        messages = captured["messages"]
        self.assertIsInstance(messages, list)
        user_content = messages[1]["content"]
        self.assertEqual(user_content[0], {"type": "text", "text": "分析画面"})
        self.assertEqual(user_content[-1]["type"], "image_url")

    def test_model_must_be_configured(self) -> None:
        with patch.dict(os.environ, {"PROMPT_LLM_MODEL": ""}, clear=False):
            with self.assertRaisesRegex(RuntimeError, "PROMPT_LLM_MODEL"):
                ENTRY._model()


if __name__ == "__main__":
    unittest.main()
