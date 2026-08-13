import { getActiveCanvasId, getCanvasHistory } from "@/lib/canvas-history";

type TrackConfig = {
    feature: string;
    pluginId: string;
    model?: string;
    nodeId: string;
    prompt?: Record<string, unknown>;
};

type TaskResult = {
    id: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
    data?: Record<string, unknown>;
    result?: unknown;
    error?: string;
};

type Tracked = TrackConfig & {
    startedAt: number;
    projectId: string;
    projectName: string;
};

type VideoMetadata = {
    mediaType: "video";
    videoDurationSeconds?: number;
    videoResolution?: string;
};

const tracked = new Map<string, Tracked>();
const reported = new Set<string>();

function outputCount(value: unknown, depth = 0): number {
    if (depth > 5 || value == null) return 0;
    if (Array.isArray(value)) {
        return value.reduce<number>(
            (sum, item) => sum + outputCount(item, depth + 1),
            0,
        );
    }
    if (typeof value === "string") {
        return /^(data:image\/|https?:\/\/|\/api\/uploads\/|\/uploads\/)/i.test(value) ? 1 : 0;
    }
    if (typeof value !== "object") return 0;
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" || typeof record.imageUrl === "string" || typeof record.b64_json === "string") return 1;
    return Object.values(record).reduce<number>(
        (sum, item) => sum + outputCount(item, depth + 1),
        0,
    );
}

function finiteNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function requestedVideoMetadata(config: TrackConfig): VideoMetadata | null {
    const feature = config.feature.toLowerCase();
    const model = (config.model || "").toLowerCase();
    if (!feature.includes("video") && !/seedance|veo|kling|wan-video/.test(model)) {
        return null;
    }

    const prompt = config.prompt ?? {};
    const duration = [
        prompt.duration,
        prompt.durationSeconds,
        prompt.duration_seconds,
        prompt.seconds,
    ]
        .map(finiteNumber)
        .find((value) => value > 0);
    const width = finiteNumber(prompt.width);
    const height = finiteNumber(prompt.height);
    const resolution =
        typeof prompt.resolution === "string" && prompt.resolution.trim()
            ? prompt.resolution.trim().toUpperCase()
            : width > 0 && height > 0
              ? `${Math.round(width)}×${Math.round(height)}`
              : undefined;

    return {
        mediaType: "video",
        ...(duration ? { videoDurationSeconds: duration } : {}),
        ...(resolution ? { videoResolution: resolution } : {}),
    };
}

function findVideoSource(value: unknown, depth = 0): string | null {
    if (depth > 6 || value == null) return null;
    if (typeof value === "string") {
        return /(?:\.mp4|\.webm|\.mov)(?:[?#]|$)|\/api\/uploads\/|\/uploads\//i.test(
            value,
        )
            ? value
            : null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findVideoSource(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    for (const key of [
        "videoUrl",
        "video_url",
        "fileUrl",
        "file_url",
        "url",
        "output",
        "result",
        "data",
    ]) {
        const found = findVideoSource(record[key], depth + 1);
        if (found) return found;
    }
    for (const item of Object.values(record)) {
        const found = findVideoSource(item, depth + 1);
        if (found) return found;
    }
    return null;
}

async function probeVideoMetadata(
    value: unknown,
    fallback: VideoMetadata,
): Promise<VideoMetadata> {
    const source = findVideoSource(value);
    if (!source || typeof document === "undefined") return fallback;

    return new Promise((resolve) => {
        const video = document.createElement("video");
        let settled = false;
        const finish = (metadata: VideoMetadata) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            video.removeAttribute("src");
            video.load();
            resolve(metadata);
        };
        const timeout = setTimeout(() => finish(fallback), 4_000);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration =
                Number.isFinite(video.duration) && video.duration > 0
                    ? Math.round(video.duration * 10) / 10
                    : fallback.videoDurationSeconds;
            const resolution =
                video.videoWidth > 0 && video.videoHeight > 0
                    ? `${video.videoWidth}×${video.videoHeight}`
                    : fallback.videoResolution;
            finish({
                mediaType: "video",
                ...(duration ? { videoDurationSeconds: duration } : {}),
                ...(resolution ? { videoResolution: resolution } : {}),
            });
        };
        video.onerror = () => finish(fallback);
        video.src = source;
    });
}

function cleanError(value: unknown) {
    const raw = typeof value === "string" ? value : value instanceof Error ? value.message : "";
    return raw
        .replace(/(?:sk-|AIza|Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "[已隐藏密钥]")
        .replace(/[?&](?:key|token|api_key)=[^&\s]+/gi, "")
        .slice(0, 800);
}

function projectInfo() {
    const projectId = getActiveCanvasId();
    const projectName = getCanvasHistory().find((item) => item.id === projectId)?.name || "未命名画布";
    return { projectId, projectName };
}

export function trackUsageTask(taskId: string, config: TrackConfig) {
    tracked.set(taskId, { ...config, ...projectInfo(), startedAt: Date.now() });
}

export function reportUsageTask(task: TaskResult) {
    if (!["COMPLETED", "FAILED", "CANCELLED"].includes(task.status) || reported.has(task.id)) return;
    const context = tracked.get(task.id);
    if (!context) return;
    reported.add(task.id);
    tracked.delete(task.id);
    const errorMessage = cleanError(task.error || task.data?.error);
    void (async () => {
        const requestedVideo = requestedVideoMetadata(context);
        const videoMetadata = requestedVideo
            ? await probeVideoMetadata(task.data ?? task.result, requestedVideo)
            : null;
        await fetch("/api/usage-report", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                id:
                    globalThis.crypto?.randomUUID?.() ||
                    `event-${Date.now()}-${task.id}`,
                projectId: context.projectId,
                projectName: context.projectName,
                taskId: task.id,
                feature: context.feature,
                pluginId: context.pluginId,
                model: context.model || "默认模型",
                status: task.status.toLowerCase(),
                durationMs: Date.now() - context.startedAt,
                outputCount:
                    task.status === "COMPLETED"
                        ? Math.max(1, outputCount(task.data ?? task.result))
                        : 0,
                ...(videoMetadata ?? { mediaType: "image" }),
                errorMessage,
                occurredAt: Date.now(),
            }),
            keepalive: true,
        });
    })().catch(() => undefined);
}

export function reportUsageCreateFailure(config: TrackConfig, reason: unknown) {
    const project = projectInfo();
    const videoMetadata = requestedVideoMetadata(config);
    void fetch("/api/usage-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            id: globalThis.crypto?.randomUUID?.() || `event-${Date.now()}`,
            ...project,
            taskId: `create-${Date.now()}`,
            feature: config.feature,
            pluginId: config.pluginId,
            model: config.model || "默认模型",
            status: "create_failed",
            durationMs: 0,
            outputCount: 0,
            ...(videoMetadata ?? { mediaType: "image" }),
            errorMessage: cleanError(reason),
            occurredAt: Date.now(),
        }),
        keepalive: true,
    }).catch(() => undefined);
}
