import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
    collectAgentContextNodes,
    resolveAgentSelectedNodes,
} from "@/lib/agent-media";

const node = (id: string, type: string): Node => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
});

describe("collectAgentContextNodes", () => {
    it("resolves selected nodes in click order instead of canvas order", () => {
        const image1 = node("image-1", "imageNode");
        const image2 = node("image-2", "imageNode");
        const image3 = node("image-3", "imageNode");

        expect(
            resolveAgentSelectedNodes(
                [image1, image2, image3],
                ["image-3", "image-1", "image-2"],
            ).map((item) => item.id),
        ).toEqual(["image-3", "image-1", "image-2"]);
    });

    it("ignores missing and duplicate reference ids without reordering", () => {
        const image1 = node("image-1", "imageNode");
        const image2 = node("image-2", "imageNode");

        expect(
            resolveAgentSelectedNodes(
                [image1, image2],
                ["image-2", "missing", "image-2", "image-1"],
            ).map((item) => item.id),
        ).toEqual(["image-2", "image-1"]);
    });

    it("adds upstream references for selected video nodes", () => {
        const image = node("image", "imageNode");
        const video = node("video", "textGenVideoNode");
        const unrelated = node("other", "imageNode");
        const edges = [
            { id: "e1", source: "image", target: "video" },
        ] as Edge[];

        expect(
            collectAgentContextNodes({
                nodes: [image, video, unrelated],
                edges,
                selectedNodes: [video],
            }).map((item) => item.id),
        ).toEqual(["video", "image"]);
    });

    it("does not inherit upstream references for selected image nodes", () => {
        const source = node("source", "imageNode");
        const image = node("image", "textGenImageNode");
        const edges = [
            { id: "e1", source: "source", target: "image" },
        ] as Edge[];

        expect(
            collectAgentContextNodes({
                nodes: [source, image],
                edges,
                selectedNodes: [image],
            }).map((item) => item.id),
        ).toEqual(["image"]);
    });
});
