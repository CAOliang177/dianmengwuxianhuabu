import type { Node } from "@xyflow/react";
import { listTasks, type Task } from "@/lib/api/task";
import {
    canvasStorageKey,
    createCanvas,
    getActiveCanvasId,
    getCanvasHistory,
    saveCanvasNodesForCanvas,
    setActiveCanvasId,
} from "@/lib/canvas-history";
import { buildRecoveredImageNodes } from "@/lib/task/reconcile-image-results";

export interface CanvasRecoveryResult {
    recoveredNodes: number;
    recoveredImages: number;
    canvasIds: string[];
    openCanvasId?: string;
}

function readNodes(canvasId: string): Node[] {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(canvasStorageKey(canvasId, "nodes")) || "[]",
        );
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function placeAfterExisting(nodes: Node[], additions: Node[]): Node[] {
    const right = nodes.reduce(
        (value, node) =>
            Math.max(value, node.position.x + (node.measured?.width ?? 480)),
        0,
    );
    return additions.map((node, index) => ({
        ...node,
        position: {
            x: right + 420 + (index % 3) * 560,
            y: 300 + Math.floor(index / 3) * 560,
        },
    }));
}

async function allTasks(): Promise<Task[]> {
    const tasks: Task[] = [];
    const pageSize = 500;
    for (let page = 1; page <= 20; page += 1) {
        const batch = await listTasks(page, pageSize);
        tasks.push(...batch.tasks);
        if (batch.tasks.length < pageSize) break;
    }
    return tasks;
}

export async function recoverMissingGeneratedNodes(): Promise<CanvasRecoveryResult> {
    const history = getCanvasHistory();
    const nodesByCanvas = new Map(
        history.map((item) => [item.id, readNodes(item.id)]),
    );
    const existingIds = new Set(
        [...nodesByCanvas.values()].flatMap((nodes) =>
            nodes.map((node) => node.id),
        ),
    );
    const recovered = buildRecoveredImageNodes(existingIds, await allTasks());
    if (recovered.length === 0) {
        return { recoveredNodes: 0, recoveredImages: 0, canvasIds: [] };
    }

    const previousActiveId = getActiveCanvasId();
    const validCanvasIds = new Set(history.map((item) => item.id));
    const mapped = new Map<string, Node[]>();
    const legacy: Node[] = [];
    let recoveredImages = 0;

    for (const item of recovered) {
        recoveredImages += item.imageCount;
        if (item.canvasId && validCanvasIds.has(item.canvasId)) {
            const list = mapped.get(item.canvasId) ?? [];
            list.push(item.node);
            mapped.set(item.canvasId, list);
        } else {
            legacy.push(item.node);
        }
    }

    const changedCanvasIds: string[] = [];
    for (const [canvasId, additions] of mapped) {
        const existing = nodesByCanvas.get(canvasId) ?? [];
        await saveCanvasNodesForCanvas(canvasId, [
            ...existing,
            ...placeAfterExisting(existing, additions),
        ]);
        changedCanvasIds.push(canvasId);
    }

    let recoveryCanvasId: string | undefined;
    if (legacy.length > 0) {
        recoveryCanvasId = createCanvas(
            `恢复的生成记录 ${new Date().toLocaleDateString("zh-CN")}`,
        );
        await saveCanvasNodesForCanvas(recoveryCanvasId, legacy);
        changedCanvasIds.push(recoveryCanvasId);
    } else {
        setActiveCanvasId(previousActiveId);
    }

    return {
        recoveredNodes: recovered.length,
        recoveredImages,
        canvasIds: changedCanvasIds,
        openCanvasId: recoveryCanvasId ?? changedCanvasIds[0],
    };
}
