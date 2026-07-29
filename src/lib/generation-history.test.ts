import { describe, expect, it } from "vitest";
import {
    generationTaskId,
    sortGenerationHistoryRecords,
} from "./generation-history";

describe("generation history ordering", () => {
    it("extracts task ids from Windows and URL-style file keys", () => {
        expect(generationTaskId("tasks\\task-new\\image.png")).toBe("task-new");
        expect(generationTaskId("/uploads/tasks/task-old/image.png")).toBe(
            "task-old",
        );
        expect(generationTaskId("uploads/image.png")).toBeNull();
    });

    it("sorts newest first and keeps the newest duplicate timestamp", () => {
        const records = sortGenerationHistoryRecords([
            { fileKey: "tasks/old/a.png", createdAt: 100 },
            { fileKey: "tasks/new/b.png", createdAt: 300 },
            { fileKey: "tasks/middle/c.png", createdAt: 200 },
            { fileKey: "tasks/old/a.png", createdAt: 400 },
        ]);

        expect(records).toEqual([
            { fileKey: "tasks/old/a.png", createdAt: 400 },
            { fileKey: "tasks/new/b.png", createdAt: 300 },
            { fileKey: "tasks/middle/c.png", createdAt: 200 },
        ]);
    });
});
