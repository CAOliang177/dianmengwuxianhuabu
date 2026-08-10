"use client";

import {
    Handle,
    NodeToolbar,
    Position,
    useNodeId,
    useStore,
} from "@xyflow/react";
import {
    ChevronDown,
    Download,
    Film,
    GalleryHorizontalEnd,
    ImagePlus,
    Images,
    Layers3,
    LoaderCircle,
    Maximize2,
    Play,
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
    VIDEO_ASPECT_RATIOS,
} from "@/constants/media-options";
import {
    type ConfigState,
    type UseAbiFormReturn,
    useAbiForm,
} from "@/hooks/use-abi-form";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";
import useFlow from "@/hooks/use-flow";
import { useNodePluginModels } from "@/hooks/use-plugins-registry";
import type { Task } from "@/hooks/use-task";
import type { SourceSpec } from "@/lib/abi/sources";
import { collectAll, configField, handle } from "@/lib/abi/sources";
import {
    readGenerationHistory,
    withGenerationHistory,
} from "@/lib/generation-history";
import { logger } from "@/lib/logger";
import {
    type ReferenceTokenKind,
    removeAndRenumberReferenceTokens,
} from "@/lib/reference-tokens";
import {
    getAbiNodeBySlot,
    resolveAbiOutputMappings,
} from "@/lib/schema/tongflow-abi";
import {
    computeOutputView,
    normalizeTaskPayloadData,
} from "@/lib/task/payload";
import type { BaseNodeData, RfDataNodeProps } from "@/types/nodes";
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
import { SeedancePromptOptimizer } from "../base/seedance-prompt-optimizer";
import { VideoDurationSlider } from "../base/video-duration-slider";
import {
    isSeedance25Model,
    normalizeVideoResolution,
    VideoResolutionPicker,
    type VideoResolutionValue,
} from "../base/video-resolution-picker";
import {
    materialReferenceLabels,
    parseVolcengineMaterials,
    VolcengineMaterialPicker,
    volcengineMaterialLimitsForModel,
} from "../base/volcengine-material-picker";

type VideoMode = "text" | "reference" | "first" | "first-last";
type ReferenceKind = "image" | "video" | "audio";
type ConnectedReferenceEntry = { fileKey: string; edgeId: string };
type VideoFeature =
    | "images-gen-video"
    | "image-gen-video"
    | "image-image-gen-video";

const MODE_OPTIONS: Array<{
    value: VideoMode;
    label: string;
    hint: string;
}> = [
    { value: "text", label: "文生视频", hint: "只使用提示词生成" },
    { value: "reference", label: "多参考视频", hint: "引用多张图片或素材" },
    { value: "first", label: "首帧 / 图生视频", hint: "固定视频第一帧" },
    { value: "first-last", label: "首尾帧", hint: "固定第一帧和最后一帧" },
];

const REFERENCE_SOURCE = {
    images: collectAll({ nodeType: "imageNode" }),
    videos: collectAll({ nodeType: "videoNode" }),
    audios: collectAll({ nodeType: "audioNode" }),
    text: configField(),
} satisfies SourceSpec<"images-gen-video">;
const FIRST_SOURCE = {
    image: handle({ nodeType: "imageNode" }),
    text: configField(),
} satisfies SourceSpec<"image-gen-video">;
const FIRST_LAST_SOURCE = {
    image: handle({ nodeType: "imageNode" }),
    end_image: handle({ nodeType: "imageNode" }),
    text: configField(),
} satisfies SourceSpec<"image-image-gen-video">;

function defaultModeForNodeType(nodeType?: string): VideoMode {
    if (nodeType === "imagesGenVideoNode") return "reference";
    if (nodeType === "imageGenVideoNode") return "first";
    if (nodeType === "imageImageGenVideoNode") return "first-last";
    return "text";
}

function isVideoMode(value: unknown): value is VideoMode {
    return MODE_OPTIONS.some((option) => option.value === value);
}

function modeFeature(mode: VideoMode): VideoFeature {
    if (mode === "text" || mode === "reference") return "images-gen-video";
    if (mode === "first") return "image-gen-video";
    if (mode === "first-last") return "image-image-gen-video";
    return "images-gen-video";
}

function modeIcon(mode: VideoMode) {
    if (mode === "reference") return <Images className="h-4 w-4" />;
    if (mode === "first") return <ImagePlus className="h-4 w-4" />;
    if (mode === "first-last")
        return <GalleryHorizontalEnd className="h-4 w-4" />;
    return <Film className="h-4 w-4" />;
}

function referenceKindForEdge(
    sourceType: string | undefined,
    sourceHandle: string | null | undefined,
): ReferenceKind | undefined {
    if (sourceType === "imageNode" || sourceHandle === "out:image")
        return "image";
    if (sourceType === "videoNode" || sourceHandle === "out:video")
        return "video";
    if (sourceType === "audioNode" || sourceHandle === "out:audio")
        return "audio";
    return undefined;
}

function tokenKindForReference(kind: ReferenceKind): ReferenceTokenKind {
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "图片";
}

function updateModeEdges(nodeId: string, nextMode: VideoMode) {
    const flow = useFlow.getState();
    const sourceTypes = new Map(flow.nodes.map((node) => [node.id, node.type]));
    const kindForEdge = (edge: (typeof flow.edges)[number]) =>
        referenceKindForEdge(sourceTypes.get(edge.source), edge.sourceHandle);
    const incomingMedia = flow.edges.filter(
        (edge) => edge.target === nodeId && kindForEdge(edge) !== undefined,
    );
    const incomingIds = new Set(incomingMedia.map((edge) => edge.id));
    const untouched = flow.edges.filter((edge) => !incomingIds.has(edge.id));

    if (nextMode === "text") {
        flow.setEdges(untouched);
        return;
    }

    if (nextMode === "reference") {
        flow.setEdges([
            ...untouched,
            ...incomingMedia.map((edge) => ({
                ...edge,
                targetHandle: `in:${kindForEdge(edge)}s`,
            })),
        ]);
        return;
    }

    const imageEdges = incomingMedia.filter(
        (edge) => kindForEdge(edge) === "image",
    );
    const limit = nextMode === "first-last" ? 2 : 1;
    const remapped = imageEdges.slice(0, limit).map((edge, index) => ({
        ...edge,
        targetHandle:
            nextMode === "first-last" && index === 1
                ? "in:end_image"
                : "in:image",
    }));
    flow.setEdges([...untouched, ...remapped]);
}

type EditorProps<F extends VideoFeature> = {
    feature: F;
    sourceSpec: SourceSpec<F>;
    mode: VideoMode;
    selected?: boolean;
    data: BaseNodeData;
    onModeChange: (mode: VideoMode) => void;
};

function VideoModeEditor<F extends VideoFeature>({
    feature,
    sourceSpec,
    mode,
    selected,
    data,
    onModeChange,
}: EditorProps<F>) {
    const form = useAbiForm(feature, sourceSpec);
    const nodeId = useNodeId();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const promptRef = useRef<HTMLTextAreaElement>(null);

    const state = form.state as Record<string, unknown>;
    const patch = useCallback(
        (partial: Record<string, unknown>) =>
            form.patch(partial as ConfigState<F>),
        [form],
    );

    const referenceSignature = useFlow(
        useCallback(
            (flow) => {
                if (!nodeId) return "";
                const mediaNodes = new Map(
                    flow.nodes.map((node) => [node.id, node]),
                );
                const incoming = flow.edges
                    .filter((edge) => {
                        const source = mediaNodes.get(edge.source);
                        const kind = referenceKindForEdge(
                            source?.type,
                            edge.sourceHandle,
                        );
                        return (
                            edge.target === nodeId &&
                            kind !== undefined &&
                            (mode === "reference" ||
                                mode === "text" ||
                                kind === "image")
                        );
                    })
                    .sort((left, right) => {
                        const rank = (handleId?: string | null) =>
                            handleId?.includes("end_image") ? 1 : 0;
                        return (
                            rank(left.targetHandle) - rank(right.targetHandle)
                        );
                    });
                const result = {
                    images: [] as ConnectedReferenceEntry[],
                    videos: [] as ConnectedReferenceEntry[],
                    audios: [] as ConnectedReferenceEntry[],
                };
                for (const edge of incoming) {
                    const media = mediaNodes.get(edge.source);
                    const kind = referenceKindForEdge(
                        media?.type,
                        edge.sourceHandle,
                    );
                    const values = media?.data.fileKeys;
                    if (Array.isArray(values)) {
                        for (const value of values) {
                            if (typeof value !== "string" || !value || !kind)
                                continue;
                            const entry = { fileKey: value, edgeId: edge.id };
                            if (kind === "image") result.images.push(entry);
                            if (kind === "video") result.videos.push(entry);
                            if (kind === "audio") result.audios.push(entry);
                        }
                    }
                }
                return JSON.stringify(result);
            },
            [nodeId, mode],
        ),
    );
    const referenceEntries = useMemo(() => {
        if (!referenceSignature)
            return {
                images: [] as ConnectedReferenceEntry[],
                videos: [] as ConnectedReferenceEntry[],
                audios: [] as ConnectedReferenceEntry[],
            };
        try {
            return JSON.parse(referenceSignature) as {
                images: ConnectedReferenceEntry[];
                videos: ConnectedReferenceEntry[];
                audios: ConnectedReferenceEntry[];
            };
        } catch {
            return {
                images: [] as ConnectedReferenceEntry[],
                videos: [] as ConnectedReferenceEntry[],
                audios: [] as ConnectedReferenceEntry[],
            };
        }
    }, [referenceSignature]);
    const referenceGroups = useMemo(
        () => ({
            images: referenceEntries.images.map((entry) => entry.fileKey),
            videos: referenceEntries.videos.map((entry) => entry.fileKey),
            audios: referenceEntries.audios.map((entry) => entry.fileKey),
        }),
        [referenceEntries],
    );
    const references = referenceGroups.images;
    const allReferences = useMemo(
        () => [
            ...referenceEntries.images.map((entry, index) => ({
                ...entry,
                type: "image" as const,
                label: `图片${index + 1}`,
                token: `@图片${index + 1}`,
            })),
            ...referenceEntries.videos.map((entry, index) => ({
                ...entry,
                type: "video" as const,
                label: `视频${index + 1}`,
                token: `@视频${index + 1}`,
            })),
            ...referenceEntries.audios.map((entry, index) => ({
                ...entry,
                type: "audio" as const,
                label: `音频${index + 1}`,
                token: `@音频${index + 1}`,
            })),
        ],
        [referenceEntries],
    );

    const width = Number(state.width) || 1024;
    const height = Number(state.height) || 576;
    const duration = Number(state.duration) || 5;
    const prompt = typeof state.text === "string" ? state.text : "";
    const ratio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (candidate) =>
                candidate.width === width && candidate.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    const { resolved: pluginId } = useResolvedPluginId(feature, data);
    const activeModel = String(data.pluginModel ?? "").trim();
    const pluginModels = useNodePluginModels(feature, pluginId);
    const effectiveModel = activeModel || pluginModels[0] || "";
    const isVolcengine = pluginId === "tongflow-api-bytedance";
    const is25 = isVolcengine && isSeedance25Model(effectiveModel);
    const maxDuration = is25 ? 30 : 15;
    const resolution = normalizeVideoResolution(
        state.resolution,
        effectiveModel,
    );
    const materialValue =
        typeof state.asset_ids === "string" ? state.asset_ids : "";
    const materials = parseVolcengineMaterials(materialValue);
    const frameMaterials = materials.filter(
        (material) => material.type === "image",
    );
    const materialLabels = materialReferenceLabels(materials, {
        image: referenceGroups.images.length,
        video: referenceGroups.videos.length,
        audio: referenceGroups.audios.length,
    });

    const removeConnectedReference = useCallback(
        (reference: { edgeId: string; type: ReferenceKind }) => {
            const entries =
                reference.type === "image"
                    ? referenceEntries.images
                    : reference.type === "video"
                      ? referenceEntries.videos
                      : referenceEntries.audios;
            const removedNumbers = new Set<number>();
            entries.forEach((entry, index) => {
                if (entry.edgeId === reference.edgeId)
                    removedNumbers.add(index + 1);
            });
            useFlow.getState().removeEdges([reference.edgeId]);
            patch({
                text: removeAndRenumberReferenceTokens(
                    prompt,
                    tokenKindForReference(reference.type),
                    removedNumbers,
                ),
            });
        },
        [patch, prompt, referenceEntries],
    );

    const removeMaterialReference = useCallback(
        (materialIndex: number) => {
            const material = materials[materialIndex];
            if (!material) return;
            const token = materialLabels[materialIndex] || "";
            const number = Number(token.match(/(\d+)$/)?.[1]);
            patch({
                asset_ids: (() => {
                    const next = materials.filter(
                        (_item, index) => index !== materialIndex,
                    );
                    return next.length ? JSON.stringify(next) : "";
                })(),
                text: Number.isFinite(number)
                    ? removeAndRenumberReferenceTokens(
                          prompt,
                          tokenKindForReference(material.type),
                          new Set([number]),
                      )
                    : prompt,
            });
        },
        [materialLabels, materials, patch, prompt],
    );

    useEffect(() => {
        if (
            mode === "text" &&
            (allReferences.length > 0 || materials.length > 0)
        ) {
            onModeChange("reference");
        }
    }, [allReferences.length, materials.length, mode, onModeChange]);

    useEffect(() => {
        const nextDuration = Math.max(4, Math.min(maxDuration, duration));
        const next: Record<string, unknown> = {};
        if (nextDuration !== duration) next.duration = nextDuration;
        if (isVolcengine && state.resolution !== resolution)
            next.resolution = resolution;
        if (!isVolcengine && state.resolution !== undefined)
            next.resolution = undefined;
        if (Object.keys(next).length > 0) patch(next);
    }, [
        duration,
        maxDuration,
        isVolcengine,
        state.resolution,
        resolution,
        patch,
    ]);

    const handleTaskUpdate = useCallback(
        (task: Task) => {
            if (!nodeId || task.status !== "COMPLETED") return false;
            const payload = normalizeTaskPayloadData({
                data: task.data,
                result: task.result,
            });
            const abiNode = getAbiNodeBySlot(feature);
            const routes = abiNode ? resolveAbiOutputMappings(abiNode) : [];
            const output = Object.values(
                computeOutputView(routes, payload),
            ).find((channel) => channel.nodeType === "videoNode");
            if (!output?.values.length) {
                logger.error(
                    "[UnifiedVideoGenNode] Task completed without video output",
                    { feature, task, payload },
                );
                showErrorToast({
                    message:
                        "任务已完成，但接口没有返回可用视频。请检查模型返回格式后重试。",
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
                            mediaType: "video" as const,
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
                    generatedAt: now,
                },
                { immediate: true },
            );
            return true;
        },
        [feature, nodeId],
    );

    const outputKey = data.fileKeys?.[0];
    const { url: outputUrl } = useFileAsyncLoader(outputKey, {
        priority: selected ? "high" : "normal",
    });

    useEffect(() => {
        if (!viewerOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const close = (event: KeyboardEvent) => {
            if (event.key === "Escape") setViewerOpen(false);
        };
        window.addEventListener("keydown", close);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", close);
        };
    }, [viewerOpen]);

    const modeLabel =
        MODE_OPTIONS.find((option) => option.value === mode)?.label ??
        "文生视频";
    const selectedModelLabel = effectiveModel
        ? modelDisplayName(pluginId, effectiveModel)
        : "选择模型";
    const materialVisualCount = materials.filter(
        (material) => material.type === "image" || material.type === "video",
    ).length;
    const visualReferenceCount =
        referenceGroups.images.length +
        referenceGroups.videos.length +
        materialVisualCount;
    const audioReferenceCount =
        referenceGroups.audios.length +
        materials.filter((material) => material.type === "audio").length;
    const referenceCombinationValid =
        audioReferenceCount === 0 || visualReferenceCount > 0;
    const canExecute =
        !!prompt.trim() &&
        (mode === "text" ||
            (mode === "reference" &&
                (allReferences.length > 0 || materials.length > 0) &&
                referenceCombinationValid) ||
            (mode === "first" &&
                references.length + frameMaterials.length >= 1) ||
            (mode === "first-last" &&
                references.length + frameMaterials.length >= 2));

    const insertReference = useCallback(
        (token: string) => {
            const textarea = promptRef.current;
            const current = textarea?.value ?? prompt;
            const start = textarea?.selectionStart ?? current.length;
            const end = textarea?.selectionEnd ?? start;
            const next = `${current.slice(0, start)}${start > 0 ? " " : ""}${token} ${current.slice(end)}`;
            patch({ text: next });
            requestAnimationFrame(() => textarea?.focus());
        },
        [patch, prompt],
    );

    const visibleReferences =
        mode === "reference"
            ? allReferences
            : referenceEntries.images.map((entry, index) => ({
                  ...entry,
                  type: "image" as const,
                  label:
                      mode === "first-last"
                          ? index === 0
                              ? "首帧"
                              : "尾帧"
                          : `图片${index + 1}`,
                  token: `@图片${index + 1}`,
              }));
    const visibleMaterials =
        mode === "reference" || mode === "text" ? materials : frameMaterials;

    const updateMaterials = useCallback(
        (value: string) => {
            if (mode === "reference" || mode === "text") {
                patch({ asset_ids: value });
                return;
            }
            const available = mode === "first-last" ? 2 : 1;
            const selectedImages = parseVolcengineMaterials(value)
                .filter((material) => material.type === "image")
                .slice(0, Math.max(0, available - references.length))
                .map((material, index) => ({
                    ...material,
                    role:
                        mode === "first-last" && references.length + index > 0
                            ? "last_frame"
                            : "first_frame",
                }));
            patch({
                asset_ids: selectedImages.length
                    ? JSON.stringify(selectedImages)
                    : "",
            });
        },
        [mode, patch, references.length],
    );

    return (
        <AbiNodeShell
            feature={feature}
            sourceSpec={sourceSpec}
            form={form as UseAbiFormReturn<F>}
            selected={selected}
            data={data}
            className="!w-[540px] min-w-0 max-w-none overflow-visible border-white/15 bg-zinc-950 shadow-2xl"
            showPluginSelect={false}
            showExecuteButton={false}
            executeDisabled={!canExecute}
            onTaskUpdate={handleTaskUpdate}
            autoHandles={false}
        >
            {(execution) => (
                <>
                    {[
                        "in:images",
                        "in:videos",
                        "in:audios",
                        "in:image",
                        "in:end_image",
                    ].map((handleId) => (
                        <Handle
                            key={handleId}
                            type="target"
                            position={Position.Left}
                            id={handleId}
                            style={{
                                top: "50%",
                                zIndex: 1,
                                opacity: 0,
                            }}
                            isConnectable={false}
                            isConnectableStart={false}
                            isConnectableEnd={false}
                        />
                    ))}
                    <Handle
                        type="target"
                        position={Position.Left}
                        id="in:references"
                        className="!h-6 !w-6 !border-[3px] !border-white !bg-blue-500 !shadow-[0_0_0_4px_rgba(59,130,246,.2)]"
                        style={{ top: "50%", zIndex: 50 }}
                        isConnectable
                        isConnectableStart={false}
                        isConnectableEnd
                    />
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="out:video"
                        className="!h-7 !w-7 !border-[3px] !border-white !bg-amber-500 !shadow-[0_0_0_4px_rgba(245,158,11,.25)]"
                        style={{ top: "50%", zIndex: 50 }}
                        isConnectable
                        isConnectableStart
                        isConnectableEnd={false}
                    />
                    <div
                        className="group relative h-[304px] w-[540px] overflow-hidden rounded-xl bg-zinc-900 text-zinc-300"
                        onDoubleClick={(event) => {
                            if (!outputUrl) return;
                            event.stopPropagation();
                            setViewerOpen(true);
                        }}
                    >
                        {outputUrl ? (
                            <video
                                src={outputUrl}
                                controls
                                preload={selected ? "metadata" : "none"}
                                className="h-full w-full object-contain"
                                onPointerDown={(event) =>
                                    event.stopPropagation()
                                }
                            />
                        ) : (
                            <div className="relative flex h-full flex-col items-center justify-center gap-3">
                                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/[0.04]">
                                    <Play className="h-11 w-11 fill-zinc-600 text-zinc-600" />
                                </div>
                                <span className="text-sm text-zinc-500">
                                    选中节点后编辑并生成视频
                                </span>
                                <div className="absolute bottom-7 left-7 space-y-2 text-sm text-zinc-200">
                                    <div className="text-xs text-zinc-500">
                                        尝试：
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Layers3 className="h-4 w-4" />{" "}
                                        多参考视频
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <GalleryHorizontalEnd className="h-4 w-4" />{" "}
                                        首尾帧生成
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 text-white">
                            <span className="flex items-center gap-2 text-sm font-medium">
                                {modeIcon(mode)} 视频节点 · {modeLabel}
                            </span>
                            <span className="text-xs text-white/70">
                                {ratio.value} / {resolution.toUpperCase()} /{" "}
                                {duration}s
                            </span>
                        </div>
                        {outputUrl && (
                            <div className="nodrag absolute right-3 top-12 flex gap-2 opacity-0 transition group-hover:opacity-100">
                                <button
                                    type="button"
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/90"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        const suffix = outputUrl.includes("?")
                                            ? "&"
                                            : "?";
                                        window.open(
                                            `${outputUrl}${suffix}download=video.mp4`,
                                            "_blank",
                                        );
                                    }}
                                    title="下载视频"
                                >
                                    <Download className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/90"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setViewerOpen(true);
                                    }}
                                    title="全屏预览"
                                >
                                    <Maximize2 className="h-4 w-4" />
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
                        <div className="relative w-[min(820px,calc(100vw-32px))] select-text rounded-2xl border border-border/80 bg-background/95 p-3 text-foreground shadow-2xl backdrop-blur-xl">
                            {mode !== "text" && (
                                <div className="mb-2 flex min-h-16 flex-wrap items-start gap-2">
                                    {visibleReferences.length > 0 ||
                                    visibleMaterials.length > 0 ? (
                                        <>
                                            {visibleReferences.map(
                                                (reference, index) => (
                                                    <button
                                                        key={`${reference.type}:${reference.fileKey}:${index}`}
                                                        type="button"
                                                        className="group relative rounded-xl border border-violet-400/70 bg-violet-500/10 p-0.5 transition hover:-translate-y-0.5 hover:ring-2"
                                                        onClick={() =>
                                                            insertReference(
                                                                reference.token,
                                                            )
                                                        }
                                                    >
                                                        <MediaThumbnail
                                                            fileKey={
                                                                reference.fileKey
                                                            }
                                                            label={
                                                                reference.label
                                                            }
                                                            type={
                                                                reference.type
                                                            }
                                                        />
                                                        {/* biome-ignore lint/a11y/useSemanticElements: a nested button would be invalid inside the clickable reference card */}
                                                        <span
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-label={`移除${reference.label}`}
                                                            title="移除参考素材并断开连接"
                                                            className="nodrag nopan absolute right-1 top-1 z-20 hidden h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white shadow-md transition hover:bg-red-500 group-hover:flex"
                                                            onPointerDown={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                            }}
                                                            onClick={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                removeConnectedReference(
                                                                    reference,
                                                                );
                                                            }}
                                                            onKeyDown={(
                                                                event,
                                                            ) => {
                                                                if (
                                                                    event.key ===
                                                                        "Enter" ||
                                                                    event.key ===
                                                                        " "
                                                                ) {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    removeConnectedReference(
                                                                        reference,
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </span>
                                                    </button>
                                                ),
                                            )}
                                            {visibleMaterials.map(
                                                (material, index) => {
                                                    const token =
                                                        materialLabels[index];
                                                    const label =
                                                        token?.replace(
                                                            "@",
                                                            "",
                                                        ) ||
                                                        material.name ||
                                                        material.id;
                                                    const MaterialIcon =
                                                        material.type ===
                                                        "video"
                                                            ? Film
                                                            : material.type ===
                                                                "audio"
                                                              ? GalleryHorizontalEnd
                                                              : ImagePlus;
                                                    return (
                                                        <button
                                                            key={`material:${material.type}:${material.id}:${index}`}
                                                            type="button"
                                                            className="group relative rounded-xl border border-cyan-400/70 bg-cyan-500/10 p-0.5 transition hover:-translate-y-0.5 hover:ring-2"
                                                            title={
                                                                material.name ||
                                                                material.id
                                                            }
                                                            onClick={() =>
                                                                insertReference(
                                                                    token,
                                                                )
                                                            }
                                                        >
                                                            {material.url ? (
                                                                <MediaThumbnail
                                                                    fileKey={
                                                                        material.url
                                                                    }
                                                                    label={
                                                                        label
                                                                    }
                                                                    type={
                                                                        material.type
                                                                    }
                                                                />
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <div className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-cyan-300 bg-cyan-50 text-cyan-700">
                                                                        <MaterialIcon className="h-6 w-6" />
                                                                    </div>
                                                                    <div className="max-w-20 truncate rounded bg-cyan-100 px-1.5 py-0.5 text-xs font-medium text-cyan-700">
                                                                        {label}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {/* biome-ignore lint/a11y/useSemanticElements: a nested button would be invalid inside the clickable reference card */}
                                                            <span
                                                                role="button"
                                                                tabIndex={0}
                                                                aria-label={`移除${label}`}
                                                                title="移除素材库参考"
                                                                className="nodrag nopan absolute right-1 top-1 z-20 hidden h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white shadow-md transition hover:bg-red-500 group-hover:flex"
                                                                onPointerDown={(
                                                                    event,
                                                                ) => {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                }}
                                                                onClick={(
                                                                    event,
                                                                ) => {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    removeMaterialReference(
                                                                        index,
                                                                    );
                                                                }}
                                                                onKeyDown={(
                                                                    event,
                                                                ) => {
                                                                    if (
                                                                        event.key ===
                                                                            "Enter" ||
                                                                        event.key ===
                                                                            " "
                                                                    ) {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        removeMaterialReference(
                                                                            index,
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </span>
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex h-16 items-center gap-2 rounded-xl border border-dashed px-4 text-xs text-muted-foreground">
                                            <ImagePlus className="h-4 w-4" />
                                            {mode === "first-last"
                                                ? "请连接首帧和尾帧图片"
                                                : "可连接图片、视频和音频作为参考"}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="rounded-xl bg-muted/35 px-3 py-1">
                                <NodeTextarea
                                    ref={promptRef}
                                    rows={3}
                                    showCard={false}
                                    enableVoiceInput={false}
                                    enableFullscreen
                                    referenceMentions={[
                                        ...allReferences.map((reference) => ({
                                            token: reference.token,
                                            label: reference.label,
                                            description: reference.fileKey,
                                            type: reference.type,
                                        })),
                                        ...materials.map((material, index) => ({
                                            token: materialLabels[index],
                                            label:
                                                material.name ||
                                                materialLabels[index],
                                            description: material.id,
                                            type: material.type,
                                        })),
                                    ]}
                                    placeholder="描述想要生成的视频画面、动作、镜头和声音，@可引用素材"
                                    className="min-h-16 resize-none select-text border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0"
                                    value={prompt}
                                    onChange={(value) => patch({ text: value })}
                                />
                            </div>

                            {settingsOpen && (
                                <div className="absolute bottom-14 left-3 right-3 z-30 max-h-[min(480px,62vh)] space-y-2 overflow-y-auto rounded-2xl border border-border bg-background/98 p-2 shadow-2xl">
                                    <div className="rounded-xl border border-border bg-card p-2">
                                        <div className="mb-2 text-sm font-medium text-muted-foreground">
                                            模型
                                        </div>
                                        <NodePluginModelSelect
                                            nodeSlot={feature}
                                            data={data}
                                            compact
                                            horizontal
                                        />
                                    </div>
                                    <AspectRatioPicker
                                        ratios={VIDEO_ASPECT_RATIOS}
                                        value={ratio}
                                        onChange={(next) =>
                                            patch({
                                                width: next.width,
                                                height: next.height,
                                            })
                                        }
                                        showSize
                                        compact
                                    />
                                    {isVolcengine && (
                                        <VideoResolutionPicker
                                            model={effectiveModel}
                                            value={
                                                resolution as VideoResolutionValue
                                            }
                                            onChange={(value) =>
                                                patch({ resolution: value })
                                            }
                                            compact
                                        />
                                    )}
                                    <VideoDurationSlider
                                        value={duration}
                                        min={4}
                                        max={maxDuration}
                                        onChange={(value) =>
                                            patch({ duration: value })
                                        }
                                    />
                                </div>
                            )}

                            <div className="relative z-40 mt-2 flex items-center gap-1 border-t border-border/70 bg-background/95 pt-2">
                                <NodePluginIdSelect
                                    nodeSlot={feature}
                                    data={data}
                                    compact
                                />
                                <select
                                    className="h-9 rounded-lg border border-border bg-muted/60 px-2 text-xs outline-none"
                                    value={mode}
                                    onChange={(event) =>
                                        onModeChange(
                                            event.target.value as VideoMode,
                                        )
                                    }
                                    aria-label="视频生成模式"
                                >
                                    {MODE_OPTIONS.map((option) => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg bg-muted/70 px-3 text-xs hover:bg-muted"
                                    onClick={() =>
                                        setSettingsOpen((open) => !open)
                                    }
                                    title={`${selectedModelLabel} · ${ratio.value} / ${resolution.toUpperCase()} / ${duration}s`}
                                >
                                    <SlidersHorizontal className="h-4 w-4" />
                                    <span className="max-w-44 truncate">
                                        {selectedModelLabel}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {ratio.value} /{" "}
                                        {resolution.toUpperCase()} / {duration}s
                                    </span>
                                    <ChevronDown
                                        className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                                <div className="flex-1" />
                                {isVolcengine && (
                                    <VolcengineMaterialPicker
                                        compact
                                        value={materialValue}
                                        onChange={updateMaterials}
                                        allowedTypes={
                                            mode === "first" ||
                                            mode === "first-last"
                                                ? ["image"]
                                                : undefined
                                        }
                                        maxSelected={
                                            mode === "first-last"
                                                ? Math.max(
                                                      0,
                                                      2 - references.length,
                                                  )
                                                : mode === "first"
                                                  ? Math.max(
                                                        0,
                                                        1 - references.length,
                                                    )
                                                  : undefined
                                        }
                                        occupied={{
                                            image: referenceGroups.images
                                                .length,
                                            video: referenceGroups.videos
                                                .length,
                                            audio: referenceGroups.audios
                                                .length,
                                        }}
                                        limits={volcengineMaterialLimitsForModel(
                                            effectiveModel,
                                        )}
                                    />
                                )}
                                {execution.loading && execution.canCancel && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={execution.cancel}
                                    >
                                        <X className="h-4 w-4" /> 取消
                                    </Button>
                                )}
                                {isVolcengine && (
                                    <SeedancePromptOptimizer
                                        value={prompt}
                                        onChange={(value) =>
                                            patch({ text: value })
                                        }
                                        duration={duration}
                                        referenceLabels={[
                                            ...allReferences.map(
                                                (reference) => reference.token,
                                            ),
                                            ...materialLabels,
                                        ]}
                                    />
                                )}
                                <Button
                                    size="icon"
                                    className="h-10 w-10 rounded-full shadow-md"
                                    onClick={execution.run}
                                    disabled={
                                        !canExecute ||
                                        !execution.canRun ||
                                        execution.loading
                                    }
                                    title={
                                        canExecute
                                            ? "生成视频"
                                            : "请补充提示词和当前模式所需的参考图"
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
                        outputUrl &&
                        createPortal(
                            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-6 backdrop-blur-sm">
                                <button
                                    type="button"
                                    className="absolute right-6 top-6 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white hover:bg-white hover:text-black"
                                    onClick={() => setViewerOpen(false)}
                                    aria-label="关闭视频预览"
                                >
                                    <X className="h-6 w-6" />
                                </button>
                                <video
                                    src={outputUrl}
                                    controls
                                    autoPlay
                                    className="max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] object-contain shadow-2xl"
                                />
                            </div>,
                            document.body,
                        )}
                </>
            )}
        </AbiNodeShell>
    );
}

function ActiveVideoMode(
    props: Omit<EditorProps<VideoFeature>, "feature" | "sourceSpec">,
) {
    if (props.mode === "reference")
        return (
            <VideoModeEditor
                {...props}
                feature="images-gen-video"
                sourceSpec={REFERENCE_SOURCE}
            />
        );
    if (props.mode === "first")
        return (
            <VideoModeEditor
                {...props}
                feature="image-gen-video"
                sourceSpec={FIRST_SOURCE}
            />
        );
    if (props.mode === "first-last")
        return (
            <VideoModeEditor
                {...props}
                feature="image-image-gen-video"
                sourceSpec={FIRST_LAST_SOURCE}
            />
        );
    return (
        <VideoModeEditor
            {...props}
            feature="images-gen-video"
            sourceSpec={REFERENCE_SOURCE}
        />
    );
}

const UnifiedVideoGenNode = ({
    selected,
    data,
}: RfDataNodeProps<
    | "textGenVideoNode"
    | "imageGenVideoNode"
    | "imagesGenVideoNode"
    | "imageImageGenVideoNode"
>) => {
    const nodeId = useNodeId();
    const nodeType = useStore(
        (state) => state.nodeLookup.get(nodeId ?? "")?.type,
    );
    const storedMode = (data as Record<string, unknown>).videoMode;
    const mode = isVideoMode(storedMode)
        ? storedMode
        : defaultModeForNodeType(nodeType);

    const changeMode = useCallback(
        (nextMode: VideoMode) => {
            if (!nodeId || nextMode === mode) return;
            updateModeEdges(nodeId, nextMode);
            const current = useFlow
                .getState()
                .nodes.find((node) => node.id === nodeId);
            useFlow.getState().updates(
                nodeId,
                {
                    ...((current?.data ?? {}) as Record<string, unknown>),
                    videoMode: nextMode,
                    feature: modeFeature(nextMode),
                },
                { immediate: true },
            );
        },
        [mode, nodeId],
    );

    return (
        <ActiveVideoMode
            key={mode}
            mode={mode}
            selected={selected}
            data={data}
            onModeChange={changeMode}
        />
    );
};

UnifiedVideoGenNode.displayName = "UnifiedVideoGenNode";

export default memo(UnifiedVideoGenNode);
