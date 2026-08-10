import { describe, expect, it } from "vitest";

import {
    materialKind,
    normalizeVolcengineMaterial,
    parseVolcengineMaterials,
} from "./volcengine-material";

describe("Volcengine material normalization", () => {
    it("uses AssetType to identify each material kind", () => {
        expect(materialKind({ AssetType: "Video" })).toBe("video");
        expect(materialKind({ AssetType: "Audio" })).toBe("audio");
        expect(materialKind({ AssetType: "Image" })).toBe("image");
    });

    it("falls back to media file extensions", () => {
        expect(
            materialKind({ URL: "https://example.com/demo.mp4?token=1" }),
        ).toBe("video");
        expect(materialKind({ FileName: "dialogue.wav" })).toBe("audio");
    });

    it("retains video metadata through JSON serialization", () => {
        const normalized = normalizeVolcengineMaterial({
            Id: "asset-video-1",
            Name: "镜头一",
            AssetType: "Video",
            URL: "https://example.com/shot.mp4",
        });
        const parsed = parseVolcengineMaterials(JSON.stringify([normalized]));
        expect(parsed).toEqual([
            {
                id: "asset-video-1",
                name: "镜头一",
                type: "video",
                url: "https://example.com/shot.mp4",
            },
        ]);
    });
});
