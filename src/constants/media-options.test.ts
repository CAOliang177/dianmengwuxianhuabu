import { describe, expect, it } from "vitest";
import {
    IMAGE_ASPECT_RATIOS,
    IMAGE_RESOLUTION_TIERS,
    normalizeImageDimensions,
} from "./media-options";

const EXPECTED_RATIOS = [
    "1:1",
    "5:4",
    "9:16",
    "21:9",
    "16:9",
    "3:2",
    "4:3",
    "4:5",
    "3:4",
    "2:3",
];

describe("image aspect ratio contract", () => {
    it("exposes only the supported ratios in the canvas order", () => {
        expect(IMAGE_ASPECT_RATIOS.map((ratio) => ratio.value)).toEqual(
            EXPECTED_RATIOS,
        );
    });

    it("normalizes legacy approximate dimensions to an exact supported ratio", () => {
        expect(normalizeImageDimensions(680, 1024)).toMatchObject({
            ratio: expect.objectContaining({ value: "2:3" }),
            tier: expect.objectContaining({ value: "1k" }),
            width: 768,
            height: 1152,
        });
    });

    it("keeps every ratio exact at every resolution tier", () => {
        for (const ratio of IMAGE_ASPECT_RATIOS) {
            const [ratioWidth, ratioHeight] = ratio.value
                .split(":")
                .map(Number);
            for (const tier of IMAGE_RESOLUTION_TIERS) {
                const normalized = normalizeImageDimensions(
                    ratio.width * tier.scale,
                    ratio.height * tier.scale,
                    tier,
                );
                expect(normalized.width * ratioHeight).toBe(
                    normalized.height * ratioWidth,
                );
            }
        }
    });
});
