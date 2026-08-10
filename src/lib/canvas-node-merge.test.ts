import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { mergeDurableNodeHistory } from "./canvas-node-merge";

function imageNode(
    id: string,
    records: Array<{ fileKey: string; createdAt: number }>,
): Node {
    return {
        id,
        type: "textGenImageNode",
        position: { x: 0, y: 0 },
        data: {
            generationHistoryVersion: 2,
            generationHistoryRecords: records,
            generationHistory: records.map((record) => record.fileKey),
            fileKeys: records[0] ? [records[0].fileKey] : [],
        },
    };
}

describe("mergeDurableNodeHistory", () => {
    it("prevents a stale renderer snapshot from erasing a completed image", () => {
        const now = Date.now();
        const completed = imageNode("node-1", [
            { fileKey: "tasks/new/output.png", createdAt: now },
        ]);
        const stale = imageNode("node-1", [
            { fileKey: "tasks/old/output.png", createdAt: now - 1000 },
        ]);

        const result = mergeDurableNodeHistory([completed], [stale]) as Node[];

        expect(result[0].data.fileKeys).toEqual(["tasks/new/output.png"]);
        expect(result[0].data.generationHistory).toEqual([
            "tasks/new/output.png",
            "tasks/old/output.png",
        ]);
    });

    it("prevents a stale renderer snapshot from erasing completed video history", () => {
        const now = Date.now();
        const completed = imageNode("video-node", [
            { fileKey: "tasks/new/output.mp4", createdAt: now },
        ]);
        const stale = imageNode("video-node", []);
        completed.type = "imagesGenVideoNode";
        stale.type = "imagesGenVideoNode";

        const result = mergeDurableNodeHistory([completed], [stale]) as Node[];

        expect(result[0].data.fileKeys).toEqual(["tasks/new/output.mp4"]);
    });

    it("preserves a node omitted by a stale renderer snapshot", () => {
        const existing = imageNode("newer-node", []);
        expect(mergeDurableNodeHistory([existing], [])).toEqual([existing]);
    });

    it("does not resurrect a node explicitly deleted by the user", () => {
        expect(
            mergeDurableNodeHistory(
                [imageNode("deleted", [])],
                [],
                ["deleted"],
            ),
        ).toEqual([]);
    });
});
