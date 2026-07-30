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

export function readCanvasHistoryStore(): StoredCanvasHistory {
    try {
        if (!existsSync(storePath())) return emptyStore();
        const parsed = JSON.parse(readFileSync(storePath(), "utf8"));
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
        return emptyStore();
    }
}

let writeChain: Promise<StoredCanvasHistory> = Promise.resolve(emptyStore());

export function updateCanvasHistoryStore(
    update: (store: StoredCanvasHistory) => StoredCanvasHistory,
) {
    writeChain = writeChain.then(() => {
        const next = update(readCanvasHistoryStore());
        const path = storePath();
        const temp = `${path}.tmp`;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(temp, JSON.stringify(next, null, 2), "utf8");
        renameSync(temp, path);
        return next;
    });
    return writeChain;
}
