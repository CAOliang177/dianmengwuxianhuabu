import type { Node } from "@xyflow/react";
import {
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
