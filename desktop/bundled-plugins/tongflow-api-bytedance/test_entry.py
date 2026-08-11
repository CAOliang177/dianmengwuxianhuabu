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


if __name__ == "__main__":
    unittest.main()
