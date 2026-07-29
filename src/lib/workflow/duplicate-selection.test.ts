import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
    collectCopyableSelection,
    duplicateSelection,
} from "@/lib/workflow/duplicate-selection";

const nodes: Node[] = [
    {
        id: "reference",
        type: "imageNode",
        position: { x: 0, y: 0 },
        data: { fileKeys: ["ref.png"] },
        selected: false,
    },
    {
        id: "generator",
        type: "textGenImageNode",
        position: { x: 200, y: 0 },
        data: { text: "test" },
        selected: true,
    },
    {
        id: "downstream",
        type: "imageNode",
        position: { x: 400, y: 0 },
        data: {},
        selected: false,
    },
];

const edges: Edge[] = [
    {
        id: "incoming",
        source: "reference",
        target: "generator",
        sourceHandle: "image",
        targetHandle: "image",
    },
    {
        id: "outgoing",
        source: "generator",
        target: "downstream",
    },
];

describe("duplicate selection", () => {
    it("copies the incoming reference line but not the reference node or outgoing line", () => {
        const selection = collectCopyableSelection(nodes, edges);
        expect(selection.nodes.map((node) => node.id)).toEqual(["generator"]);
        expect(selection.edges.map((edge) => edge.id)).toEqual(["incoming"]);
    });

    it("keeps the original reference source and reconnects it to the pasted node", () => {
        const selection = collectCopyableSelection(nodes, edges);
        let sequence = 0;
        const duplicate = duplicateSelection(selection, {
            makeId: () => `new-${++sequence}`,
            offset: 40,
            selected: true,
        });
        expect(duplicate.nodes[0]).toMatchObject({
            id: "new-1",
            selected: true,
            position: { x: 240, y: 40 },
        });
        expect(duplicate.edges[0]).toMatchObject({
            id: "new-2",
            source: "reference",
            target: "new-1",
            selected: false,
        });
    });

    it("recreates every direct reference line without copying reference nodes", () => {
        const secondReference: Node = {
            id: "reference-2",
            type: "textGenImageNode",
            position: { x: 0, y: 160 },
            data: { fileKeys: ["ref-2.png"] },
            selected: false,
        };
        const secondEdge: Edge = {
            id: "incoming-2",
            source: "reference-2",
            target: "generator",
            sourceHandle: "out:images",
            targetHandle: "in:images",
        };
        const selection = collectCopyableSelection(
            [...nodes, secondReference],
            [...edges, secondEdge],
        );

        expect(selection.nodes.map((node) => node.id)).toEqual(["generator"]);
        expect(selection.edges.map((edge) => edge.id)).toEqual([
            "incoming",
            "incoming-2",
        ]);

        let sequence = 0;
        const duplicate = duplicateSelection(selection, {
            makeId: () => `new-${++sequence}`,
        });
        expect(duplicate.edges).toMatchObject([
            { source: "reference", target: "new-1" },
            { source: "reference-2", target: "new-1" },
        ]);
    });
});
