import { NextResponse } from "next/server";
import {
    readCanvasHistoryStore,
    type StoredCanvasHistory,
    updateCanvasHistoryStore,
} from "@/lib/canvas-history.server";
import { mergeDurableNodeHistory } from "@/lib/canvas-node-merge";

export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json(readCanvasHistoryStore(), {
        headers: { "cache-control": "no-store" },
    });
}

export async function POST(request: Request) {
    const body = (await request.json()) as {
        replace?: StoredCanvasHistory;
        history?: StoredCanvasHistory["history"];
        activeCanvasId?: string;
        historyItem?: StoredCanvasHistory["history"][number];
        canvas?: StoredCanvasHistory["canvases"][string] & { id: string };
        removedNodeIds?: string[];
        deleteCanvasId?: string;
    };

    const result = await updateCanvasHistoryStore((current) => {
        if (body.replace) {
            return {
                history: Array.isArray(body.replace.history)
                    ? body.replace.history
                    : [],
                activeCanvasId: body.replace.activeCanvasId,
                canvases: body.replace.canvases || {},
            };
        }

        const next: StoredCanvasHistory = {
            history: Array.isArray(body.history)
                ? body.history
                : [...current.history],
            activeCanvasId: body.activeCanvasId ?? current.activeCanvasId,
            canvases: { ...current.canvases },
        };
        if (body.historyItem) {
            next.history = [
                body.historyItem,
                ...next.history.filter(
                    (item) => item.id !== body.historyItem?.id,
                ),
            ];
        }
        if (body.canvas?.id) {
            const { id, ...patch } = body.canvas;
            const existing = next.canvases[id];
            next.canvases[id] = {
                ...existing,
                ...patch,
                ...(Array.isArray(patch.nodes)
                    ? {
                          nodes: mergeDurableNodeHistory(
                              existing?.nodes,
                              patch.nodes,
                              Array.isArray(body.removedNodeIds)
                                  ? body.removedNodeIds
                                  : [],
                          ),
                      }
                    : {}),
            };
        }
        if (body.deleteCanvasId) {
            next.history = next.history.filter(
                (item) => item.id !== body.deleteCanvasId,
            );
            delete next.canvases[body.deleteCanvasId];
            if (next.activeCanvasId === body.deleteCanvasId) {
                next.activeCanvasId = next.history[0]?.id ?? "default";
            }
        }
        // Never trust a separately queued history patch for the node count.
        // The durable canvas snapshot is the authoritative value.
        next.history = next.history.map((item) => {
            const nodes = next.canvases[item.id]?.nodes;
            return {
                ...item,
                nodeCount: Array.isArray(nodes) ? nodes.length : item.nodeCount,
            };
        });
        return next;
    });

    return NextResponse.json(result);
}
