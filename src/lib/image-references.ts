import type { Edge, Node } from "@xyflow/react";

const IMAGE_REFERENCE_SOURCE_TYPES = new Set(["imageNode", "textGenImageNode"]);

type ReferenceNode = Pick<Node, "type" | "data">;
type ReferenceEdge = Pick<Edge, "source" | "target">;

/**
 * Collect one reference entry for every connected image-producing node.
 *
 * Generated images now remain inside `textGenImageNode` instead of spawning a
 * separate `imageNode`, so both node types must be accepted. Deliberately do
 * not deduplicate file keys: two connected nodes are two user-selected
 * references even when they happen to point at the same underlying image.
 */
export function collectConnectedImageReferences(
    targetNodeId: string,
    edges: ReadonlyArray<ReferenceEdge>,
    getNode: (nodeId: string) => ReferenceNode | undefined,
): string[] {
    return edges
        .filter((edge) => edge.target === targetNodeId)
        .flatMap((edge) => {
            const source = getNode(edge.source);
            if (
                !source?.type ||
                !IMAGE_REFERENCE_SOURCE_TYPES.has(source.type)
            ) {
                return [];
            }
            const fileKeys = (source.data as { fileKeys?: unknown })?.fileKeys;
            if (!Array.isArray(fileKeys)) return [];
            return fileKeys.filter(
                (fileKey): fileKey is string =>
                    typeof fileKey === "string" && fileKey.length > 0,
            );
        });
}
