import type { Node } from "@xyflow/react";
import {
    readGenerationHistory,
    withGenerationHistory,
} from "@/lib/generation-history";

function fileKeys(data: Record<string, unknown>): string[] {
    return Array.isArray(data.fileKeys)
        ? data.fileKeys.filter(
              (value): value is string =>
                  typeof value === "string" && value.length > 0,
          )
        : [];
}

/**
 * Merge durable generation fields from the last disk snapshot into an
 * incoming renderer snapshot. The renderer may still hold an older node when
 * a background task finishes, so replacing the complete node array would
 * otherwise erase the newly recorded result.
 *
 * Only nodes still present in the incoming snapshot are returned. Intentional
 * node deletion therefore remains authoritative.
 */
export function mergeDurableNodeHistory(
    existingNodes: unknown[] | undefined,
    incomingNodes: unknown[] | undefined,
): unknown[] | undefined {
    if (!Array.isArray(incomingNodes)) return incomingNodes;
    if (!Array.isArray(existingNodes) || existingNodes.length === 0) {
        return incomingNodes;
    }

    const existingById = new Map(
        (existingNodes as Node[])
            .filter((node) => typeof node?.id === "string")
            .map((node) => [node.id, node]),
    );

    return (incomingNodes as Node[]).map((incoming) => {
        const existing = existingById.get(incoming.id);
        if (
            !existing ||
            incoming.type !== "textGenImageNode" ||
            existing.type !== "textGenImageNode"
        ) {
            return incoming;
        }

        const incomingData = (incoming.data ?? {}) as Record<string, unknown>;
        const existingData = (existing.data ?? {}) as Record<string, unknown>;
        const incomingHistory = readGenerationHistory(incomingData);
        const existingHistory = readGenerationHistory(existingData);
        const mergedHistory = readGenerationHistory({
            generationHistoryVersion: 2,
            generationHistoryRecords: [...incomingHistory, ...existingHistory],
        });
        if (mergedHistory.length === 0) return incoming;

        const newestKey = mergedHistory[0].fileKey;
        const existingKeys = fileKeys(existingData);
        const incomingKeys = fileKeys(incomingData);
        const latestKeys = existingKeys.includes(newestKey)
            ? existingKeys
            : incomingKeys.includes(newestKey)
              ? incomingKeys
              : [newestKey];

        return {
            ...incoming,
            data: {
                ...withGenerationHistory(incomingData, mergedHistory),
                fileKeys: latestKeys,
            },
        };
    });
}
