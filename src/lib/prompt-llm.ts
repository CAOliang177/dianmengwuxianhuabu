import { createTask, getTask } from "@/lib/api/task";
import { getTaskWaitUrl } from "@/lib/task/api-url";
import { normalizeTaskPayloadData } from "@/lib/task/payload";

export const PROMPT_LLM_PLUGIN_ID = "tongflow-api-prompt-llm";

type PromptLlmRequest = {
    input: string;
    instruction: string;
    timeoutMs?: number;
};

function extractGeneratedText(value: unknown): string {
    const payload = normalizeTaskPayloadData(value);
    if (!payload) return "";
    for (const key of ["text", "output_text", "content"]) {
        const candidate = payload[key];
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return "";
}

function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

type PromptTaskMessage = {
    status?: string;
    data?: unknown;
    error?: string;
};

function taskError(message: PromptTaskMessage): string {
    const payload = normalizeTaskPayloadData(message.data);
    const nested = payload?.error ?? payload?.message;
    return (
        message.error ||
        (typeof nested === "string" ? nested : "") ||
        "大语言模型提示词任务失败"
    );
}

async function recoverPromptTask(taskId: string, deadline: number) {
    while (Date.now() < deadline) {
        const { task } = await getTask(taskId);
        const status = String(task.status).toLowerCase();
        if (status === "completed") {
            const text = extractGeneratedText(task.result);
            if (!text) {
                throw new Error("大语言模型任务已完成，但没有返回可用提示词");
            }
            return text;
        }
        if (["failed", "cancelled", "canceled"].includes(status)) {
            throw new Error(task.error || "大语言模型提示词任务失败");
        }
        await wait(700);
    }
    throw new Error("大语言模型提示词任务超时，请检查接口地址或稍后重试");
}

function runPromptTask(taskId: string, deadline: number): Promise<string> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const eventSource = new EventSource(getTaskWaitUrl(taskId));
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            eventSource.close();
            callback();
        };
        const timeout = setTimeout(
            () => {
                finish(() =>
                    reject(
                        new Error(
                            "大语言模型提示词任务超时，请检查接口地址或稍后重试",
                        ),
                    ),
                );
            },
            Math.max(1, deadline - Date.now()),
        );

        eventSource.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as PromptTaskMessage;
                const status = String(message.status ?? "").toUpperCase();
                if (status === "COMPLETED") {
                    const text = extractGeneratedText(message.data);
                    finish(() => {
                        if (text) resolve(text);
                        else {
                            void recoverPromptTask(taskId, deadline).then(
                                resolve,
                                reject,
                            );
                        }
                    });
                } else if (status === "FAILED" || status === "CANCELLED") {
                    finish(() => reject(new Error(taskError(message))));
                }
            } catch (cause) {
                finish(() =>
                    reject(
                        cause instanceof Error
                            ? cause
                            : new Error("无法解析大语言模型任务结果"),
                    ),
                );
            }
        };

        // The stream starts execution. If the connection drops after dispatch,
        // recover the final result from the persisted task instead of rerunning it.
        eventSource.onerror = () => {
            finish(() => {
                void recoverPromptTask(taskId, deadline).then(resolve, reject);
            });
        };
    });
}

/** Run the bundled OpenAI-compatible prompt model through the normal task runner. */
export async function generatePromptWithLlm({
    input,
    instruction,
    timeoutMs = 150_000,
}: PromptLlmRequest): Promise<string> {
    if (!input.trim()) throw new Error("请输入需要优化的内容");
    if (!instruction.trim()) throw new Error("提示词 Skill 指令不能为空");

    const { taskId } = await createTask({
        feature: "gen-text",
        pluginId: PROMPT_LLM_PLUGIN_ID,
        prompt: {
            text: input.trim(),
            userPrompt: instruction.trim(),
        },
        nodeId: `prompt-llm-${Date.now()}`,
    });
    const deadline = Date.now() + timeoutMs;
    return await runPromptTask(taskId, deadline);
}
