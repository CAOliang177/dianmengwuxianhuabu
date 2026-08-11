export const GENERATION_HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const GENERATION_HISTORY_VERSION = 2;

export interface GenerationHistoryRecord {
    fileKey: string;
    createdAt: number;
    /** Legacy records are images; new video generators set this explicitly. */
    mediaType?: "image" | "video";
    /** Exact prompt submitted for this output, when recorded by the generator. */
    prompt?: string;
    videoMode?: string;
    model?: string;
}

export function normalizeGenerationTimestamp(value: number): number {
    // Some legacy task runners wrote seconds while others wrote
    // microseconds. Normalize both to JavaScript milliseconds so one-week
    // retention and chronological sorting remain reliable after upgrades.
    if (value > 100_000_000_000_000) return Math.floor(value / 1000);
    if (value > 0 && value < 100_000_000_000) return Math.floor(value * 1000);
    return Math.floor(value);
}

export function generationTaskId(fileKey: string): string | null {
    const match = fileKey
        .replace(/\\/g, "/")
        .match(/(?:^|\/)tasks\/([^/]+)(?:\/|$)/i);
    return match?.[1] ?? null;
}

export function sortGenerationHistoryRecords<T extends GenerationHistoryRecord>(
    records: T[],
): T[] {
    const latestByFile = new Map<string, T>();
    for (const record of records) {
        const current = latestByFile.get(record.fileKey);
        if (!current || record.createdAt > current.createdAt) {
            latestByFile.set(record.fileKey, record);
        }
    }
    return [...latestByFile.values()].sort(
        (a, b) =>
            b.createdAt - a.createdAt || a.fileKey.localeCompare(b.fileKey),
    );
}

export function readGenerationHistory(
    data: Record<string, unknown>,
    now = Date.now(),
): GenerationHistoryRecord[] {
    const cutoff = now - GENERATION_HISTORY_RETENTION_MS;
    const records: GenerationHistoryRecord[] = [];
    const rawRecords = Array.isArray(data.generationHistoryRecords)
        ? data.generationHistoryRecords
        : [];

    for (const raw of rawRecords) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        if (
            typeof item.fileKey === "string" &&
            item.fileKey.length > 0 &&
            typeof item.createdAt === "number" &&
            Number.isFinite(item.createdAt)
        ) {
            const createdAt = normalizeGenerationTimestamp(item.createdAt);
            if (createdAt >= cutoff) {
                records.push({
                    fileKey: item.fileKey,
                    createdAt,
                    mediaType: item.mediaType === "video" ? "video" : "image",
                    ...(typeof item.prompt === "string" && item.prompt.trim()
                        ? { prompt: item.prompt.trim() }
                        : {}),
                    ...(typeof item.videoMode === "string" && item.videoMode
                        ? { videoMode: item.videoMode }
                        : {}),
                    ...(typeof item.model === "string" && item.model
                        ? { model: item.model }
                        : {}),
                });
            }
        }
    }

    // Old canvases stored only string file keys. Migrate them once using the
    // upgrade time so users do not lose their existing visible history.
    if (data.generationHistoryVersion !== GENERATION_HISTORY_VERSION) {
        const legacy = Array.isArray(data.generationHistory)
            ? data.generationHistory
            : [];
        for (const value of legacy) {
            if (typeof value === "string" && value.length > 0) {
                records.push({
                    fileKey: value,
                    createdAt: now,
                    mediaType: "image",
                });
            }
        }
    }

    return sortGenerationHistoryRecords(records).slice(0, 1000);
}

export function withGenerationHistory(
    data: Record<string, unknown>,
    records: GenerationHistoryRecord[],
): Record<string, unknown> {
    return {
        ...data,
        generationHistoryVersion: GENERATION_HISTORY_VERSION,
        generationHistoryRecords: records,
        // Keep the legacy field synchronized for compatibility with old builds.
        generationHistory: records.map((record) => record.fileKey),
    };
}

export function generationHistoryNeedsSync(
    data: Record<string, unknown>,
    records: GenerationHistoryRecord[],
): boolean {
    if (data.generationHistoryVersion !== GENERATION_HISTORY_VERSION)
        return true;
    const current = Array.isArray(data.generationHistoryRecords)
        ? data.generationHistoryRecords
        : [];
    return JSON.stringify(current) !== JSON.stringify(records);
}
