"use client";

import { useNodeId } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import useFlow from "@/hooks/use-flow";
import { useNodePluginModels } from "@/hooks/use-plugins-registry";
import type { BaseNodeData } from "@/types/nodes";
import { useResolvedPluginId } from "./node-plugin-id-select";
import { NodePluginSelect } from "./node-plugin-select";

type NodePluginModelSelectProps = {
    nodeSlot: string;
    data: BaseNodeData;
    compact?: boolean;
    /** Show all models as a horizontal wrapping button group. */
    horizontal?: boolean;
};

const NEW_CHANNEL_MODEL_LABELS: Record<string, string> = {
    "gemini-3-pro-image-preview": "Nano Banana Pro（Gemini 3 Pro）",
    "gemini-3.1-flash-image-preview": "Nano Banana 2 预览版",
    "gpt-image-2-pro": "GPT Image 2 Pro",
};

const BYTEDANCE_MODEL_LABELS: Record<string, string> = {
    "doubao-seedance-2-5-260628": "Seedance 2.5",
    "doubao-seedance-2-0-260128": "Seedance 2.0",
    "doubao-seedance-2-0-fast-260128": "Seedance 2.0 Fast",
};

export function modelDisplayName(pluginId: string, model: string): string {
    if (pluginId === "tongflow-api-new-channel")
        return NEW_CHANNEL_MODEL_LABELS[model] ?? model;
    if (pluginId === "tongflow-api-bytedance")
        return BYTEDANCE_MODEL_LABELS[model] ?? model;
    return model;
}

/**
 * Model selector for router-style plugins that declare per-slot model lists
 * (`TONGFLOW_SLOT_MODELS`). Renders nothing when the active plugin declares no
 * models, so single-model plugins are visually unchanged. The selection is
 * stored as `data.pluginModel` and travels top-level (like `pluginId`) through
 * the create-task API and workflow export.
 */
export function NodePluginModelSelect({
    nodeSlot,
    data,
    compact = false,
    horizontal = false,
}: NodePluginModelSelectProps) {
    const id = useNodeId()!;
    const updates = useFlow((s) => s.updates);
    const t = useTranslations("Workspace.nodes.base");

    const { resolved: pluginId } = useResolvedPluginId(nodeSlot, data);
    const models = useNodePluginModels(nodeSlot, pluginId);

    const current = String(data.pluginModel ?? "").trim();
    const resolved = models.includes(current) ? current : (models[0] ?? "");

    // Persist the default (or replace a stale model after a plugin switch)
    // after paint, mirroring the pluginId default write in
    // useNodePluginResolver.
    useEffect(() => {
        if (resolved === current) return;
        updates(id, { ...data, pluginModel: resolved });
    }, [id, data, current, resolved, updates]);

    const options = useMemo(
        () =>
            models.map((model) => ({
                value: model,
                label: modelDisplayName(pluginId, model),
            })),
        [models, pluginId],
    );

    if (options.length === 0) return null;

    if (horizontal) {
        return (
            <fieldset className="flex w-full flex-wrap gap-2">
                <legend className="sr-only">{t("pluginModelTitle")}</legend>
                {options.map((option) => {
                    const selected = option.value === resolved;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            className={`nodrag min-w-[132px] flex-1 rounded-xl border px-3 py-2.5 text-center text-xs font-medium transition ${
                                selected
                                    ? "border-foreground bg-foreground text-background shadow-sm"
                                    : "border-border bg-background text-foreground hover:border-foreground/40 hover:bg-muted"
                            }`}
                            onClick={() =>
                                updates(id, {
                                    ...data,
                                    pluginModel: option.value,
                                })
                            }
                        >
                            {option.label}
                        </button>
                    );
                })}
            </fieldset>
        );
    }

    return (
        <NodePluginSelect
            value={resolved}
            onValueChange={(value) =>
                updates(id, { ...data, pluginModel: value })
            }
            options={options}
            title={t("pluginModelTitle")}
            compact={compact}
        />
    );
}
