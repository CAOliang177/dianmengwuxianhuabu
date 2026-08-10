from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImagesGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    asset_ids: str | None = None
    duration: float | None = None
    height: int | None = None
    images: list[Asset] | None = None
    videos: list[Asset] | None = None
    audios: list[Asset] | None = None
    resolution: str | None = None
    seed: int | None = None
    width: int | None = None

class ImagesGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

