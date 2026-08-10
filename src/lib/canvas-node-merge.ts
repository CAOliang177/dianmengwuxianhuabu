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
 * Nodes omitted by an incoming snapshot are preserved unless the save carries
 * an explicit deletion list. This is critical because renderer saves are
 * asynchronous and an older snapshot can otherwise erase newly created nodes.
 */
export function mergeDurableNodeHistory(
    existingNodes: unknown[] | undefined,
    incomingNodes: unknown[] | undefined,
    removedNodeIds: readonly string[] = [],
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

    const removed = new Set(removedNodeIds);
    const incomingIds = new Set(
        (incomingNodes as Node[])
            .filter((node) => typeof node?.id === "string")
            .map((node) => node.id),
    );
    const merged = (incomingNodes as Node[]).map((incoming) => {
        const existing = existingById.get(incoming.id);
        const durableGenerationTypes = new Set([
            "textGenImageNode",
            "textGenVideoNode",
            "imagesGenVideoNode",
            "imageGenVideoNode",
            "imageImageGenVideoNode",
        ]);
        if (
            !existing ||
            incoming.type !== existing.type ||
            !durableGenerationTypes.has(incoming.type ?? "")
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

    // A delayed renderer save must never erase nodes merely because its
    // snapshot was captured before those nodes were created. Node removal is
    // accepted only when the caller explicitly supplies the deleted ids.
    // This turns accidental stale overwrites into a harmless merge while
    // preserving intentional delete/ungroup operations.
    for (const existing of existingNodes as Node[]) {
        if (
            typeof existing?.id === "string" &&
            !incomingIds.has(existing.id) &&
            !removed.has(existing.id)
        ) {
            merged.push(existing);
        }
    }

    return merged;
}
