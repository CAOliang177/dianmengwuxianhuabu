import type { Node } from "@xyflow/react";
import {
    GENERATION_HISTORY_RETENTION_MS,
    readGenerationHistory,
    withGenerationHistory,
} from "@/lib/generation-history";
import {
    getAbiNodeBySlot,
    resolveAbiOutputMappings,
} from "@/lib/schema/tongflow-abi";
import {
    computeOutputView,
    normalizeTaskPayloadData,
} from "@/lib/task/payload";

export interface ReconcileImageTask {
    id: string;
    nodeId?: string;
    feature?: string;
    status: string;
    data?: Record<string, unknown>;
    result?: unknown;
    createdAt?: Date | string | number;
    prompt?: Record<string, unknown>;
    pluginId?: string;
    model?: string;
    canvasId?: string;
}

export interface RecoveredImageNode {
    node: Node;
    canvasId?: string;
    imageCount: number;
}

function taskCreatedAt(task: ReconcileImageTask): number {
    const value = task.createdAt;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
}

function imageValues(task: ReconcileImageTask): string[] {
    const payload =
        normalizeTaskPayloadData({ data: task.data, result: task.result }) ??
        task.data;
    const abiNode = getAbiNodeBySlot("image-fusion");
    const routes = abiNode ? resolveAbiOutputMappings(abiNode) : [];
    const output = Object.values(computeOutputView(routes, payload)).find(
        (channel) => channel.nodeType === "imageNode",
    );
    return output?.values ?? [];
}

/**
 * Reconciles durable completed image tasks into their original in-place image
 * generation nodes. This does not depend on the React node component being
 * mounted, so viewport virtualization cannot drop a completed result.
 */
export function reconcileCompletedImageTasks(
    nodes: Node[],
    tasks: ReconcileImageTask[],
): { nodes: Node[]; changed: boolean } {
    const completedByNode = new Map<
        string,
        Array<{ values: string[]; createdAt: number }>
    >();

    for (const task of tasks) {
        if (
            task.status.toLowerCase() !== "completed" ||
            !task.nodeId ||
            (task.feature && task.feature !== "image-fusion")
        ) {
            continue;
        }
        const values = imageValues(task);
        if (values.length === 0) continue;
        const list = completedByNode.get(task.nodeId) ?? [];
        list.push({ values, createdAt: taskCreatedAt(task) });
        completedByNode.set(task.nodeId, list);
    }

    let changed = false;
    const nextNodes = nodes.map((node) => {
        if (node.type !== "textGenImageNode") return node;
        const completed = completedByNode.get(node.id);
        if (!completed?.length) return node;

        completed.sort((a, b) => b.createdAt - a.createdAt);
        const data = (node.data ?? {}) as Record<string, unknown>;
        const previous = readGenerationHistory(data);
        const generationHistory = readGenerationHistory({
            generationHistoryVersion: 2,
            generationHistoryRecords: [
                ...completed.flatMap(({ values, createdAt }) =>
                    values.map((fileKey) => ({ fileKey, createdAt })),
                ),
                ...previous,
            ],
        });
        const nextData = {
            ...withGenerationHistory(data, generationHistory),
            fileKeys: completed[0].values,
        };
        if (JSON.stringify(nextData) === JSON.stringify(data)) return node;
        changed = true;
        return { ...node, data: nextData };
    });

    return { nodes: nextNodes, changed };
}

/**
 * Rebuild generation nodes whose durable tasks still contain image results but
 * whose node ids no longer exist in any saved canvas. The caller decides
 * whether to restore a mapped node into its original canvas or place legacy
 * unmapped tasks into a separate recovery canvas.
 */
export function buildRecoveredImageNodes(
    existingNodeIds: ReadonlySet<string>,
    tasks: ReconcileImageTask[],
    now = Date.now(),
): RecoveredImageNode[] {
    const cutoff = now - GENERATION_HISTORY_RETENTION_MS;
    const grouped = new Map<string, ReconcileImageTask[]>();
    for (const task of tasks) {
        if (
            task.status.toLowerCase() !== "completed" ||
            !task.nodeId ||
            existingNodeIds.has(task.nodeId) ||
            taskCreatedAt(task) < cutoff ||
            (task.feature && task.feature !== "image-fusion") ||
            imageValues(task).length === 0
        ) {
            continue;
        }
        const list = grouped.get(task.nodeId) ?? [];
        list.push(task);
        grouped.set(task.nodeId, list);
    }

    return [...grouped.entries()].map(
        ([nodeId, nodeTasks], index): RecoveredImageNode => {
            nodeTasks.sort((a, b) => taskCreatedAt(b) - taskCreatedAt(a));
            const newest = nodeTasks[0];
            const records = readGenerationHistory({
                generationHistoryVersion: 2,
                generationHistoryRecords: nodeTasks.flatMap((task) =>
                    imageValues(task).map((fileKey) => ({
                        fileKey,
                        createdAt: taskCreatedAt(task),
                    })),
                ),
            });
            const latestValues = imageValues(newest);
            const columns = 4;
            const data: Record<string, unknown> = {
                ...(newest.prompt ?? {}),
                ...withGenerationHistory({}, records),
                fileKeys: latestValues,
                recoveredFromTaskIds: nodeTasks.map((task) => task.id),
                recoveredAt: now,
            };
            if (newest.pluginId) data.pluginId = newest.pluginId;
            if (newest.model) data.pluginModel = newest.model;

            return {
                node: {
                    id: nodeId,
                    type: "textGenImageNode",
                    position: {
                        x: 320 + (index % columns) * 560,
                        y: 280 + Math.floor(index / columns) * 560,
                    },
                    origin: [0.5, 0.5],
                    data,
                },
                canvasId: nodeTasks.find((task) => task.canvasId)?.canvasId,
                imageCount: records.length,
            };
        },
    );
}
