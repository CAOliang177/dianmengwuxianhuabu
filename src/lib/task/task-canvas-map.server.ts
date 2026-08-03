import "server-only";

import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "@/lib/runtime/paths.server";

interface TaskCanvasEntry {
    canvasId: string;
    nodeId: string;
    createdAt: number;
}

type TaskCanvasMap = Record<string, TaskCanvasEntry>;

const mapPath = () => join(dataDir(), "task-canvas-map.json");

function readMap(): TaskCanvasMap {
    try {
        if (!existsSync(mapPath())) return {};
        const parsed = JSON.parse(readFileSync(mapPath(), "utf8"));
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

let writeChain: Promise<void> = Promise.resolve();

export function recordTaskCanvas(
    taskId: string,
    canvasId: string,
    nodeId: string,
) {
    writeChain = writeChain
        .catch(() => undefined)
        .then(() => {
            const path = mapPath();
            const temp = `${path}.tmp`;
            const next = {
                ...readMap(),
                [taskId]: { canvasId, nodeId, createdAt: Date.now() },
            };
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(temp, JSON.stringify(next, null, 2), "utf8");
            renameSync(temp, path);
        });
    return writeChain;
}

export function taskCanvasIds() {
    return readMap();
}
