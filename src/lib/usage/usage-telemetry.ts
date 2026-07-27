import { getActiveCanvasId, getCanvasHistory } from "@/lib/canvas-history";

type TrackConfig = {
    feature: string;
    pluginId: string;
    model?: string;
    nodeId: string;
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
    void fetch("/api/usage-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            id: globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${task.id}`,
            projectId: context.projectId,
            projectName: context.projectName,
            taskId: task.id,
            feature: context.feature,
            pluginId: context.pluginId,
            model: context.model || "默认模型",
            status: task.status.toLowerCase(),
            durationMs: Date.now() - context.startedAt,
            outputCount: task.status === "COMPLETED" ? Math.max(1, outputCount(task.data ?? task.result)) : 0,
            errorMessage,
            occurredAt: Date.now(),
        }),
        keepalive: true,
    }).catch(() => undefined);
}

export function reportUsageCreateFailure(config: TrackConfig, reason: unknown) {
    const project = projectInfo();
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
            errorMessage: cleanError(reason),
            occurredAt: Date.now(),
        }),
        keepalive: true,
    }).catch(() => undefined);
}
