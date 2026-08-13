import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, getTask } from "@/lib/api/task";
import {
    encodePromptLlmInput,
    generatePromptWithLlm,
    PROMPT_LLM_MULTIMODAL_PREFIX,
    PROMPT_LLM_PLUGIN_ID,
} from "@/lib/prompt-llm";

vi.mock("@/lib/api/task", () => ({
    createTask: vi.fn(),
    getTask: vi.fn(),
}));

class MockEventSource {
    static latest: MockEventSource | undefined;
    readonly url: string;
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    onerror: (() => void) | null = null;
    close = vi.fn();

    constructor(url: string | URL) {
        this.url = String(url);
        MockEventSource.latest = this;
    }
}

describe("generatePromptWithLlm", () => {
    beforeEach(() => {
        vi.mocked(createTask).mockResolvedValue({ taskId: "task-llm-1" });
        vi.mocked(getTask).mockReset();
        MockEventSource.latest = undefined;
        vi.stubGlobal("EventSource", MockEventSource);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("starts the task through SSE and returns the generated text", async () => {
        const pending = generatePromptWithLlm({
            input: "原始想法",
            instruction: "Skill 方法",
        });

        await vi.waitFor(() => expect(MockEventSource.latest).toBeDefined());
        const source = MockEventSource.latest as MockEventSource;
        expect(source.url).toBe("/api/task/wait?taskId=task-llm-1");
        source.onmessage?.({
            data: JSON.stringify({
                id: "task-llm-1",
                status: "COMPLETED",
                data: { success: true, text: "模型生成的最终提示词" },
            }),
        } as MessageEvent<string>);

        await expect(pending).resolves.toBe("模型生成的最终提示词");
        expect(source.close).toHaveBeenCalledOnce();
        expect(createTask).toHaveBeenCalledWith({
            feature: "gen-text",
            pluginId: PROMPT_LLM_PLUGIN_ID,
            prompt: { text: "原始想法", userPrompt: "Skill 方法" },
            nodeId: expect.stringMatching(/^prompt-llm-/),
        });
    });

    it("surfaces the plugin error instead of falling back to a template", async () => {
        const pending = generatePromptWithLlm({
            input: "原始想法",
            instruction: "Skill 方法",
        });
        await vi.waitFor(() => expect(MockEventSource.latest).toBeDefined());
        MockEventSource.latest?.onmessage?.({
            data: JSON.stringify({
                status: "FAILED",
                data: { error: "模型 ID 不存在" },
            }),
        } as MessageEvent<string>);

        await expect(pending).rejects.toThrow("模型 ID 不存在");
    });

    it("passes visual attachments through the task protocol", async () => {
        const pending = generatePromptWithLlm({
            input: "分析参考画面",
            instruction: "先看图再回答",
            media: [
                {
                    type: "image",
                    url: "data:image/jpeg;base64,AAA=",
                    label: "视频中段",
                },
            ],
        });

        await vi.waitFor(() => expect(MockEventSource.latest).toBeDefined());
        const call = vi.mocked(createTask).mock.calls[0]?.[0];
        expect(call?.prompt.text).toBe(
            encodePromptLlmInput("分析参考画面", [
                {
                    type: "image",
                    url: "data:image/jpeg;base64,AAA=",
                    label: "视频中段",
                },
            ]),
        );
        expect(call?.prompt.text).toContain(PROMPT_LLM_MULTIMODAL_PREFIX);

        MockEventSource.latest?.onmessage?.({
            data: JSON.stringify({
                status: "COMPLETED",
                data: { text: "已分析画面" },
            }),
        } as MessageEvent<string>);
        await expect(pending).resolves.toBe("已分析画面");
    });
});
