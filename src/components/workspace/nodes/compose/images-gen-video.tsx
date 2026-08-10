import { useNodesData } from "@xyflow/react";
import { Film, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATIONS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import type { SourceSpec } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import { useResolvedPluginId } from "../base/node-plugin-id-select";
import { NodeTextarea } from "../base/node-textarea";
import { SeedancePromptOptimizer } from "../base/seedance-prompt-optimizer";
import {
    isSeedance25Model,
    normalizeVideoResolution,
    VideoResolutionPicker,
} from "../base/video-resolution-picker";
import {
    materialReferenceLabels,
    parseVolcengineMaterials,
    VolcengineMaterialPicker,
    validateVolcengineMaterials,
    volcengineMaterialLimitsForModel,
} from "../base/volcengine-material-picker";

// Seedance 2.5 accepts up to 30 image references; older Seedance routes keep
// the conservative 9-image limit. The plugin enforces the same limit server
// side, so the picker cannot accidentally submit an oversized request.
const MAX_IMAGES_DEFAULT = 9;

// `images` collects every connected image edge. `text` may come from an upstream
// textNode (via the auto-rendered `in:text` handle) or be typed manually — the
// upstream edge wins, the textarea value is the fallback (`manual: true`).
// Defined centrally in NODE_TYPE_SOURCE_SPEC so compose-time edge creation
// assigns the correct `in:text` targetHandle (matching sibling compose nodes).
const sourceSpec =
    NODE_TYPE_SOURCE_SPEC.imagesGenVideoNode as SourceSpec<"images-gen-video">;

const ImagesGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"images-gen-video", "imagesGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("images-gen-video", sourceSpec);
    const { resolved: activePluginId } = useResolvedPluginId(
        "images-gen-video",
        data,
    );

    const activeModel = String(data.pluginModel || "").trim();
    const isVolcengine = activePluginId === "tongflow-api-bytedance";
    const isSeedance25 = isVolcengine && isSeedance25Model(activeModel);
    const maxImages = isSeedance25 ? 30 : MAX_IMAGES_DEFAULT;
    const durationMax = isSeedance25 ? 30 : 15;
    const allowedDurations = VIDEO_DURATIONS.filter(
        ({ value }) => Number(value) >= 4 && Number(value) <= durationMax,
    );

    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    const allImages = fromNodes
        .filter((node) => node.type === "imageNode")
        .flatMap((node) => coerceBaseNodeData(node.data).fileKeys ?? []);

    const textNode = fromNodes.find((node) => node.type === "textNode");
    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) return coerceBaseNodeData(textNode?.data).texts || [];
        return [];
    }, [textNode]);
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;

    const width = (form.state.width as number | undefined) ?? 1280;
    const height = (form.state.height as number | undefined) ?? 720;
    const duration = (form.state.duration as number | undefined) ?? 5;
    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    const userPrompt = (form.state.text as string | undefined) ?? "";
    const storedMaterialAssetIds =
        (form.state.asset_ids as string | undefined)?.trim() ?? "";
    const materialAssetIds = isVolcengine ? storedMaterialAssetIds : "";
    const materialItems = parseVolcengineMaterials(materialAssetIds);
    const materialLimits = volcengineMaterialLimitsForModel(activeModel);
    const materialValidationError = validateVolcengineMaterials(
        materialItems,
        { image: allImages.length },
        materialLimits,
    );
    const storedResolution = form.state.resolution as string | undefined;
    const resolution = normalizeVideoResolution(storedResolution, activeModel);
    const imageLimitError =
        allImages.length > maxImages
            ? `当前模型最多支持 ${maxImages} 张连接图片，请删除多余连接后再生成`
            : "";
    const materialLabels = materialReferenceLabels(materialItems, {
        image: allImages.length,
    });
    const connectedImageLabels = allImages
        .slice(0, maxImages)
        .map((_, index) => `@图片${index + 1}`);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const clampedDuration = Math.max(4, Math.min(durationMax, duration));
        if (duration !== clampedDuration) form.set("duration", clampedDuration);
    }, [duration, durationMax, form.set]);

    useEffect(() => {
        if (!activePluginId) return;
        if (!isVolcengine && storedMaterialAssetIds) form.set("asset_ids", "");
    }, [activePluginId, isVolcengine, storedMaterialAssetIds, form.set]);

    useEffect(() => {
        if (!activePluginId) return;
        if (isVolcengine) {
            if (storedResolution !== resolution)
                form.set("resolution", resolution);
            return;
        }
        if (storedResolution !== undefined) form.set("resolution", undefined);
    }, [activePluginId, isVolcengine, storedResolution, resolution, form.set]);

    const insertImageRef = useCallback(
        (imageRef: string) => {
            if (!textareaRef.current) return;
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText =
                userPrompt.substring(0, start) +
                imageRef +
                userPrompt.substring(end);
            form.set("text", newText);
            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + imageRef.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        },
        [userPrompt, form],
    );

    return (
        <AbiNodeShell
            feature="images-gen-video"
            sourceSpec={sourceSpec}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imagesGenVideo")}
            icon={<Film className="h-5 w-5" />}
            executeLabel={t("actions.generateVideo")}
            executeDisabled={
                (allImages.length < 2 && !materialAssetIds) ||
                !!imageLimitError ||
                !!materialValidationError
            }
        >
            <div className="p-4 space-y-4">
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

                <DurationPicker
                    durations={allowedDurations}
                    value={String(duration)}
                    onChange={(dur) => form.set("duration", Number(dur))}
                />

                <div className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                        {t("imageFusion.imageReference")}
                        <span className="ml-2 text-xs font-normal">
                            ({allImages.length}/{maxImages})
                        </span>
                    </span>
                    <div className="flex gap-3 flex-wrap">
                        {allImages.slice(0, maxImages).map((fileKey, index) => (
                            <MediaThumbnail
                                key={`${fileKey}:${index}`}
                                fileKey={fileKey}
                                label={`${t("imageFusion.imageLabel")}${index + 1}`}
                                type="image"
                                onClick={() =>
                                    insertImageRef(
                                        `${t("imageFusion.imageLabel")}${index + 1}`,
                                    )
                                }
                            />
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t("imageFusion.imageReferenceHint")}
                    </p>
                    {imageLimitError && (
                        <p className="text-xs text-destructive">
                            {imageLimitError}
                        </p>
                    )}
                </div>

                {isVolcengine && (
                    <VolcengineMaterialPicker
                        value={materialAssetIds}
                        onChange={(value) => form.set("asset_ids", value)}
                        occupied={{ image: allImages.length }}
                        limits={materialLimits}
                    />
                )}

                {isSeedance25 && !hasUpstreamTexts && (
                    <SeedancePromptOptimizer
                        value={userPrompt}
                        onChange={(value) => form.set("text", value)}
                        duration={duration}
                        referenceLabels={[
                            ...connectedImageLabels,
                            ...materialLabels,
                        ]}
                    />
                )}

                {hasUpstreamTexts ? (
                    <div className="space-y-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="h-4 w-4" />
                            {t("imageFusion.fusionPrompt")}
                            {t("imageEdit.fromUpstream")}
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {upstreamTexts.map((text, index) => (
                                <div
                                    key={index}
                                    className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                >
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="h-4 w-4" />
                            {t("imageFusion.fusionPrompt")}
                        </span>
                        <NodeTextarea
                            ref={textareaRef}
                            showCard={false}
                            placeholder={t(
                                "imageFusion.fusionPromptPlaceholder",
                            )}
                            {...form.bind("text")}
                            rows={4}
                        />
                    </div>
                )}
            </div>
        </AbiNodeShell>
    );
};

export default memo(ImagesGenVideoNode);
