import { describe, expect, it } from "vitest";

import {
    normalizeVideoResolution,
    videoResolutionTiersForModel,
} from "./video-resolution-options";

describe("Seedance video resolution capabilities", () => {
    it("exposes 4K for the standard Seedance 2.0 model", () => {
        expect(
            videoResolutionTiersForModel("doubao-seedance-2-0-260128").map(
                (tier) => tier.value,
            ),
        ).toEqual(["480p", "720p", "1080p", "4k"]);
        expect(
            normalizeVideoResolution("4k", "doubao-seedance-2-0-260128"),
        ).toBe("4k");
    });

    it("does not expose unsupported 4K for Seedance 2.5 or Fast", () => {
        for (const model of [
            "doubao-seedance-2-5-260628",
            "doubao-seedance-2-0-fast-260128",
        ]) {
            expect(
                videoResolutionTiersForModel(model).map((tier) => tier.value),
            ).toEqual(["480p", "720p"]);
            expect(normalizeVideoResolution("4k", model)).toBe("720p");
        }
    });
});
