from __future__ import annotations

import importlib.util
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

    # The node selection must win over old fixed-size environment settings.
    assert banana._size(2560, 1440) == "2560x1440"
    assert img2._size(1440, 2560) == "1440x2560"
    assert new_channel._size(2048, 2048) == "2048x2048"

    # The no-suffix IMG2 model was intentionally retired.
    assert "gpt-image-2" not in img2.SUPPORTED_IMAGE_MODELS
    assert img2.DEFAULT_MODEL == "gpt-image-2-1k"

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

    print("image ratio contract OK")


if __name__ == "__main__":
    main()
