import "server-only";

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "@xyflow/react";
import { dataDir } from "@/lib/runtime/paths.server";
import { reconcileCompletedImageTasks } from "@/lib/task/reconcile-image-results";

export interface StoredCanvasHistory {
    history: Array<{
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        nodeCount: number;
        coverFileKey?: string;
    }>;
    activeCanvasId?: string;
    canvases: Record<
        string,
        { nodes?: unknown[]; edges?: unknown[]; meta?: Record<string, unknown> }
    >;
}

const emptyStore = (): StoredCanvasHistory => ({ history: [], canvases: {} });
const storePath = () => join(dataDir(), "canvas-history.json");
const backupPath = () => `${storePath()}.bak`;

function readStoreFile(path: string): StoredCanvasHistory | null {
    try {
        if (!existsSync(path)) return null;
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        return {
            history: Array.isArray(parsed.history) ? parsed.history : [],
            activeCanvasId:
                typeof parsed.activeCanvasId === "string"
                    ? parsed.activeCanvasId
                    : undefined,
            canvases:
                parsed.canvases && typeof parsed.canvases === "object"
                    ? parsed.canvases
                    : {},
        };
    } catch {
        return null;
    }
}

export function readCanvasHistoryStore(): StoredCanvasHistory {
    // A sudden shutdown can interrupt the last disk write. Keep the previous
    // valid snapshot as a fallback instead of presenting an empty canvas.
    return (
        readStoreFile(storePath()) ??
        readStoreFile(backupPath()) ??
        emptyStore()
    );
}

let writeChain: Promise<StoredCanvasHistory> = Promise.resolve(emptyStore());

export function updateCanvasHistoryStore(
    update: (store: StoredCanvasHistory) => StoredCanvasHistory,
) {
    writeChain = writeChain
        .catch(() => readCanvasHistoryStore())
        .then(() => {
            const next = update(readCanvasHistoryStore());
            const path = storePath();
            const temp = `${path}.tmp`;
            mkdirSync(dirname(path), { recursive: true });
            if (readStoreFile(path)) {
                copyFileSync(path, backupPath());
            }
            writeFileSync(temp, JSON.stringify(next, null, 2), "utf8");
            renameSync(temp, path);
            return next;
        });
    return writeChain;
}

/**
 * Attach a completed image task to the saved canvas before notifying the
 * renderer. The task result therefore survives even if the app closes before
 * React can repaint or finish its normal debounced save.
 */
export function recordCompletedImageTask(
    nodeId: string,
    taskId: string,
    result: unknown,
) {
    return updateCanvasHistoryStore((current) => {
        const changedCanvasIds = new Set<string>();
        const canvases = { ...current.canvases };

        for (const [canvasId, canvas] of Object.entries(canvases)) {
            if (!Array.isArray(canvas.nodes)) continue;
            const reconciled = reconcileCompletedImageTasks(
                canvas.nodes as Node[],
                [
                    {
                        id: taskId,
                        nodeId,
                        feature: "image-fusion",
                        status: "completed",
                        result,
                        createdAt: Date.now(),
                    },
                ],
            );
            if (!reconciled.changed) continue;
            changedCanvasIds.add(canvasId);
            canvases[canvasId] = {
                ...canvas,
                nodes: reconciled.nodes,
            };
        }

        if (changedCanvasIds.size === 0) return current;
        const now = Date.now();
        return {
            ...current,
            history: current.history.map((item) =>
                changedCanvasIds.has(item.id)
                    ? {
                          ...item,
                          updatedAt: now,
                          nodeCount: canvases[item.id].nodes?.length ?? 0,
                      }
                    : item,
            ),
            canvases,
        };
    });
}
