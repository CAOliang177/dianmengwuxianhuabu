import type { Edge } from "@xyflow/react";
import { NodeToolbar, Position, useNodeId, useStore } from "@xyflow/react";
import {
    Atom,
    ChevronDown,
    Download,
    ImagePlus,
    LoaderCircle,
    Maximize2,
    SlidersHorizontal,
    Wand2,
    X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { showErrorToast } from "@/components/ui/error-toast";
import {
    type AspectRatio,
    findClosestImageResolutionTier,
    getImageDimensions,
    IMAGE_ASPECT_RATIOS,
    IMAGE_RESOLUTION_TIERS,
    normalizeImageDimensions,
    type ResolutionTier,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";
import useFlow from "@/hooks/use-flow";
import type { Task } from "@/hooks/use-task";
import type { SourceSpec } from "@/lib/abi/sources";
import { collectAll, configField } from "@/lib/abi/sources";
import {
    readGenerationHistory,
    withGenerationHistory,
} from "@/lib/generation-history";
import {
    collectConnectedImageReferenceEntries,
    collectConnectedImageReferences,
} from "@/lib/image-references";
import { logger } from "@/lib/logger";
import {
    getAbiNodeBySlot,
    resolveAbiOutputMappings,
} from "@/lib/schema/tongflow-abi";
import {
    computeOutputView,
    normalizeTaskPayloadData,
} from "@/lib/task/payload";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import {
    NodePluginIdSelect,
    useResolvedPluginId,
} from "../base/node-plugin-id-select";
import {
    modelDisplayName,
    NodePluginModelSelect,
} from "../base/node-plugin-model-select";
import { NodeTextarea } from "../base/node-textarea";
import { ResolutionPicker } from "../base/resolution-picker";
import {
    downloadImageFile,
    ZoomableImageViewer,
} from "../base/zoomable-image-viewer";

type TextGenImageNodeProps = TongflowPluginNodeProps<
    "image-fusion",
    "textGenImageNode"
>;
type ImageReferenceEntry = {
    fileKey: string;
    edgeId?: string;
    bootstrapIndex?: number;
};

// One LibTV-style image node handles all modes:
// no reference -> image generation; one reference -> image edit;
// multiple references -> image fusion. The Banana plugin dispatches the
// appropriate API behavior while the canvas keeps one stable node/port shape.
const UNIFIED_IMAGE_SOURCE_SPEC = {
    images: collectAll({ nodeType: "imageNode" }),
    text: configField(),
} satisfies SourceSpec<"image-fusion">;

const DEFAULT_RATIO =
    IMAGE_ASPECT_RATIOS.find((ratio) => ratio.value === "1:1") ??
    IMAGE_ASPECT_RATIOS[0];
const REFERENCE_STYLES = [
    "border-cyan-400/80 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
    "border-fuchsia-400/80 bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
    "border-amber-400/80 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    "border-emerald-400/80 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    "border-violet-400/80 bg-violet-500/15 text-violet-600 dark:text-violet-300",
] as const;

// Image providers occasionally return dimensions that are only approximately a
// requested ratio (for example 2048x2047 for 1:1).  Canvas cards should be sized
// by their visual ratio, not by pixel resolution, so snap near-standard outputs
// to one canonical footprint while preserving genuinely unusual ratios.
const CANONICAL_PREVIEW_RATIOS = IMAGE_ASPECT_RATIOS;

function normalizePreviewDimensions(dimensions: {
    width: number;
    height: number;
}) {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
        return { width: 1, height: 1 };
    }

    const actualRatio = dimensions.width / dimensions.height;
    const nearest = CANONICAL_PREVIEW_RATIOS.reduce((best, candidate) => {
        const bestDistance = Math.abs(actualRatio - best.width / best.height);
        const candidateDistance = Math.abs(
            actualRatio - candidate.width / candidate.height,
        );
        return candidateDistance < bestDistance ? candidate : best;
    });
    const nearestRatio = nearest.width / nearest.height;

    return Math.abs(actualRatio - nearestRatio) / nearestRatio <= 0.035
        ? nearest
        : dimensions;
}

const TextGenImageNode = ({ selected, data }: TextGenImageNodeProps) => {
    const form = useAbiForm("image-fusion", UNIFIED_IMAGE_SOURCE_SPEC);
    const nodeId = useNodeId();
    const promptRef = useRef<HTMLTextAreaElement>(null);
    const [activeReference, setActiveReference] = useState<number | null>(null);
    const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);
    const localText = (form.state.text as string | undefined) ?? "";

    useEffect(() => {
        if (!viewerOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const close = (event: KeyboardEvent) => {
            if (event.key === "Escape") setViewerOpen(false);
        };
        window.addEventListener("keydown", close);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", close);
        };
    }, [viewerOpen]);

    const { referenceCount, referenceEntries, referenceImages } = useMemo<{
        referenceCount: number;
        referenceEntries: ImageReferenceEntry[];
        referenceImages: string[];
    }>(() => {
        if (!nodeId)
            return {
                referenceCount: 0,
                referenceEntries: [],
                referenceImages: [],
            };
        const connectedEntries = collectConnectedImageReferenceEntries(
            nodeId,
            edges,
            (sourceId) => nodeLookup.get(sourceId),
        );
        const bootstrapPreviews = Array.isArray(
            (data as Record<string, unknown>).referenceBootstrapFileKeys,
        )
            ? (
                  (data as Record<string, unknown>)
                      .referenceBootstrapFileKeys as string[]
              ).filter(Boolean)
            : [];
        const entries =
            connectedEntries.length > 0
                ? connectedEntries
                : bootstrapPreviews.map((fileKey, bootstrapIndex) => ({
                      fileKey,
                      bootstrapIndex,
                  }));
        return {
            referenceCount: entries.length,
            referenceEntries: entries,
            referenceImages: entries.map((entry) => entry.fileKey),
        };
    }, [nodeId, edges, nodeLookup, data]);

    const removeImageReference = useCallback(
        (index: number) => {
            if (!nodeId) return;
            const entry = referenceEntries[index];
            if (!entry) return;
            if (entry.edgeId) {
                useFlow.getState().removeEdges([entry.edgeId]);
            } else {
                const current = useFlow
                    .getState()
                    .nodes.find((node) => node.id === nodeId);
                const currentData = (current?.data ?? {}) as Record<
                    string,
                    unknown
                >;
                const bootstrap = Array.isArray(
                    currentData.referenceBootstrapFileKeys,
                )
                    ? (currentData.referenceBootstrapFileKeys as string[])
                    : [];
                useFlow.getState().updates(nodeId, {
                    ...currentData,
                    referenceBootstrapFileKeys: bootstrap.filter(
                        (_fileKey, bootstrapIndex) =>
                            bootstrapIndex !== entry.bootstrapIndex,
                    ),
                });
            }
            // Keep @图片N exactly as authored. It is prompt text and must not
            // be deleted merely because the current material is detached.
        },
        [nodeId, referenceEntries],
    );

    useEffect(() => {
        if (!nodeId || referenceImages.length === 0) return;
        const current = useFlow
            .getState()
            .nodes.find((node) => node.id === nodeId);
        const currentData = (current?.data ?? {}) as Record<string, unknown>;
        if (!("referenceBootstrapFileKeys" in currentData)) return;
        const flow = useFlow.getState();
        const nodeMap = new Map(flow.nodes.map((node) => [node.id, node]));
        const hasConnectedReference =
            collectConnectedImageReferences(nodeId, flow.edges, (sourceId) =>
                nodeMap.get(sourceId),
            ).length > 0;
        if (!hasConnectedReference) return;
        const nextData = { ...currentData };
        delete nextData.referenceBootstrapFileKeys;
        useFlow.getState().updates(nodeId, nextData);
    }, [nodeId, referenceImages]);

    const { url: firstReferenceUrl } = useFileAsyncLoader(referenceImages[0], {
        priority: "high",
    });
    const [referenceDimensions, setReferenceDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);

    useEffect(() => {
        if (!firstReferenceUrl) {
            setReferenceDimensions(null);
            return;
        }
        const image = new Image();
        image.onload = () =>
            setReferenceDimensions({
                width: image.naturalWidth,
                height: image.naturalHeight,
            });
        image.onerror = () => setReferenceDimensions(null);
        image.src = firstReferenceUrl;
        return () => {
            image.onload = null;
            image.onerror = null;
        };
    }, [firstReferenceUrl]);

    const insertReferenceToken = useCallback(
        (index: number) => {
            const token = `@图片${index + 1}`;
            const textarea = promptRef.current;
            const currentValue = textarea?.value ?? localText;
            const start = textarea?.selectionStart ?? currentValue.length;
            const end = textarea?.selectionEnd ?? start;
            const before = currentValue.slice(0, start);
            const after = currentValue.slice(end);
            const prefix = before.length > 0 && !/\s$/.test(before) ? " " : "";
            const suffix = after.length > 0 && !/^\s/.test(after) ? " " : "";
            const inserted = `${prefix}${token}${suffix}`;
            const nextValue = `${before}${inserted}${after}`;
            const nextCursor = before.length + inserted.length;

            form.patch({ text: nextValue });
            setActiveReference(index);
            window.setTimeout(() => setActiveReference(null), 900);
            requestAnimationFrame(() => {
                promptRef.current?.focus();
                promptRef.current?.setSelectionRange(nextCursor, nextCursor);
            });
        },
        [form, localText],
    );
    const width =
        (form.state.width as number | undefined) ?? DEFAULT_RATIO.width;
    const height =
        (form.state.height as number | undefined) ?? DEFAULT_RATIO.height;

    const storedTier = IMAGE_RESOLUTION_TIERS.find(
        (tier) => tier.value === data.outputResolutionTier,
    );
    const normalizedSize = useMemo(
        () => normalizeImageDimensions(width, height, storedTier),
        [width, height, storedTier],
    );
    const currentRatio = normalizedSize.ratio;
    const currentTier =
        storedTier ??
        findClosestImageResolutionTier(width, height, currentRatio);
    const updateNodeMeta = useCallback(
        (patch: Record<string, unknown>) => {
            if (!nodeId) return;
            const current = useFlow
                .getState()
                .nodes.find((node) => node.id === nodeId);
            if (!current) return;
            useFlow.getState().updates(nodeId, {
                ...(current.data as Record<string, unknown>),
                ...patch,
            });
        },
        [nodeId],
    );

    useEffect(() => {
        const needsDimensionMigration =
            form.state.width === undefined ||
            form.state.height === undefined ||
            width !== normalizedSize.width ||
            height !== normalizedSize.height;
        if (needsDimensionMigration) {
            form.patch({
                width: normalizedSize.width,
                height: normalizedSize.height,
            });
        }
        if (
            data.followReferenceRatio === true ||
            data.outputResolutionTier !== currentTier.value
        ) {
            updateNodeMeta({
                followReferenceRatio: false,
                outputResolutionTier: currentTier.value,
            });
        }
    }, [
        form.state.width,
        form.state.height,
        width,
        height,
        normalizedSize.width,
        normalizedSize.height,
        data.followReferenceRatio,
        data.outputResolutionTier,
        currentTier.value,
        form,
        updateNodeMeta,
    ]);

    const applySize = useCallback(
        (ratio: AspectRatio, tier: ResolutionTier) => {
            form.patch(getImageDimensions(ratio, tier));
            updateNodeMeta({
                followReferenceRatio: false,
                outputResolutionTier: tier.value,
            });
        },
        [form, updateNodeMeta],
    );

    const changeResolutionTier = useCallback(
        (tier: ResolutionTier) => {
            applySize(currentRatio, tier);
        },
        [applySize, currentRatio],
    );

    const handleTaskUpdate = useCallback(
        (task: Task) => {
            if (!nodeId || task.status !== "COMPLETED") return false;
            const payload = normalizeTaskPayloadData({
                data: task.data,
                result: task.result,
            });
            const abiNode = getAbiNodeBySlot("image-fusion");
            const routes = abiNode ? resolveAbiOutputMappings(abiNode) : [];
            const output = Object.values(
                computeOutputView(routes, payload),
            ).find((channel) => channel.nodeType === "imageNode");
            if (!output?.values.length) {
                logger.error(
                    "[TextGenImageNode] Task completed without a usable image output",
                    { task, payload, routes },
                );
                showErrorToast({
                    message:
                        "任务已完成，但接口没有返回可用图片。请检查该模型的返回格式或稍后重试。",
                });
                return true;
            }
            const current = useFlow
                .getState()
                .nodes.find((node) => node.id === nodeId);
            const currentData = (current?.data ?? {}) as Record<
                string,
                unknown
            >;
            const now = Date.now();
            const previousHistory = readGenerationHistory(currentData, now);
            const generationHistory = readGenerationHistory(
                {
                    generationHistoryVersion: 2,
                    generationHistoryRecords: [
                        ...output.values.map((fileKey) => ({
                            fileKey,
                            createdAt: now,
                        })),
                        ...previousHistory,
                    ],
                },
                now,
            );
            useFlow.getState().updates(
                nodeId,
                {
                    ...withGenerationHistory(currentData, generationHistory),
                    fileKeys: output.values,
                },
                { immediate: true },
            );
            return true;
        },
        [nodeId],
    );

    const generatedImage = data.fileKeys?.[0];
    const { url: generatedImageUrl } = useFileAsyncLoader(generatedImage, {
        priority: "high",
    });
    const [generatedImageLoadFailed, setGeneratedImageLoadFailed] =
        useState(false);
    const [generatedDimensions, setGeneratedDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);

    useEffect(() => {
        setGeneratedDimensions(null);
        setGeneratedImageLoadFailed(false);
    }, [generatedImageUrl]);

    const compactRatioLabel =
        currentRatio.value === "custom"
            ? `${width}×${height}`
            : currentRatio.value;

    const collapsedPreviewUrl = generatedImageUrl ?? firstReferenceUrl;
    const collapsedPreviewDimensions = generatedImageUrl
        ? (generatedDimensions ?? { width, height })
        : (referenceDimensions ?? { width, height });
    const normalizedPreviewDimensions = normalizePreviewDimensions(
        collapsedPreviewDimensions,
    );
    const modeLabel = referenceCount > 0 ? "图生图" : "文生图";
    const { resolved: resolvedPluginId } = useResolvedPluginId(
        "image-fusion",
        data,
    );
    const selectedModel = String(data.pluginModel ?? "").trim();
    const selectedModelLabel = selectedModel
        ? modelDisplayName(resolvedPluginId, selectedModel)
        : "选择模型";

    return (
        <AbiNodeShell
            feature="image-fusion"
            sourceSpec={UNIFIED_IMAGE_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="!w-[480px] min-w-0 max-w-none overflow-visible border-white/15 bg-zinc-950 shadow-2xl"
            data={data}
            showPluginSelect={false}
            showExecuteButton={false}
            executeDisabled={!localText.trim()}
            onTaskUpdate={handleTaskUpdate}
        >
            {(execution) => (
                <>
                    <div
                        className="group relative !w-[480px] overflow-hidden rounded-lg bg-transparent transition-[aspect-ratio] duration-200"
                        style={{
                            aspectRatio: `${normalizedPreviewDimensions.width} / ${normalizedPreviewDimensions.height}`,
                        }}
                    >
                        {generatedImage && generatedImageLoadFailed ? (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-red-950/30 px-8 text-center text-red-100">
                                <Atom className="h-10 w-10 text-red-300" />
                                <div className="text-base font-semibold">
                                    生成结果加载失败
                                </div>
                                <div className="text-xs leading-5 text-red-200/80">
                                    任务已返回，但图片文件无法读取。请重新生成；若持续出现，请检查磁盘空间或安全软件拦截。
                                </div>
                            </div>
                        ) : collapsedPreviewUrl ? (
                            <img
                                src={collapsedPreviewUrl}
                                alt={`${modeLabel}预览`}
                                draggable={false}
                                className="h-full w-full object-contain"
                                title="双击全屏查看图片"
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    setViewerOpen(true);
                                }}
                                onLoad={(event) => {
                                    if (!generatedImageUrl) return;
                                    const nextWidth =
                                        event.currentTarget.naturalWidth;
                                    const nextHeight =
                                        event.currentTarget.naturalHeight;
                                    if (nextWidth <= 0 || nextHeight <= 0)
                                        return;
                                    setGeneratedDimensions((previous) =>
                                        previous?.width === nextWidth &&
                                        previous.height === nextHeight
                                            ? previous
                                            : {
                                                  width: nextWidth,
                                                  height: nextHeight,
                                              },
                                    );
                                }}
                                onError={() => {
                                    if (!generatedImageUrl) return;
                                    setGeneratedImageLoadFailed(true);
                                    showErrorToast({
                                        message:
                                            "任务已返回，但生成图片文件无法读取。请重试；若持续出现，请检查磁盘空间或安全软件拦截。",
                                    });
                                }}
                            />
                        ) : (
                            <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-300">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
                                    <ImagePlus className="h-9 w-9 text-zinc-500" />
                                </div>
                                <div className="text-sm text-zinc-500">
                                    选中节点后开始创作
                                </div>
                                <div className="absolute bottom-7 left-6 text-xs text-zinc-500">
                                    <div className="mb-2">尝试：</div>
                                    <div className="flex flex-col gap-2 text-sm font-medium text-zinc-200">
                                        <span className="inline-flex items-center gap-2">
                                            <ImagePlus className="h-4 w-4" />
                                            图生图
                                        </span>
                                        <span className="inline-flex items-center gap-2">
                                            <Maximize2 className="h-4 w-4" />
                                            图片高清
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-4 py-3 text-white">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Atom className="h-4 w-4" />
                                {modeLabel}
                            </div>
                            <span className="text-xs text-white/70">
                                {compactRatioLabel} / {currentTier.label}
                            </span>
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 py-3 text-xs text-white/70 opacity-0 transition group-hover:opacity-100">
                            <span>
                                {selected ? "正在编辑" : "选中节点即可编辑"}
                            </span>
                        </div>
                        {generatedImageUrl && (
                            <div className="nodrag absolute bottom-3 right-3 flex gap-2 opacity-0 transition group-hover:opacity-100">
                                <button
                                    type="button"
                                    className="flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 text-xs text-white shadow-lg backdrop-blur transition hover:bg-black/85"
                                    title="下载生成图片"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void downloadImageFile(
                                            generatedImageUrl,
                                        );
                                    }}
                                >
                                    <Download className="h-4 w-4" /> 下载
                                </button>
                                <button
                                    type="button"
                                    className="flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 text-xs text-white shadow-lg backdrop-blur transition hover:bg-black/85"
                                    title="预览、缩放、裁切或标注图片"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setViewerOpen(true);
                                    }}
                                >
                                    <Maximize2 className="h-4 w-4" /> 编辑图片
                                </button>
                            </div>
                        )}
                    </div>

                    <NodeToolbar
                        isVisible={selected}
                        position={Position.Bottom}
                        offset={14}
                        align="center"
                        className="nodrag nopan nowheel z-[80]"
                    >
                        <div className="nodrag nopan nowheel relative w-[min(800px,calc(100vw-32px))] select-text rounded-2xl border border-border/80 bg-background/95 p-3 text-foreground shadow-2xl backdrop-blur-xl [text-rendering:geometricPrecision]">
                            <div className="mb-2 flex min-h-16 flex-wrap items-start gap-2">
                                {referenceImages.length > 0 ? (
                                    referenceImages.map((fileKey, index) => (
                                        <button
                                            key={`${fileKey}:${index}`}
                                            type="button"
                                            className={`nodrag group relative rounded-xl border bg-muted/50 p-0.5 text-left transition hover:-translate-y-0.5 hover:ring-2 ${REFERENCE_STYLES[index % REFERENCE_STYLES.length]} ${activeReference === index ? "scale-105 ring-2 ring-current" : ""}`}
                                            title={`点击引用图片${index + 1}`}
                                            onClick={() =>
                                                insertReferenceToken(index)
                                            }
                                        >
                                            <MediaThumbnail
                                                fileKey={fileKey}
                                                label={`图片${index + 1}`}
                                                type="image"
                                            />
                                            {/* biome-ignore lint/a11y/useSemanticElements: a nested button would be invalid inside the clickable reference card */}
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                aria-label={`移除图片${index + 1}`}
                                                title="移除参考素材"
                                                className="nodrag nopan absolute right-1 top-1 z-20 hidden h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white shadow-md transition hover:bg-red-500 group-hover:flex"
                                                onPointerDown={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                }}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    removeImageReference(index);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === "Enter" ||
                                                        event.key === " "
                                                    ) {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        removeImageReference(
                                                            index,
                                                        );
                                                    }
                                                }}
                                            >
                                                <X className="h-3 w-3" />
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="flex h-16 min-w-32 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 text-xs text-muted-foreground">
                                        <ImagePlus className="h-4 w-4" />{" "}
                                        拖入参考图（可选）
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl bg-muted/35 px-3 py-1">
                                {referenceImages.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-2">
                                        {referenceImages.map(
                                            (fileKey, index) => (
                                                <button
                                                    key={`reference-token:${fileKey}:${index}`}
                                                    type="button"
                                                    className={`nodrag nopan rounded-md border px-2 py-0.5 text-xs font-medium transition hover:brightness-110 ${REFERENCE_STYLES[index % REFERENCE_STYLES.length]}`}
                                                    onClick={() =>
                                                        insertReferenceToken(
                                                            index,
                                                        )
                                                    }
                                                >
                                                    @图片{index + 1}
                                                </button>
                                            ),
                                        )}
                                    </div>
                                )}
                                <NodeTextarea
                                    ref={promptRef}
                                    rows={2}
                                    showCard={false}
                                    enableVoiceInput={false}
                                    enableFullscreen
                                    referenceMentions={referenceImages.map(
                                        (fileKey, index) => ({
                                            token: `@图片${index + 1}`,
                                            label: `参考图片${index + 1}`,
                                            description: fileKey,
                                            type: "image" as const,
                                        }),
                                    )}
                                    placeholder="描述想生成或修改的画面，点击参考图可插入图片编号…"
                                    className="nodrag nopan nowheel min-h-12 resize-none select-text border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0"
                                    {...form.bind("text")}
                                />
                            </div>

                            {advancedSettingsOpen && (
                                <div className="absolute bottom-14 left-3 right-3 z-30 max-h-[min(380px,55vh)] space-y-2 overflow-y-auto rounded-2xl border border-border bg-background/98 p-2 text-foreground shadow-2xl backdrop-blur-xl">
                                    <div className="rounded-xl border border-border bg-card p-2">
                                        <div className="mb-1.5 text-sm font-medium text-muted-foreground">
                                            模型
                                        </div>
                                        <NodePluginModelSelect
                                            nodeSlot="image-fusion"
                                            data={data}
                                            compact
                                            horizontal
                                        />
                                    </div>
                                    <AspectRatioPicker
                                        ratios={IMAGE_ASPECT_RATIOS}
                                        value={{
                                            ...currentRatio,
                                            width,
                                            height,
                                        }}
                                        onChange={(ratio) =>
                                            applySize(ratio, currentTier)
                                        }
                                        showSize
                                        compact
                                    />
                                    <ResolutionPicker
                                        tiers={IMAGE_RESOLUTION_TIERS}
                                        value={currentTier.value}
                                        onChange={changeResolutionTier}
                                        compact
                                    />
                                </div>
                            )}

                            <div className="relative z-40 mt-2 flex items-center gap-1 border-t border-border/70 bg-background/95 pt-2">
                                <NodePluginIdSelect
                                    nodeSlot="image-fusion"
                                    data={data}
                                    compact
                                />
                                <button
                                    type="button"
                                    className="flex h-9 min-w-0 shrink items-center gap-1.5 rounded-lg bg-muted/70 px-3 text-xs text-foreground transition hover:bg-muted"
                                    onClick={() =>
                                        setAdvancedSettingsOpen((open) => !open)
                                    }
                                    aria-expanded={advancedSettingsOpen}
                                    title={`${selectedModelLabel} · ${compactRatioLabel} / ${currentTier.label}`}
                                >
                                    <SlidersHorizontal className="h-4 w-4" />
                                    <span className="max-w-48 truncate">
                                        {selectedModelLabel}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {compactRatioLabel} /{" "}
                                        {currentTier.label}
                                    </span>
                                    <ChevronDown
                                        className={`h-3.5 w-3.5 transition-transform ${advancedSettingsOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                                <div className="flex-1" />
                                {execution.loading && execution.canCancel && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-9"
                                        onClick={execution.cancel}
                                    >
                                        <X className="h-4 w-4" /> 取消
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="icon"
                                    className="h-10 w-10 rounded-full shadow-md"
                                    onClick={execution.run}
                                    disabled={
                                        !localText.trim() ||
                                        !execution.canRun ||
                                        execution.loading
                                    }
                                >
                                    {execution.loading ? (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Wand2 className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </NodeToolbar>
                    {viewerOpen &&
                        generatedImageUrl &&
                        createPortal(
                            <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm">
                                <button
                                    type="button"
                                    className="absolute right-6 top-6 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-xl transition hover:bg-white hover:text-black"
                                    title="关闭图片编辑器"
                                    onClick={() => setViewerOpen(false)}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <div className="h-full w-full overflow-hidden">
                                    <ZoomableImageViewer
                                        src={generatedImageUrl}
                                        alt="生成图片编辑器"
                                    />
                                </div>
                            </div>,
                            document.body,
                        )}
                </>
            )}
        </AbiNodeShell>
    );
};

TextGenImageNode.displayName = "TextGenImageNode";

export default memo(TextGenImageNode);
