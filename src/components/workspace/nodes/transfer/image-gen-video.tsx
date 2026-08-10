import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATION_DEFAULT,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { parseTargetHandleId } from "@/lib/abi/handle-introspect";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import type { SourceSpec } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { useResolvedPluginId } from "../base/node-plugin-id-select";
import { NodeTextarea } from "../base/node-textarea";
import { SeedancePromptOptimizer } from "../base/seedance-prompt-optimizer";
import { VideoDurationSlider } from "../base/video-duration-slider";
import {
    isSeedance25Model,
    normalizeVideoResolution,
    VideoResolutionPicker,
} from "../base/video-resolution-picker";
import {
    materialReferenceLabels,
    parseVolcengineMaterials,
    VolcengineMaterialPicker,
    volcengineMaterialLimitsForModel,
} from "../base/volcengine-material-picker";

// `text` is a config field on this transfer node (manual prompt). Image+audio
// wired upstream uses `imageGenVideoComposeNode` (default handles).
const IMAGE_GEN_VIDEO_TRANSFER_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.imageGenVideoNode as SourceSpec<"image-gen-video">;

const ImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-video", "imageGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "image-gen-video",
        IMAGE_GEN_VIDEO_TRANSFER_SOURCE_SPEC,
    );
    const { resolved: activePluginId } = useResolvedPluginId(
        "image-gen-video",
        data,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const hasImageInput = useMemo(() => {
        if (!nodeId) return false;
        return edges.some((edge) => {
            if (edge.target !== nodeId) return false;
            if (parseTargetHandleId(edge.targetHandle) !== "image")
                return false;
            const source = nodeLookup.get(edge.source);
            if (!source) return false;
            const keys = coerceBaseNodeData(source.data).fileKeys;
            return (keys?.length ?? 0) > 0;
        });
    }, [nodeId, edges, nodeLookup]);

    const promptText = (form.state.text as string | undefined)?.trim() ?? "";

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 576;
    const durationSeconds =
        (form.state.duration as number | undefined) ?? VIDEO_DURATION_DEFAULT;
    const activeModel = String(data.pluginModel || "").trim();
    const isVolcengine = activePluginId === "tongflow-api-bytedance";
    const isSeedance25 = isVolcengine && isSeedance25Model(activeModel);
    const durationMax = isSeedance25 ? 30 : 15;
    const storedMaterialValue =
        (form.state.asset_ids as string | undefined) ?? "";
    const materialValue = isVolcengine ? storedMaterialValue : "";
    const materialItems = parseVolcengineMaterials(materialValue);
    const materialLabels = materialReferenceLabels(materialItems, { image: 1 });
    const storedResolution = form.state.resolution as string | undefined;
    const resolution = normalizeVideoResolution(storedResolution, activeModel);
    const materialLimits = volcengineMaterialLimitsForModel(activeModel);

    useEffect(() => {
        if (form.state.duration === undefined)
            form.set("duration", VIDEO_DURATION_DEFAULT);
    }, [form.state.duration, form.set]);

    useEffect(() => {
        if (!activePluginId) return;
        if (!isVolcengine && storedMaterialValue) form.set("asset_ids", "");
    }, [activePluginId, isVolcengine, storedMaterialValue, form.set]);

    useEffect(() => {
        if (!activePluginId) return;
        if (isVolcengine) {
            if (storedResolution !== resolution)
                form.set("resolution", resolution);
            return;
        }
        if (storedResolution !== undefined) form.set("resolution", undefined);
    }, [activePluginId, isVolcengine, storedResolution, resolution, form.set]);

    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[0];

    return (
        <AbiNodeShell
            feature="image-gen-video"
            sourceSpec={IMAGE_GEN_VIDEO_TRANSFER_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenVideo")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={!hasImageInput || !promptText}
        >
            <div className="p-4 space-y-4">
                {isVolcengine && (
                    <>
                        <VolcengineMaterialPicker
                            value={materialValue}
                            onChange={(value) => form.set("asset_ids", value)}
                            occupied={{ image: 1 }}
                            limits={materialLimits}
                        />
                        {isSeedance25 && (
                            <SeedancePromptOptimizer
                                value={promptText}
                                onChange={(value) => form.set("text", value)}
                                duration={durationSeconds}
                                referenceLabels={["@图片1", ...materialLabels]}
                            />
                        )}
                    </>
                )}
                <NodeTextarea
                    rows={4}
                    placeholder={t("common.videoDesc")}
                    {...form.bind("text")}
                />

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={(ratio) =>
                        form.patch({ width: ratio.width, height: ratio.height })
                    }
                    showSize
                />

                {isVolcengine && (
                    <VideoResolutionPicker
                        model={activeModel}
                        value={resolution}
                        onChange={(value) => form.set("resolution", value)}
                    />
                )}

                <VideoDurationSlider
                    value={durationSeconds}
                    onChange={(dur) => form.set("duration", dur)}
                    min={4}
                    max={durationMax}
                />
            </div>
        </AbiNodeShell>
    );
};

ImageGenVideoNode.displayName = "ImageGenVideoNode";

export default memo(ImageGenVideoNode);
