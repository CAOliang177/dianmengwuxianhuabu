import type { Edge, Node } from "@xyflow/react";

export interface CopyableSelection {
    nodes: Node[];
    edges: Edge[];
}

/**
 * Copy only the selected nodes, plus every line entering those nodes.
 *
 * A connected reference-image node stays where it is and is not duplicated.
 * Its incoming line is recreated against the pasted node, so the new node
 * shares the same reference image. External outgoing edges are intentionally
 * excluded to avoid silently wiring a duplicate into an existing downstream
 * workflow.
 */
export function collectCopyableSelection(
    nodes: Node[],
    edges: Edge[],
): CopyableSelection {
    return collectCopyableSelectionByIds(
        nodes,
        edges,
        new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
    );
}

export function collectCopyableSelectionByIds(
    nodes: Node[],
    edges: Edge[],
    selectedIds: ReadonlySet<string>,
): CopyableSelection {
    return {
        nodes: structuredClone(
            nodes.filter((node) => selectedIds.has(node.id)),
        ),
        edges: structuredClone(
            edges.filter((edge) => selectedIds.has(edge.target)),
        ),
    };
}

export function duplicateSelection(
    selection: CopyableSelection,
    options: {
        makeId: () => string;
        offset?: number;
        selected?: boolean;
    },
): CopyableSelection {
    const idMap = new Map<string, string>();
    const offset = options.offset ?? 0;
    const selected = options.selected ?? false;

    const nodes = selection.nodes.map((node) => {
        const id = options.makeId();
        idMap.set(node.id, id);
        return {
            ...structuredClone(node),
            id,
            selected,
            position: {
                x: node.position.x + offset,
                y: node.position.y + offset,
            },
        };
    });
    const copiedTargetIds = new Set(idMap.keys());
    const edges = selection.edges
        .filter((edge) => copiedTargetIds.has(edge.target))
        .map((edge) => ({
            ...structuredClone(edge),
            id: options.makeId(),
            source: idMap.get(edge.source) ?? edge.source,
            target: idMap.get(edge.target) ?? edge.target,
            selected: false,
        }));

    return { nodes, edges };
}
