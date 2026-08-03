import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
    buildRecoveredImageNodes,
    reconcileCompletedImageTasks,
} from "./reconcile-image-results";

const now = Date.now();
const node = {
    id: "node-1",
    type: "textGenImageNode",
    position: { x: 0, y: 0 },
    data: {
        generationHistoryVersion: 2,
        generationHistoryRecords: [
            { fileKey: "tasks/old/old.png", createdAt: now - 1000 },
        ],
        fileKeys: ["tasks/old/old.png"],
    },
} satisfies Node;

describe("reconcileCompletedImageTasks", () => {
    it("applies the newest durable result to an unmounted image node", () => {
        const result = reconcileCompletedImageTasks(
            [node],
            [
                {
                    id: "task-1",
                    nodeId: "node-1",
                    feature: "image-fusion",
                    status: "completed",
                    createdAt: now,
                    result: {
                        success: true,
                        image: { file_key: "tasks/task-1/new.png" },
                    },
                },
            ],
        );

        expect(result.changed).toBe(true);
        expect(result.nodes[0].data.fileKeys).toEqual(["tasks/task-1/new.png"]);
        expect(result.nodes[0].data.generationHistory).toEqual([
            "tasks/task-1/new.png",
            "tasks/old/old.png",
        ]);
    });

    it("ignores failed tasks and tasks owned by another node", () => {
        const result = reconcileCompletedImageTasks(
            [node],
            [
                {
                    id: "task-failed",
                    nodeId: "node-1",
                    feature: "image-fusion",
                    status: "failed",
                    result: {
                        image: { file_key: "tasks/task-failed/no.png" },
                    },
                },
                {
                    id: "task-other",
                    nodeId: "node-2",
                    feature: "image-fusion",
                    status: "completed",
                    result: {
                        image: { file_key: "tasks/task-other/no.png" },
                    },
                },
            ],
        );

        expect(result.changed).toBe(false);
        expect(result.nodes).toEqual([node]);
    });
});

describe("buildRecoveredImageNodes", () => {
    it("rebuilds a missing node with all of its completed image history", () => {
        const result = buildRecoveredImageNodes(new Set(), [
            {
                id: "task-new",
                nodeId: "missing-node",
                feature: "image-fusion",
                status: "completed",
                createdAt: now,
                prompt: { text: "恢复这张图片", width: 1920, height: 1080 },
                pluginId: "tongflow-api-new-channel",
                model: "gemini-3-pro-image-preview",
                canvasId: "canvas-original",
                result: { image: { file_key: "tasks/new.png" } },
            },
            {
                id: "task-old",
                nodeId: "missing-node",
                feature: "image-fusion",
                status: "completed",
                createdAt: now - 1000,
                result: { image: { file_key: "tasks/old.png" } },
            },
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].canvasId).toBe("canvas-original");
        expect(result[0].imageCount).toBe(2);
        expect(result[0].node.id).toBe("missing-node");
        expect(result[0].node.data.fileKeys).toEqual(["tasks/new.png"]);
        expect(result[0].node.data.generationHistory).toEqual([
            "tasks/new.png",
            "tasks/old.png",
        ]);
        expect(result[0].node.data.pluginModel).toBe(
            "gemini-3-pro-image-preview",
        );
    });

    it("does not rebuild a node that still exists", () => {
        expect(
            buildRecoveredImageNodes(new Set(["node-1"]), [
                {
                    id: "task-1",
                    nodeId: "node-1",
                    feature: "image-fusion",
                    status: "completed",
                    result: { image: { file_key: "tasks/image.png" } },
                },
            ]),
        ).toEqual([]);
    });

    it("does not resurrect intentionally removed tasks older than retention", () => {
        expect(
            buildRecoveredImageNodes(
                new Set(),
                [
                    {
                        id: "task-old",
                        nodeId: "old-node",
                        feature: "image-fusion",
                        status: "completed",
                        createdAt: now - 8 * 24 * 60 * 60 * 1000,
                        result: { image: { file_key: "tasks/old.png" } },
                    },
                ],
                now,
            ),
        ).toEqual([]);
    });
});
