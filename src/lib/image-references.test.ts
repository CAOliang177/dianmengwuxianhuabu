import { describe, expect, it } from "vitest";
import { collectConnectedImageReferences } from "./image-references";

describe("collectConnectedImageReferences", () => {
    it("collects uploaded and generated image nodes in connection order", () => {
        const nodes = new Map([
            ["upload", { type: "imageNode", data: { fileKeys: ["a.png"] } }],
            [
                "generated",
                {
                    type: "textGenImageNode",
                    data: { fileKeys: ["b.png"] },
                },
            ],
        ]);

        expect(
            collectConnectedImageReferences(
                "target",
                [
                    { source: "upload", target: "target" },
                    { source: "generated", target: "target" },
                ],
                (id) => nodes.get(id),
            ),
        ).toEqual(["a.png", "b.png"]);
    });

    it("keeps duplicate images when they come from separate connected nodes", () => {
        const nodes = new Map([
            ["first", { type: "imageNode", data: { fileKeys: ["same.png"] } }],
            ["second", { type: "imageNode", data: { fileKeys: ["same.png"] } }],
        ]);

        expect(
            collectConnectedImageReferences(
                "target",
                [
                    { source: "first", target: "target" },
                    { source: "second", target: "target" },
                ],
                (id) => nodes.get(id),
            ),
        ).toEqual(["same.png", "same.png"]);
    });

    it("ignores non-image sources", () => {
        const nodes = new Map([
            ["video", { type: "videoNode", data: { fileKeys: ["clip.mp4"] } }],
        ]);

        expect(
            collectConnectedImageReferences(
                "target",
                [{ source: "video", target: "target" }],
                (id) => nodes.get(id),
            ),
        ).toEqual([]);
    });
});
