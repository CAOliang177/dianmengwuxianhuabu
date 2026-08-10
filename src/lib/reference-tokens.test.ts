import { describe, expect, it } from "vitest";
import { removeAndRenumberReferenceTokens } from "./reference-tokens";

describe("removeAndRenumberReferenceTokens", () => {
    it("removes deleted references and closes numbering gaps", () => {
        expect(
            removeAndRenumberReferenceTokens(
                "让 @图片1 保持主体，@图片2 控制服装，参考 @图片3 的光线",
                "图片",
                new Set([2]),
            ),
        ).toBe("让 @图片1 保持主体， 控制服装，参考 @图片2 的光线");
    });

    it("can remove more than one reference from one disconnected group", () => {
        expect(
            removeAndRenumberReferenceTokens(
                "@视频1 跟随 @视频2，再参考 @视频3",
                "视频",
                new Set([1, 2]),
            ),
        ).toBe("跟随，再参考 @视频1");
    });
});
