from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sdk"))


def load_plugin(plugin_id: str) -> ModuleType:
    entry = ROOT / "desktop" / "bundled-plugins" / plugin_id / "entry.py"
    spec = importlib.util.spec_from_file_location(
        f"ratio_contract_{plugin_id.replace('-', '_')}",
        entry,
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    banana = load_plugin("tongflow-api-banana-relay")
    img2 = load_plugin("tongflow-api-img2-relay")
    new_channel = load_plugin("tongflow-api-new-channel")

    os.environ["BANANA_IMAGE_SIZE"] = "1024x1024"
    os.environ["IMG2_IMAGE_SIZE"] = "1024x1024"
    os.environ["NEW_CHANNEL_IMAGE_SIZE"] = "1024x1024"
    os.environ["NEW_CHANNEL_TIMEOUT"] = "600"
    os.environ["NEW_CHANNEL_REQUEST_TIMEOUT"] = "90"

    # The node selection must win over old fixed-size environment settings.
    assert banana._size(2560, 1440) == "2560x1440"
    assert img2._size(1440, 2560) == "1440x2560"
    assert new_channel._size(2048, 2048) == "2048x2048"
    # Legacy/custom values are normalized before any provider receives them.
    # 680x1024 previously reached the relay as unsupported 85:128.
    assert banana._size(680, 1024) == "768x1152"
    assert img2._size(680, 1024) == "768x1152"
    assert new_channel._size(680, 1024) == "768x1152"

    expected_ratios = {
        "1:1": (1, 1),
        "5:4": (5, 4),
        "9:16": (9, 16),
        "21:9": (21, 9),
        "16:9": (16, 9),
        "3:2": (3, 2),
        "4:3": (4, 3),
        "4:5": (4, 5),
        "3:4": (3, 4),
        "2:3": (2, 3),
    }
    assert [item[0] for item in banana.SUPPORTED_ASPECT_RATIOS] == list(
        expected_ratios
    )
    for plugin in (banana, img2, new_channel):
        for model_tier in ("1k", "2k", "4k"):
            for label, ratio_width, ratio_height, width, height in (
                plugin.SUPPORTED_ASPECT_RATIOS
            ):
                fitted = plugin._size_for_model(
                    f"contract-model-{model_tier}",
                    f"{width}x{height}",
                )
                fitted_width, fitted_height = map(int, fitted.split("x"))
                assert fitted_width * ratio_height == fitted_height * ratio_width, (
                    plugin.__name__,
                    model_tier,
                    label,
                    fitted,
                )

    # The no-suffix IMG2 model was intentionally retired.
    assert "gpt-image-2" not in img2.SUPPORTED_IMAGE_MODELS
    assert img2.DEFAULT_MODEL == "gpt-image-2-1k"

    # A synchronous generation/edit POST can legitimately stay open until the
    # image is finished. It must use the full generation timeout rather than
    # being misreported as "not received" after the 90-second async submit
    # window.
    assert new_channel._post_timeout(False) == 600
    assert new_channel._post_timeout(True) == 90

    observed_timeouts: list[int | None] = []

    def fake_http(_url: str, **kwargs):
        observed_timeouts.append(kwargs.get("timeout"))
        return json.dumps({"data": [{"b64_json": "eA=="}]}).encode()

    original_http = new_channel._http
    new_channel._http = fake_http
    try:
        new_channel._REQUEST_MODEL = "gemini-3-pro-image-preview"
        new_channel._chat_image("test", [], "1024x1024")
        assert observed_timeouts.pop() == 600

        os.environ["NEW_CHANNEL_EDIT_ASYNC"] = "false"
        new_channel._images_edit("test", [b"\x89PNG\r\n"], "1024x1024")
        assert observed_timeouts.pop() == 600

        os.environ["NEW_CHANNEL_ASYNC"] = "true"
        new_channel._images_generate("test", "1024x1024")
        assert observed_timeouts.pop() == 90
    finally:
        new_channel._http = original_http

    new_channel._REQUEST_MODEL = "gemini-3-pro-image-preview"
    payload = new_channel._chat_payload("test", [], "2560x1440")
    assert payload["size"] == "2560x1440"
    assert payload["aspect_ratio"] == "16:9"
    assert payload["image_size"] == "2K"
    assert payload["image_config"] == {
        "aspect_ratio": "16:9",
        "image_size": "2K",
    }
    assert payload["generation_config"]["imageConfig"] == {
        "aspectRatio": "16:9",
        "imageSize": "2K",
    }
    assert payload["extra_body"] == {
        "google": {
            "image_config": {
                "aspect_ratio": "16:9",
                "image_size": "2K",
            }
        }
    }
    assert payload["google"] == payload["extra_body"]["google"]
    assert "Do not preserve an input image's original aspect ratio" in (
        payload["messages"][0]["content"]
    )

    square_4k = new_channel._chat_payload("test", [], "4096x4096")
    assert square_4k["size"] == "4097x4097"
    assert square_4k["aspect_ratio"] == "1:1"
    assert square_4k["image_size"] == "4K"
    assert square_4k["extra_body"]["google"]["image_config"] == {
        "aspect_ratio": "1:1",
        "image_size": "4K",
    }

    new_channel._REQUEST_MODEL = "gemini-3.1-flash-image-preview"
    preview_2k = new_channel._chat_payload("test", [], "2560x1440")
    assert preview_2k["size"] == "2560x1440"
    assert preview_2k["google"] == {
        "image_config": {
            "aspect_ratio": "16:9",
            "image_size": "2K",
        }
    }
    assert preview_2k["aspect_ratio"] == "16:9"
    assert preview_2k["image_size"] == "2K"
    assert preview_2k["generation_config"]["imageConfig"] == {
        "aspectRatio": "16:9",
        "imageSize": "2K",
    }

    # Ultra-wide 1K must remain 1K even though its canonical long side is 1344.
    ultra_wide_1k = new_channel._chat_payload("test", [], "1344x576")
    assert ultra_wide_1k["aspect_ratio"] == "21:9"
    assert ultra_wide_1k["image_size"] == "1K"

    print("image ratio contract OK")


if __name__ == "__main__":
    main()
