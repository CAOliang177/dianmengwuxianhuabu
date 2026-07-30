import { describe, expect, it } from "vitest";
import { firstGeneratedCanvasImage } from "./canvas-history";

describe("canvas history covers", () => {
    it("uses the earliest generated image across nodes", () => {
        expect(
            firstGeneratedCanvasImage([
                {
                    type: "textGenImageNode",
                    data: {
                        generationHistoryRecords: [
                            { fileKey: "tasks/new/image.png", createdAt: 300 },
                            {
                                fileKey: "tasks/first/image.png",
                                createdAt: 100,
                            },
                        ],
                    },
                },
                {
                    type: "textGenImageNode",
                    data: {
                        generationHistoryRecords: [
                            {
                                fileKey: "tasks/middle/image.png",
                                createdAt: 200,
                            },
                        ],
                    },
                },
            ]),
        ).toBe("tasks/first/image.png");
    });

    it("ignores uploaded image nodes and supports legacy generated nodes", () => {
        expect(
            firstGeneratedCanvasImage([
                {
                    type: "imageNode",
                    data: { fileKeys: ["uploads/reference.png"] },
                },
                {
                    type: "textGenImageNode",
                    data: {
                        generationHistory: [
                            "tasks/latest/image.png",
                            "tasks/first/image.png",
                        ],
                    },
                },
            ]),
        ).toBe("tasks/first/image.png");
    });
});
