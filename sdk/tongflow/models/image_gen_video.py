from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration: float
    image: Asset
    text: str
    asset_ids: str | None = None
    enhance_prompt: bool | None = None
    height: int | None = None
    image_frame_idx: int | None = None
    image_strength: float | None = None
    resolution: str | None = None
    seed: float | None = None
    width: int | None = None

class ImageGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

