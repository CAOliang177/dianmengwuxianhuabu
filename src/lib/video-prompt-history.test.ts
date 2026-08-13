import { describe, expect, it } from "vitest";
import {
    readVideoPromptHistory,
    withVideoPromptSnapshot,
} from "@/lib/video-prompt-history";

describe("video prompt history", () => {
    it("stores the submitted prompt as durable node data", () => {
        const data = withVideoPromptSnapshot(
            { text: "旧草稿", pluginId: "video-plugin" },
            {
                text: "最终版提示词",
                createdAt: 200,
                mode: "edit",
                model: "seedance-2.5",
                resolution: "1080p",
                duration: 12,
                width: 1920,
                height: 1080,
            },
        );
        expect(data.text).toBe("最终版提示词");
        expect(data.lastSubmittedPrompt).toBe("最终版提示词");
        expect(data.pluginId).toBe("video-plugin");
        expect(readVideoPromptHistory(data)).toEqual([
            {
                text: "最终版提示词",
                createdAt: 200,
                mode: "edit",
                model: "seedance-2.5",
                resolution: "1080p",
                duration: 12,
                width: 1920,
                height: 1080,
            },
        ]);
    });

    it("keeps the newest copy of a repeated prompt", () => {
        const records = readVideoPromptHistory({
            promptHistoryRecords: [
                { text: "同一提示词", createdAt: 100 },
                { text: "另一版", createdAt: 200 },
                { text: "同一提示词", createdAt: 300 },
            ],
        });
        expect(records.map((record) => record.text)).toEqual([
            "同一提示词",
            "另一版",
        ]);
        expect(records[0]?.createdAt).toBe(300);
    });

    it("keeps the same prompt when its generation parameters differ", () => {
        const records = readVideoPromptHistory({
            promptHistoryRecords: [
                {
                    text: "相同文案",
                    createdAt: 200,
                    mode: "reference",
                    resolution: "1080p",
                },
                {
                    text: "相同文案",
                    createdAt: 100,
                    mode: "reference",
                    resolution: "720p",
                },
            ],
        });
        expect(records).toHaveLength(2);
        expect(records.map((record) => record.resolution)).toEqual([
            "1080p",
            "720p",
        ]);
    });
});
