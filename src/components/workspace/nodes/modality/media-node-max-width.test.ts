import { describe, expect, it } from "vitest";

import {
    normalizedImageAspectRatio,
    normalizedVideoPreviewNodeWidthPx,
} from "./media-node-max-width";

describe("video node preview geometry", () => {
    it.each([
        ["16:9", 1920, 1080, 540],
        ["1:1", 1024, 1024, 405],
        ["9:16", 1080, 1920, 360],
        ["21:9", 2560, 1080, 619],
    ])(
        "uses a responsive node width for %s",
        (_label, width, height, expected) => {
            expect(normalizedVideoPreviewNodeWidthPx(width, height)).toBe(
                expected,
            );
        },
    );

    it("keeps the actual media ratio instead of forcing 16:9", () => {
        expect(normalizedImageAspectRatio(1080, 1920)).toBe(9 / 16);
        expect(normalizedImageAspectRatio(1024, 1024)).toBe(1);
    });
});
