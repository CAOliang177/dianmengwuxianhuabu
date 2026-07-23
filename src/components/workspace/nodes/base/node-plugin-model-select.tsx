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
};

const NEW_CHANNEL_MODEL_LABELS: Record<string, string> = {
	"gemini-3-pro-image-preview": "Nano Banana Pro（Gemini 3 Pro）",
	"gemini-3.1-flash-image-preview": "Nano Banana 2 预览版",
	"gpt-image-2-pro": "GPT Image 2 Pro",
};

function modelDisplayName(pluginId: string, model: string): string {
    if (pluginId === "tongflow-api-new-channel")
        return NEW_CHANNEL_MODEL_LABELS[model] ?? model;
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
