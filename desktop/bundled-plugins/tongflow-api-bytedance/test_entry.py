from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "sdk"))
SPEC = importlib.util.spec_from_file_location("tongflow_api_bytedance_entry", Path(__file__).with_name("entry.py"))
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("无法加载火山方舟插件")
ENTRY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENTRY)


class Seedance25EditRequestTests(unittest.TestCase):
    def capture_request(
        self,
        *,
        model: str = "doubao-seedance-2-5-260628",
        **kwargs: object,
    ) -> dict[str, object]:
        captured: dict[str, object] = {}

        def fake_http(
            _url: str,
            *,
            method: str = "GET",
            body: bytes | None = None,
        ) -> bytes:
            captured["body"] = json.loads((body or b"{}").decode("utf-8"))
            return b'{"id":"task-1"}'

        with (
            patch.object(ENTRY, "_model", return_value=model),
            patch.object(ENTRY, "_http", side_effect=fake_http),
            patch.object(ENTRY, "_poll_task", return_value=object()),
        ):
            ENTRY._create_task(**kwargs)
        return captured["body"]  # type: ignore[return-value]

    def test_edit_uses_adaptive_ratio_and_source_duration(self) -> None:
        captured: dict[str, object] = {}

        def fake_http(
            _url: str,
            *,
            method: str = "GET",
            body: bytes | None = None,
        ) -> bytes:
            captured["method"] = method
            captured["body"] = json.loads((body or b"{}").decode("utf-8"))
            return b'{"id":"task-1"}'

        with (
            patch.object(ENTRY, "_model", return_value="doubao-seedance-2-5-260628"),
            patch.object(ENTRY, "_http", side_effect=fake_http),
            patch.object(ENTRY, "_poll_task", return_value=object()),
        ):
            ENTRY._create_task(
                "让视频中的人物转身",
                width=1024,
                height=576,
                duration=30,
                asset_ids="video:asset-source-video",
                operation="edit",
            )

        request = captured["body"]
        self.assertIsInstance(request, dict)
        self.assertEqual(request["ratio"], "adaptive")
        self.assertEqual(request["duration"], -1)
        self.assertEqual(captured["method"], "POST")

    def test_edit_requires_exactly_one_video(self) -> None:
        with patch.object(
            ENTRY,
            "_model",
            return_value="doubao-seedance-2-5-260628",
        ):
            with self.assertRaisesRegex(RuntimeError, "必须且只能选择 1 个源视频"):
                ENTRY._create_task(
                    "编辑视频",
                    width=1024,
                    height=576,
                    duration=5,
                    operation="edit",
                )

    def test_edit_rejects_seedance_20(self) -> None:
        with patch.object(
            ENTRY,
            "_model",
            return_value="doubao-seedance-2-0-260128",
        ):
            with self.assertRaisesRegex(RuntimeError, "仅支持 Seedance 2.5"):
                ENTRY._create_task(
                    "编辑视频",
                    width=1024,
                    height=576,
                    duration=5,
                    asset_ids="video:asset-source-video",
                    operation="edit",
                )

    def test_first_frame_role_always_uses_adaptive_ratio(self) -> None:
        request = self.capture_request(
            prompt="人物向前走",
            width=1024,
            height=576,
            duration=5,
            images=[ENTRY.asset(b"image", mime="image/png", filename="frame.png")],
            image_role="first_frame",
        )
        self.assertEqual(request["ratio"], "adaptive")

    def test_reference_mode_overrides_first_frame_words_for_all_models(self) -> None:
        for model in (
            "doubao-seedance-2-0-260128",
            "doubao-seedance-2-0-fast-260128",
            "doubao-seedance-2-5-260628",
        ):
            with self.subTest(model=model):
                original_prompt = "以@图片1作为首帧，人物向前走"
                request = self.capture_request(
                    model=model,
                    prompt=original_prompt,
                    width=1024,
                    height=576,
                    duration=5,
                    asset_ids="image:asset-reference-image",
                )
                self.assertEqual(request["ratio"], "16:9")
                request_text = request["content"][0]["text"]
                self.assertNotIn("首帧", request_text)
                self.assertIn("开场构图参考", request_text)
                self.assertIn("@图片1", request_text)
                self.assertEqual(original_prompt, "以@图片1作为首帧，人物向前走")

    def test_regular_reference_prompt_keeps_selected_ratio(self) -> None:
        request = self.capture_request(
            prompt="参考@图片1的人物造型，人物向前走",
            width=1024,
            height=576,
            duration=5,
            asset_ids="image:asset-reference-image",
        )
        self.assertEqual(request["ratio"], "16:9")

    def test_all_reference_video_cannot_be_reclassified_as_extension(self) -> None:
        prompts = (
            "续写@视频1，让人物向门口走去",
            "从@视频1的尾帧开始继续，人物向门口走去",
            "Extend the input video and let the character walk to the door",
        )
        for model in (
            "doubao-seedance-2-0-260128",
            "doubao-seedance-2-0-fast-260128",
            "doubao-seedance-2-5-260628",
        ):
            for original_prompt in prompts:
                with self.subTest(model=model, prompt=original_prompt):
                    request = self.capture_request(
                        model=model,
                        prompt=original_prompt,
                        width=1024,
                        height=576,
                        duration=8,
                        resolution="480p",
                        asset_ids="video:asset-reference-video",
                        operation="generate",
                    )
                    self.assertEqual(request["ratio"], "16:9")
                    self.assertEqual(request["duration"], 8)
                    self.assertEqual(request["resolution"], "480p")
                    request_text = request["content"][0]["text"]
                    self.assertTrue(request_text.startswith("全能参考生成任务"))
                    self.assertIn("生成独立新视频", request_text)
                    self.assertNotRegex(
                        request_text,
                        r"续写|尾帧开始继续|extend\s+the\s+input\s+video",
                    )
                    self.assertEqual(
                        request["content"][1]["role"],
                        "reference_video",
                    )
    def test_edit_mode_still_uses_adaptive_ratio(self) -> None:
        request = self.capture_request(
            prompt="延长这个视频",
            width=1024,
            height=576,
            duration=8,
            asset_ids="video:asset-source-video",
            operation="edit",
        )
        self.assertEqual(request["ratio"], "adaptive")
        self.assertEqual(request["duration"], -1)
        self.assertNotIn("全能参考生成任务", request["content"][0]["text"])


if __name__ == "__main__":
    unittest.main()
