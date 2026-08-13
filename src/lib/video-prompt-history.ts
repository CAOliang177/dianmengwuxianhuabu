export const VIDEO_PROMPT_HISTORY_LIMIT = 50;

export interface VideoPromptHistoryRecord {
    text: string;
    createdAt: number;
    mode?: string;
    model?: string;
    resolution?: string;
    duration?: number;
    width?: number;
    height?: number;
}

export function readVideoPromptHistory(
    data: Record<string, unknown>,
): VideoPromptHistoryRecord[] {
    const raw = Array.isArray(data.promptHistoryRecords)
        ? data.promptHistoryRecords
        : [];
    const records: VideoPromptHistoryRecord[] = [];
    for (const value of raw) {
        if (!value || typeof value !== "object") continue;
        const item = value as Record<string, unknown>;
        if (
            typeof item.text !== "string" ||
            !item.text.trim() ||
            typeof item.createdAt !== "number" ||
            !Number.isFinite(item.createdAt)
        ) {
            continue;
        }
        records.push({
            text: item.text.trim(),
            createdAt: Math.floor(item.createdAt),
            ...(typeof item.mode === "string" && item.mode
                ? { mode: item.mode }
                : {}),
            ...(typeof item.model === "string" && item.model
                ? { model: item.model }
                : {}),
            ...(typeof item.resolution === "string" && item.resolution
                ? { resolution: item.resolution }
                : {}),
            ...(typeof item.duration === "number" &&
            Number.isFinite(item.duration)
                ? { duration: item.duration }
                : {}),
            ...(typeof item.width === "number" && Number.isFinite(item.width)
                ? { width: item.width }
                : {}),
            ...(typeof item.height === "number" && Number.isFinite(item.height)
                ? { height: item.height }
                : {}),
        });
    }
    return records
        .sort((a, b) => b.createdAt - a.createdAt)
        .filter(
            (record, index, list) =>
                list.findIndex(
                    (item) =>
                        item.text === record.text &&
                        item.mode === record.mode &&
                        item.model === record.model &&
                        item.resolution === record.resolution &&
                        item.duration === record.duration &&
                        item.width === record.width &&
                        item.height === record.height,
                ) === index,
        )
        .slice(0, VIDEO_PROMPT_HISTORY_LIMIT);
}

export function withVideoPromptSnapshot(
    data: Record<string, unknown>,
    record: VideoPromptHistoryRecord,
): Record<string, unknown> {
    const history = readVideoPromptHistory({
        ...data,
        promptHistoryRecords: [record, ...readVideoPromptHistory(data)],
    });
    return {
        ...data,
        text: record.text,
        lastSubmittedPrompt: record.text,
        lastSubmittedPromptAt: record.createdAt,
        promptHistoryRecords: history,
    };
}
