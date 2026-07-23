/**
 * Render ReactFlow `<Handle>` components for an ABI feature.
 *
 * Inputs:  one target Handle per `kind:"handle"` field (id = `in:<field>`)
 * Outputs: one source Handle per ABI output route (id = `out:<field>`)
 *
 * Layout: all handles emit from the vertical center of the node's left
 * (targets) and right (sources) edges, regardless of how many there are.
 * Callers can override layout via `style` or a `layout` prop later if needed.
 */

import { Handle, Position } from "@xyflow/react";
import { useMemo } from "react";

import type { NodeSlot } from "@/generated/abi";
import {
    type AbiTopology,
    getAbiTopology,
    sourceHandleId,
    targetHandleId,
} from "@/lib/abi/handle-introspect";
import { resolveSpec } from "@/lib/abi/resolve";
import type { FieldSourceOverride, SourceSpec } from "@/lib/abi/sources";

export interface AbiHandlesProps<F extends NodeSlot> {
    feature: F;
    /** Same sourceSpec as passed to `useAbiForm` / `useAbiExecution`. */
    sourceSpec?: SourceSpec<F>;
    /** Override the standard left/right positioning. */
    targetPosition?: Position;
    sourcePosition?: Position;
    /** Add a CSS class to all rendered handles. */
    handleClassName?: string;
}

interface HandleSpec {
    id: string;
    role: "target" | "source";
    /** Vertical offset (0..1) along the side. */
    offset: number;
}

function distributeHandles(targets: string[], sources: string[]): HandleSpec[] {
    const out: HandleSpec[] = [];
    // Give every input/output its own hit target. Overlapping handles made it
    // impossible to reliably choose the intended input on multi-input nodes.
    targets.forEach((id, index) =>
        out.push({
            id,
            role: "target",
            offset: (index + 1) / (targets.length + 1),
        }),
    );
    sources.forEach((id, index) =>
        out.push({
            id,
            role: "source",
            offset: (index + 1) / (sources.length + 1),
        }),
    );
    return out;
}

function getHandleIds<F extends NodeSlot>(
    feature: F,
    sourceSpec: SourceSpec<F> | undefined,
    topology: AbiTopology,
): { targets: string[]; sources: string[] } {
    const spec = resolveSpec(
        feature,
        sourceSpec as Record<string, FieldSourceOverride> | undefined,
    );
    const targets: string[] = [];
    for (const field of topology.inputOrder) {
        const f = spec.fields[field];
        if (f?.kind === "handle") {
            targets.push(targetHandleId(field));
        }
    }
    const sources = topology.outputs.map((o) => sourceHandleId(o.field));
    return { targets, sources };
}

export function AbiHandles<F extends NodeSlot>({
    feature,
    sourceSpec,
    targetPosition = Position.Left,
    sourcePosition = Position.Right,
    handleClassName,
}: AbiHandlesProps<F>) {
    const handles = useMemo(() => {
        const topology = getAbiTopology(feature);
        const { targets, sources } = getHandleIds(
            feature,
            sourceSpec,
            topology,
        );
        return distributeHandles(targets, sources);
    }, [feature, sourceSpec]);

    return (
        <>
            {handles.map((h) => (
                <Handle
                    key={`${h.role}:${h.id}`}
                    type={h.role}
                    position={
                        h.role === "target" ? targetPosition : sourcePosition
                    }
                    id={h.id}
                    isConnectable={true}
                    isConnectableStart={h.role === "source"}
                    isConnectableEnd={h.role === "target"}
                    className={handleClassName}
                    style={{
                        top: `${(h.offset * 100).toFixed(2)}%`,
                        width: h.role === "target" ? 24 : 28,
                        height: h.role === "target" ? 24 : 28,
                        zIndex: 50,
                        pointerEvents: "all",
                        cursor: "crosshair",
                        background: h.role === "target" ? "#3b82f6" : "#f59e0b",
                        border: "3px solid white",
                        boxShadow:
                            h.role === "target"
                                ? "0 0 0 4px rgba(59,130,246,.2)"
                                : "0 0 0 4px rgba(245,158,11,.25)",
                    }}
                />
            ))}
        </>
    );
}
