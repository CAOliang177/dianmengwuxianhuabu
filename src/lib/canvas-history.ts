import type { Edge, Node } from "@xyflow/react";
import { mergeDurableNodeHistory } from "@/lib/canvas-node-merge";

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

let persistChain: Promise<void> = Promise.resolve();

async function postPatch(
    patch: Record<string, unknown>,
    attempts = 3,
): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch("/api/canvas-history", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(patch),
                keepalive: true,
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(
                    `Canvas persistence failed with HTTP ${response.status}`,
                );
            }
            return;
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await new Promise((resolve) =>
                    setTimeout(resolve, attempt * 200),
                );
            }
        }
    }
    throw lastError;
}

function persistPatch(patch: Record<string, unknown>): Promise<void> {
    const operation = persistChain
        .catch(() => undefined)
        .then(() => postPatch(patch));
    persistChain = operation;
    return operation;
}

interface CanvasPersistencePatch {
    canvas: CanvasSnapshot & { id: string };
    historyItem?: CanvasHistoryItem;
    removedNodeIds?: string[];
}

interface PendingCanvasPatch {
    patch: CanvasPersistencePatch;
    timer: ReturnType<typeof setTimeout>;
    waiters: Array<{
        resolve: () => void;
        reject: (reason: unknown) => void;
    }>;
}

const pendingCanvasPatches = new Map<string, PendingCanvasPatch>();

/**
 * Coalesce bursts of node, edge and metadata updates into one disk request.
 * Task progress and node UI updates can arrive close together; queueing every
 * full-canvas snapshot made large canvases feel progressively slower.
 */
function persistCanvasPatch(patch: CanvasPersistencePatch): Promise<void> {
    const id = patch.canvas.id;
    return new Promise((resolve, reject) => {
        const current = pendingCanvasPatches.get(id);
        if (current) {
            clearTimeout(current.timer);
            current.patch = {
                canvas: {
                    ...current.patch.canvas,
                    ...patch.canvas,
                    id,
                },
                historyItem: patch.historyItem ?? current.patch.historyItem,
                removedNodeIds: [
                    ...new Set([
                        ...(current.patch.removedNodeIds ?? []),
                        ...(patch.removedNodeIds ?? []),
                    ]),
                ],
            };
            current.waiters.push({ resolve, reject });
            current.timer = setTimeout(() => {
                void flushPendingCanvasPatch(id);
            }, 100);
            return;
        }

        const pending: PendingCanvasPatch = {
            patch,
            waiters: [{ resolve, reject }],
            timer: setTimeout(() => {
                void flushPendingCanvasPatch(id);
            }, 100),
        };
        pendingCanvasPatches.set(id, pending);
    });
}

async function flushPendingCanvasPatch(id: string) {
    const pending = pendingCanvasPatches.get(id);
    if (!pending) return;
    pendingCanvasPatches.delete(id);
    try {
        await persistPatch(pending.patch as unknown as Record<string, unknown>);
        for (const waiter of pending.waiters) waiter.resolve();
    } catch (error) {
        for (const waiter of pending.waiters) waiter.reject(error);
    }
}

function supersedePendingCanvasPatch(id: string) {
    const pending = pendingCanvasPatches.get(id);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    pendingCanvasPatches.delete(id);
    // A newer complete snapshot or an explicit deletion supersedes this
    // partial patch, so callers can consider their requested state durable.
    for (const waiter of pending.waiters) waiter.resolve();
    return pending.patch;
}

function writeHistory(items: CanvasHistoryItem[], persist = true) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    if (persist) void persistPatch({ history: items });
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
    void persistPatch({ activeCanvasId: id });
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
    void persistPatch({
        canvas: {
            id,
            nodes: [],
            edges: [],
            meta: { id: null, name: canvasName, description: "" },
        },
    });
    return id;
}

function touchCanvas(
    id: string,
    patch: Partial<CanvasHistoryItem> = {},
    persist = true,
) {
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
    writeHistory([next, ...items.filter((item) => item.id !== id)], persist);
    return next;
}

/**
 * Persist one complete canvas snapshot when the renderer is being hidden or
 * closed. Desktop launches use a different localhost port, so localStorage is
 * only a cache; the combined beacon is the durable source of truth after a
 * reboot and also preserves the generation history embedded in node data.
 */
export function flushCanvasSnapshot(
    nodes: Node[],
    edges: Edge[],
    meta: { id: number | null; name: string; description: string },
) {
    const id = getActiveCanvasId();
    const superseded = supersedePendingCanvasPatch(id);
    localStorage.setItem(canvasStorageKey(id, "nodes"), JSON.stringify(nodes));
    localStorage.setItem(canvasStorageKey(id, "edges"), JSON.stringify(edges));
    localStorage.setItem(canvasStorageKey(id, "meta"), JSON.stringify(meta));

    const current = readHistory().find((item) => item.id === id);
    const coverFileKey =
        current?.coverFileKey ?? firstGeneratedCanvasImage(nodes);
    const historyItem = touchCanvas(
        id,
        {
            name: meta.name || "未命名画布",
            nodeCount: nodes.length,
            ...(coverFileKey ? { coverFileKey } : {}),
        },
        false,
    );
    const patch = {
        activeCanvasId: id,
        canvas: { id, nodes, edges, meta },
        historyItem,
        ...(superseded?.removedNodeIds?.length
            ? { removedNodeIds: superseded.removedNodeIds }
            : {}),
    };
    const body = JSON.stringify(patch);

    if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(
            "/api/canvas-history",
            new Blob([body], { type: "application/json" }),
        )
    ) {
        return;
    }
    void persistPatch(patch);
}

export function saveCanvasNodesForCanvas(
    id: string,
    nodes: Node[],
    options: { removedNodeIds?: string[] } = {},
) {
    localStorage.setItem(canvasStorageKey(id, "nodes"), JSON.stringify(nodes));
    const current = readHistory().find((item) => item.id === id);
    const coverFileKey =
        current?.coverFileKey ?? firstGeneratedCanvasImage(nodes);
    const historyItem = touchCanvas(
        id,
        {
            nodeCount: nodes.length,
            ...(coverFileKey ? { coverFileKey } : {}),
        },
        false,
    );
    return persistCanvasPatch({
        canvas: { id, nodes },
        historyItem,
        ...(options.removedNodeIds?.length
            ? { removedNodeIds: options.removedNodeIds }
            : {}),
    });
}

export function saveCanvasNodes(
    nodes: Node[],
    options: { removedNodeIds?: string[] } = {},
) {
    return saveCanvasNodesForCanvas(getActiveCanvasId(), nodes, options);
}

export function saveCanvasEdgesForCanvas(id: string, edges: Edge[]) {
    localStorage.setItem(canvasStorageKey(id, "edges"), JSON.stringify(edges));
    const historyItem = touchCanvas(id, {}, false);
    return persistCanvasPatch({ canvas: { id, edges }, historyItem });
}

export function saveCanvasEdges(edges: Edge[]) {
    return saveCanvasEdgesForCanvas(getActiveCanvasId(), edges);
}

export function saveCanvasMetaForCanvas(
    canvasId: string,
    meta: {
        id: number | null;
        name: string;
        description: string;
    },
) {
    localStorage.setItem(
        canvasStorageKey(canvasId, "meta"),
        JSON.stringify(meta),
    );
    const historyItem = touchCanvas(
        canvasId,
        {
            name: meta.name || "未命名画布",
        },
        false,
    );
    return persistCanvasPatch({
        canvas: { id: canvasId, meta },
        historyItem,
    });
}

export function saveCanvasMeta(meta: {
    id: number | null;
    name: string;
    description: string;
}) {
    return saveCanvasMetaForCanvas(getActiveCanvasId(), meta);
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
    const historyItem = touchCanvas(id, { name }, false);
    void persistCanvasPatch({ canvas: { id, meta }, historyItem });
    return true;
}

export function deleteCanvas(id: string) {
    const items = readHistory();
    if (!items.some((item) => item.id === id)) return false;

    const history = items.filter((item) => item.id !== id);
    supersedePendingCanvasPatch(id);
    localStorage.removeItem(canvasStorageKey(id, "nodes"));
    localStorage.removeItem(canvasStorageKey(id, "edges"));
    localStorage.removeItem(canvasStorageKey(id, "meta"));
    writeHistory(history, false);

    const currentActiveId = getActiveCanvasId();
    const activeCanvasId =
        currentActiveId === id
            ? (history[0]?.id ?? "default")
            : currentActiveId;
    localStorage.setItem(ACTIVE_KEY, activeCanvasId);
    void persistPatch({ deleteCanvasId: id, history, activeCanvasId });
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
            void persistPatch({ replace: local });
            return local.history;
        }
        if (!Array.isArray(disk.history)) return local.history;

        // The renderer cache may be newer than disk when the user returns home
        // immediately after creating a node/result. Never let an older disk
        // snapshot overwrite that newer local canvas during the next visit.
        const diskHistoryById = new Map(
            disk.history.map((item) => [item.id, item]),
        );
        const localHistoryById = new Map(
            local.history.map((item) => [item.id, item]),
        );
        const allIds = new Set([
            ...diskHistoryById.keys(),
            ...localHistoryById.keys(),
        ]);
        const mergedHistory = [...allIds]
            .map((id) => {
                const diskItem = diskHistoryById.get(id);
                const localItem = localHistoryById.get(id);
                if (!diskItem) return localItem;
                if (!localItem) return diskItem;
                return localItem.updatedAt > diskItem.updatedAt
                    ? localItem
                    : diskItem;
            })
            .filter((item): item is CanvasHistoryItem => item !== undefined)
            .sort((a, b) => b.updatedAt - a.updatedAt);

        const selectedCanvases: Record<string, CanvasSnapshot> = {
            ...(disk.canvases || {}),
        };
        const locallyNewerIds = new Set<string>();
        for (const id of allIds) {
            const diskItem = diskHistoryById.get(id);
            const localItem = localHistoryById.get(id);
            if (
                localItem &&
                (!diskItem || localItem.updatedAt > diskItem.updatedAt) &&
                local.canvases[id]
            ) {
                selectedCanvases[id] = local.canvases[id];
                locallyNewerIds.add(id);
            }
        }

        const covers = backfillCanvasCovers(mergedHistory, selectedCanvases);
        writeHistory(covers.history, false);
        if (covers.changed) {
            void persistPatch({ history: covers.history });
        }
        if (disk.activeCanvasId) {
            localStorage.setItem(ACTIVE_KEY, disk.activeCanvasId);
        }
        for (const [id, canvas] of Object.entries(selectedCanvases)) {
            if (canvas.nodes) {
                const localNodes = local.canvases[id]?.nodes;
                const nodes = mergeDurableNodeHistory(
                    localNodes,
                    canvas.nodes,
                ) as Node[];
                localStorage.setItem(
                    canvasStorageKey(id, "nodes"),
                    JSON.stringify(nodes),
                );
                if (JSON.stringify(nodes) !== JSON.stringify(canvas.nodes)) {
                    void persistCanvasPatch({
                        canvas: { id, nodes },
                    });
                }
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
            if (locallyNewerIds.has(id)) {
                const historyItem = covers.history.find(
                    (item) => item.id === id,
                );
                void persistCanvasPatch({
                    canvas: { id, ...canvas },
                    ...(historyItem ? { historyItem } : {}),
                });
            }
        }
        return covers.history.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
        return getCanvasHistory();
    }
}
