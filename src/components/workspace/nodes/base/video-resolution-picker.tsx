"use client";

import type { PointerEvent } from "react";

import { ResolutionPicker } from "./resolution-picker";
import {
    normalizeVideoResolution,
    type VideoResolutionValue,
    videoResolutionTiersForModel,
} from "./video-resolution-options";

export {
    isSeedance25Model,
    normalizeVideoResolution,
    type VideoResolutionValue,
    videoResolutionTiersForModel,
} from "./video-resolution-options";

type VideoResolutionPickerProps = {
    model?: string;
    value: VideoResolutionValue;
    onChange: (value: VideoResolutionValue) => void;
    compact?: boolean;
};

export function VideoResolutionPicker({
    model,
    value,
    onChange,
    compact = false,
}: VideoResolutionPickerProps) {
    const tiers = videoResolutionTiersForModel(model);

    const stopCanvasDrag = (event: PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
    };

    return (
        <div className="nodrag" onPointerDown={stopCanvasDrag}>
            <ResolutionPicker
                tiers={tiers}
                value={normalizeVideoResolution(value, model)}
                onChange={(tier) =>
                    onChange(tier.value as VideoResolutionValue)
                }
                compact={compact}
            />
        </div>
    );
}
