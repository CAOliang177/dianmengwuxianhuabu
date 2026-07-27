import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "@/lib/runtime/paths.server";

export interface UsageReportingSettings {
    enabled: boolean;
    endpoint: string;
    token: string;
    clientId: string;
    clientName: string;
}

export interface UsageEventInput {
    id: string;
    projectId: string;
    projectName: string;
    taskId: string;
    feature: string;
    pluginId: string;
    model: string;
    status: "completed" | "failed" | "cancelled" | "create_failed";
    durationMs: number;
    outputCount: number;
    errorCode?: string;
    errorMessage?: string;
    occurredAt: number;
}

const APP_VERSION = "0.1.26";
const DEFAULT_ENDPOINT =
    "https://dianmeng-d4g0o715e8e8e422a.service.tcloudbase.com";
const LEGACY_ENDPOINTS = new Set([
    "https://dianmeng-usage-console.sappy-plum-7138.chatgpt.site",
    "https://dianmeng-usage-admin.dianmeng-canvas.workers.dev",
]);
const DEFAULT_INGEST_TOKEN = "dm_ingest_4bJ9uC3nZ8qP2aV7xK5mF1rD";
const SETTINGS_FILE = "usage-reporting.json";
const QUEUE_FILE = "usage-reporting-queue.json";
const MAX_QUEUE = 1000;
let operation = Promise.resolve();

function file(name: string) {
    return path.join(dataDir(), name);
}

function readJson<T>(name: string, fallback: T): T {
    try {
        return JSON.parse(readFileSync(file(name), "utf8")) as T;
    } catch {
        return fallback;
    }
}

function writeJson(name: string, value: unknown) {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(file(name), JSON.stringify(value, null, 2), "utf8");
}

function clean(value: unknown, max: number, fallback = "") {
    return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export function loadUsageSettings(): UsageReportingSettings {
    const stored = readJson<Partial<UsageReportingSettings>>(SETTINGS_FILE, {});
    const storedEndpoint = clean(stored.endpoint, 500, DEFAULT_ENDPOINT).replace(/\/+$/, "");
    const migrateEndpoint = !stored.endpoint || LEGACY_ENDPOINTS.has(storedEndpoint);
    const settings: UsageReportingSettings = {
        enabled: stored.enabled ?? true,
        endpoint: migrateEndpoint ? DEFAULT_ENDPOINT : storedEndpoint,
        token: clean(stored.token, 500, DEFAULT_INGEST_TOKEN),
        clientId: clean(stored.clientId, 96) || randomUUID(),
        clientName: clean(stored.clientName, 120, "我的电脑"),
    };
    if (!stored.clientId || migrateEndpoint || !stored.token) {
        writeJson(SETTINGS_FILE, settings);
    }
    return settings;
}

export function saveUsageSettings(input: Partial<UsageReportingSettings>) {
    const current = loadUsageSettings();
    const next: UsageReportingSettings = {
        enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
        endpoint: clean(input.endpoint, 500, current.endpoint),
        token: clean(input.token, 500, current.token),
        clientId: current.clientId,
        clientName: clean(input.clientName, 120, current.clientName) || "我的电脑",
    };
    writeJson(SETTINGS_FILE, next);
    return next;
}

export function usageQueueSize() {
    return readJson<UsageEventInput[]>(QUEUE_FILE, []).length;
}

function sanitizeEvent(input: UsageEventInput): UsageEventInput | null {
    const statuses = new Set(["completed", "failed", "cancelled", "create_failed"]);
    const status = clean(input.status, 32) as UsageEventInput["status"];
    if (!statuses.has(status)) return null;
    const taskId = clean(input.taskId, 128);
    if (!taskId) return null;
    return {
        id: clean(input.id, 96) || randomUUID(),
        projectId: clean(input.projectId, 128, "default"),
        projectName: clean(input.projectName, 160, "未命名画布"),
        taskId,
        feature: clean(input.feature, 96, "unknown"),
        pluginId: clean(input.pluginId, 160, "unknown"),
        model: clean(input.model, 160, "默认模型"),
        status,
        durationMs: Math.max(0, Math.min(Number(input.durationMs) || 0, 86_400_000)),
        outputCount: Math.max(0, Math.min(Number(input.outputCount) || 0, 100)),
        errorCode: clean(input.errorCode, 120),
        errorMessage: clean(input.errorMessage, 800),
        occurredAt: Number(input.occurredAt) || Date.now(),
    };
}

async function send(settings: UsageReportingSettings, event: UsageEventInput) {
    const endpoint = settings.endpoint.replace(/\/+$/, "");
    if (!endpoint || !settings.token) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(`${endpoint}/api/ingest`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-ingest-token": settings.token,
            },
            body: JSON.stringify({
                ...event,
                clientId: settings.clientId,
                clientName: settings.clientName,
                appVersion: APP_VERSION,
            }),
            signal: controller.signal,
        });
        return response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

async function deliver(input: UsageEventInput) {
    const settings = loadUsageSettings();
    if (!settings.enabled) return { accepted: false, queued: false, enabled: false };
    const current = readJson<UsageEventInput[]>(QUEUE_FILE, []);
    const event = sanitizeEvent(input);
    if (event && !current.some((item) => item.id === event.id)) current.push(event);

    const pending: UsageEventInput[] = [];
    for (const item of current.slice(-MAX_QUEUE)) {
        if (!(await send(settings, item))) pending.push(item);
    }
    writeJson(QUEUE_FILE, pending);
    return { accepted: true, queued: pending.some((item) => item.id === event?.id), enabled: true };
}

export function reportUsageEvent(input: UsageEventInput) {
    const run = operation.then(() => deliver(input), () => deliver(input));
    operation = run.then(() => undefined, () => undefined);
    return run;
}
