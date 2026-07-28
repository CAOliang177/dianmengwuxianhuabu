import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { reconcileCompletedImageTasks } from "./reconcile-image-results";

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
