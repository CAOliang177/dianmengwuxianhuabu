import type { Edge, Node } from "@xyflow/react";

export interface CanvasHistoryItem {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    nodeCount: number;
    coverFileKey?: string;
}

type CanvasPart = "nodes" | "edges" | "meta";

interface CanvasSnapshot {
    nodes?: Node[];
    edges?: Edge[];
    meta?: { id: number | null; name: string; description: string };
}

interface PersistentCanvasStore {
    history: CanvasHistoryItem[];
    activeCanvasId?: string;
    canvases: Record<string, CanvasSnapshot>;
}

interface CanvasCoverNode {
    type?: string;
    data?: Record<string, unknown>;
}

const HISTORY_KEY = "dianmeng.canvas.history.v1";
const ACTIVE_KEY = "dianmeng.canvas.active.v1";

export function canvasStorageKey(id: string, part: CanvasPart) {
    return `dianmeng.canvas.${id}.${part}`;
}

function readHistory(): CanvasHistoryItem[] {
    if (typeof window === "undefined") return [];
    try {
        const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function persistPatch(patch: Record<string, unknown>) {
    void fetch("/api/canvas-history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
        keepalive: true,
    }).catch(() => undefined);
}

function writeHistory(items: CanvasHistoryItem[], persist = true) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    if (persist) persistPatch({ history: items });
}

export function firstGeneratedCanvasImage(
    nodes: CanvasCoverNode[],
): string | undefined {
    const timestamped: Array<{ fileKey: string; createdAt: number }> = [];
    const legacy: string[] = [];

    for (const node of nodes) {
        const data = node.data;
        if (!data) continue;

        const records = Array.isArray(data.generationHistoryRecords)
            ? data.generationHistoryRecords
            : [];
        for (const record of records) {
            if (
                record &&
                typeof record === "object" &&
                typeof (record as { fileKey?: unknown }).fileKey === "string" &&
                Number.isFinite(
                    Number((record as { createdAt?: unknown }).createdAt),
                )
            ) {
                timestamped.push({
                    fileKey: (record as { fileKey: string }).fileKey,
                    createdAt: Number(
                        (record as { createdAt: number }).createdAt,
                    ),
                });
            }
        }

        if (node.type !== "textGenImageNode") continue;
        const generationHistory = Array.isArray(data.generationHistory)
            ? data.generationHistory.filter(
                  (value): value is string =>
                      typeof value === "string" && value.length > 0,
              )
            : [];
        if (generationHistory.length > 0) {
            legacy.push(generationHistory[generationHistory.length - 1]);
            continue;
        }
        const fileKeys = Array.isArray(data.fileKeys)
            ? data.fileKeys.filter(
                  (value): value is string =>
                      typeof value === "string" && value.length > 0,
              )
            : [];
        if (fileKeys[0]) legacy.push(fileKeys[0]);
    }

    timestamped.sort(
        (a, b) =>
            a.createdAt - b.createdAt || a.fileKey.localeCompare(b.fileKey),
    );
    return timestamped[0]?.fileKey ?? legacy[0];
}

function backfillCanvasCovers(
    history: CanvasHistoryItem[],
    canvases: Record<string, CanvasSnapshot>,
) {
    let changed = false;
    const next = history.map((item) => {
        if (item.coverFileKey) return item;
        const coverFileKey = firstGeneratedCanvasImage(
            (canvases[item.id]?.nodes ?? []) as CanvasCoverNode[],
        );
        if (!coverFileKey) return item;
        changed = true;
        return { ...item, coverFileKey };
    });
    return { history: next, changed };
}

function makeId() {
    return globalThis.crypto?.randomUUID?.() ?? `canvas-${Date.now()}`;
}

export function setActiveCanvasId(id: string) {
    localStorage.setItem(ACTIVE_KEY, id);
    persistPatch({ activeCanvasId: id });
}

export function getActiveCanvasId() {
    return localStorage.getItem(ACTIVE_KEY) || "default";
}

export function ensureCanvas(id: string, name = "未命名画布") {
    const items = readHistory();
    if (items.some((item) => item.id === id)) return;
    const now = Date.now();
    writeHistory([
        { id, name, createdAt: now, updatedAt: now, nodeCount: 0 },
        ...items,
    ]);
}

export function createCanvas(name?: string) {
    const id = makeId();
    const now = Date.now();
    const canvasName =
        name || `未命名画布 ${new Date(now).toLocaleDateString("zh-CN")}`;
    writeHistory([
        { id, name: canvasName, createdAt: now, updatedAt: now, nodeCount: 0 },
        ...readHistory(),
    ]);
    localStorage.setItem(canvasStorageKey(id, "nodes"), "[]");
    localStorage.setItem(canvasStorageKey(id, "edges"), "[]");
    localStorage.setItem(
        canvasStorageKey(id, "meta"),
        JSON.stringify({ id: null, name: canvasName, description: "" }),
    );
    setActiveCanvasId(id);
    persistPatch({
        canvas: {
            id,
            nodes: [],
            edges: [],
            meta: { id: null, name: canvasName, description: "" },
        },
    });
    return id;
}

function touchCanvas(id: string, patch: Partial<CanvasHistoryItem> = {}) {
    const now = Date.now();
    const items = readHistory();
    const current = items.find((item) => item.id === id);
    const next: CanvasHistoryItem = current
        ? { ...current, ...patch, updatedAt: now }
        : {
              id,
              name: "未命名画布",
              createdAt: now,
              nodeCount: 0,
              ...patch,
              updatedAt: now,
          };
    writeHistory([next, ...items.filter((item) => item.id !== id)]);
    return next;
}

export function saveCanvasNodes(nodes: Node[]) {
    const id = getActiveCanvasId();
    localStorage.setItem(canvasStorageKey(id, "nodes"), JSON.stringify(nodes));
    const current = readHistory().find((item) => item.id === id);
    const coverFileKey =
        current?.coverFileKey ?? firstGeneratedCanvasImage(nodes);
    const historyItem = touchCanvas(id, {
        nodeCount: nodes.length,
        ...(coverFileKey ? { coverFileKey } : {}),
    });
    persistPatch({ canvas: { id, nodes }, historyItem });
}

export function saveCanvasEdges(edges: Edge[]) {
    const id = getActiveCanvasId();
    localStorage.setItem(canvasStorageKey(id, "edges"), JSON.stringify(edges));
    const historyItem = touchCanvas(id);
    persistPatch({ canvas: { id, edges }, historyItem });
}

export function saveCanvasMeta(meta: {
    id: number | null;
    name: string;
    description: string;
}) {
    const canvasId = getActiveCanvasId();
    localStorage.setItem(
        canvasStorageKey(canvasId, "meta"),
        JSON.stringify(meta),
    );
    const historyItem = touchCanvas(canvasId, {
        name: meta.name || "未命名画布",
    });
    persistPatch({ canvas: { id: canvasId, meta }, historyItem });
}

export function renameCanvas(id: string, value: string) {
    const name = value.trim();
    if (!name) return false;

    let meta: { id: number | null; name: string; description: string } = {
        id: null,
        name,
        description: "",
    };
    try {
        const saved = localStorage.getItem(canvasStorageKey(id, "meta"));
        if (saved) meta = { ...meta, ...JSON.parse(saved), name };
    } catch {
        // Replace malformed metadata with a clean record.
    }

    localStorage.setItem(canvasStorageKey(id, "meta"), JSON.stringify(meta));
    const historyItem = touchCanvas(id, { name });
    persistPatch({ canvas: { id, meta }, historyItem });
    return true;
}

export function migrateLegacyCanvas() {
    if (readHistory().length > 0) return;
    const legacyNodes = localStorage.getItem("nodes");
    const legacyEdges = localStorage.getItem("edges");
    const legacyMeta = localStorage.getItem("workflowMeta");
    if (!legacyNodes && !legacyEdges && !legacyMeta) return;

    const id = "legacy";
    let nodeCount = 0;
    let name = "我的第一个画布";
    try {
        nodeCount = JSON.parse(legacyNodes || "[]").length;
        name = JSON.parse(legacyMeta || "{}").name || name;
    } catch {
        // Keep safe defaults when old cache is malformed.
    }
    const now = Date.now();
    writeHistory([{ id, name, createdAt: now, updatedAt: now, nodeCount }]);
    localStorage.setItem(canvasStorageKey(id, "nodes"), legacyNodes || "[]");
    localStorage.setItem(canvasStorageKey(id, "edges"), legacyEdges || "[]");
    localStorage.setItem(
        canvasStorageKey(id, "meta"),
        legacyMeta || JSON.stringify({ id: null, name, description: "" }),
    );
}

export function getCanvasHistory() {
    migrateLegacyCanvas();
    return readHistory().sort((a, b) => b.updatedAt - a.updatedAt);
}

function localSnapshot(): PersistentCanvasStore {
    const history = getCanvasHistory();
    const canvases: Record<string, CanvasSnapshot> = {};
    for (const item of history) {
        try {
            canvases[item.id] = {
                nodes: JSON.parse(
                    localStorage.getItem(canvasStorageKey(item.id, "nodes")) ||
                        "[]",
                ),
                edges: JSON.parse(
                    localStorage.getItem(canvasStorageKey(item.id, "edges")) ||
                        "[]",
                ),
                meta:
                    JSON.parse(
                        localStorage.getItem(
                            canvasStorageKey(item.id, "meta"),
                        ) || "null",
                    ) || undefined,
            };
        } catch {
            canvases[item.id] = {};
        }
    }
    return {
        history: backfillCanvasCovers(history, canvases).history,
        activeCanvasId: getActiveCanvasId(),
        canvases,
    };
}

/**
 * Hydrate port-independent canvas data from the desktop data directory. On
 * the first upgraded launch, seed that file from the current localStorage.
 */
export async function hydrateCanvasHistoryFromDisk() {
    try {
        const response = await fetch("/api/canvas-history", {
            cache: "no-store",
        });
        if (!response.ok) return getCanvasHistory();
        const disk = (await response.json()) as PersistentCanvasStore;
        const local = localSnapshot();
        if (!disk.history?.length && local.history.length) {
            persistPatch({ replace: local });
            return local.history;
        }
        if (!Array.isArray(disk.history)) return local.history;

        const covers = backfillCanvasCovers(disk.history, disk.canvases || {});
        writeHistory(covers.history, false);
        if (covers.changed) {
            persistPatch({ history: covers.history });
        }
        if (disk.activeCanvasId) {
            localStorage.setItem(ACTIVE_KEY, disk.activeCanvasId);
        }
        for (const [id, canvas] of Object.entries(disk.canvases || {})) {
            if (canvas.nodes) {
                localStorage.setItem(
                    canvasStorageKey(id, "nodes"),
                    JSON.stringify(canvas.nodes),
                );
            }
            if (canvas.edges) {
                localStorage.setItem(
                    canvasStorageKey(id, "edges"),
                    JSON.stringify(canvas.edges),
                );
            }
            if (canvas.meta) {
                localStorage.setItem(
                    canvasStorageKey(id, "meta"),
                    JSON.stringify(canvas.meta),
                );
            }
        }
        return covers.history.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
        return getCanvasHistory();
    }
}
