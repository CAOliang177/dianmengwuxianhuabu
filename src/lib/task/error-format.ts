import type {
    SerializedTaskError,
    SerializedWorkflowFailure,
} from "@/lib/task/error-envelope";

export function humanizeTaskErrorForDisplay(raw: string): string {
    const message = raw.trim();
    if (
        /image task input size must be between 1 and 20971520 bytes/i.test(
            message,
        )
    ) {
        return "输入或参考图片读取失败，或单张图片超过 20 MB。请逐张检查参考图；重新上传空文件或已丢失的图片，并压缩超过 20 MB 的图片后重试。";
    }
    return message;
}

/** Human line from persisted `tasks.error` JSON (`SerializedTaskError`); returns the raw string on parse failure. */
export function formatStoredTaskErrorForDisplay(
    raw: string | null | undefined,
): string {
    if (!raw) return "";

    try {
        const o = JSON.parse(raw) as Partial<SerializedTaskError>;
        if (typeof o.message === "string" && o.message.trim()) {
            return humanizeTaskErrorForDisplay(o.message);
        }
    } catch {
        /* Malformed write — best-effort display below. */
    }

    return humanizeTaskErrorForDisplay(raw);
}

/**
 * Build the full, copyable detail text from a task failure — the top-level
 * message plus per-node `failures[]` and any extra `errors[]` summaries.
 * Shared by the persistent error toast and the left-nav task list.
 * Returns `undefined` when there is nothing beyond the headline message.
 */
export function buildTaskErrorDetail(input: {
    message?: string | null;
    errors?: string[] | null;
    failures?: SerializedWorkflowFailure[] | null;
}): string | undefined {
    const lines: string[] = [];

    for (const f of input.failures ?? []) {
        if (!f) continue;
        const head = f.nodeId ? `[${f.nodeId}] ${f.summary}` : f.summary;
        lines.push(head);
        if (f.details?.trim()) {
            lines.push(
                f.details
                    .trim()
                    .split("\n")
                    .map((l) => `  ${l}`)
                    .join("\n"),
            );
        }
    }

    const headline = input.message?.trim();
    for (const e of input.errors ?? []) {
        const s = e?.trim();
        // Skip summaries already implied by the headline.
        if (s && s !== headline) lines.push(s);
    }

    const detail = lines.join("\n").trim();
    return detail.length > 0 ? detail : undefined;
}

/** Full detail text from persisted `tasks.error` JSON; `undefined` if none. */
export function formatStoredTaskErrorDetail(
    raw: string | null | undefined,
): string | undefined {
    if (!raw) return undefined;
    try {
        const o = JSON.parse(raw) as Partial<SerializedTaskError>;
        return buildTaskErrorDetail({
            message: o.message,
            failures: o.failures,
        });
    } catch {
        return undefined;
    }
}
