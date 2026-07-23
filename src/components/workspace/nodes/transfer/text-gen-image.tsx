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
import { Switch } from "@/components/ui/switch";
import {
	type AspectRatio,
	IMAGE_ASPECT_RATIOS,
	IMAGE_RESOLUTION_TIERS,
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
	getAbiNodeBySlot,
	resolveAbiOutputMappings,
} from "@/lib/schema/tongflow-abi";
import {
	computeOutputView,
	normalizeTaskPayloadData,
} from "@/lib/task/payload";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodePluginIdSelect } from "../base/node-plugin-id-select";
import { NodePluginModelSelect } from "../base/node-plugin-model-select";
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
const DEFAULT_TIER = IMAGE_RESOLUTION_TIERS[0];

function fitDimensionsToTier(
	dimensions: { width: number; height: number },
	tier: ResolutionTier,
) {
	const ratio = dimensions.width / dimensions.height;
	const pixelBudget = 1024 * 1024 * tier.scale * tier.scale;
	const maxSide = tier.value === "4k" ? 3840 : 1024 * tier.scale;
	let fittedWidth = Math.sqrt(pixelBudget * ratio);
	let fittedHeight = Math.sqrt(pixelBudget / ratio);
	const limitScale = Math.min(1, maxSide / Math.max(fittedWidth, fittedHeight));
	fittedWidth *= limitScale;
	fittedHeight *= limitScale;
	const snap = (value: number) => Math.max(16, Math.round(value / 16) * 16);
	return { width: snap(fittedWidth), height: snap(fittedHeight) };
}

// Image providers occasionally return dimensions that are only approximately a
// requested ratio (for example 2048x2047 for 1:1).  Canvas cards should be sized
// by their visual ratio, not by pixel resolution, so snap near-standard outputs
// to one canonical footprint while preserving genuinely unusual ratios.
const CANONICAL_PREVIEW_RATIOS = [
	{ width: 1, height: 1 },
	{ width: 16, height: 9 },
	{ width: 9, height: 16 },
	{ width: 4, height: 3 },
	{ width: 3, height: 4 },
	{ width: 3, height: 2 },
	{ width: 2, height: 3 },
	{ width: 21, height: 9 },
] as const;

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

	const { referenceCount, referenceImages } = useMemo(() => {
		if (!nodeId) return { referenceCount: 0, referenceImages: [] };
		const sources = edges
			.filter(
				(edge) => edge.target === nodeId && edge.targetHandle === "in:images",
			)
			.map((edge) => nodeLookup.get(edge.source))
			.filter((node) => Boolean(node));
		const previews = sources
			.map((node) => coerceBaseNodeData(node?.data).fileKeys?.[0])
			.filter((fileKey): fileKey is string => Boolean(fileKey));
		return { referenceCount: sources.length, referenceImages: previews };
	}, [nodeId, edges, nodeLookup]);

	const { url: firstReferenceUrl } = useFileAsyncLoader(referenceImages[0], {
		priority: "high",
	});
	const [referenceDimensions, setReferenceDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	// Manual ratio is the default, even when reference images are connected.
	// Users can explicitly enable matching the reference ratio per node.
	const followReferenceRatio = data.followReferenceRatio === true;

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

	const localText = (form.state.text as string | undefined) ?? "";

	const insertReferenceToken = useCallback(
		(index: number) => {
			const token = `图片${index + 1}`;
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
	const width = (form.state.width as number | undefined) ?? DEFAULT_RATIO.width;
	const height =
		(form.state.height as number | undefined) ?? DEFAULT_RATIO.height;

	const { ratio: currentRatio, tier: inferredTier } = useMemo(() => {
		for (const tier of IMAGE_RESOLUTION_TIERS) {
			const ratio = IMAGE_ASPECT_RATIOS.find(
				(candidate) =>
					candidate.width * tier.scale === width &&
					candidate.height * tier.scale === height,
			);
			if (ratio) return { ratio, tier };
		}
		return {
			ratio: {
				value: "custom",
				label: "square",
				width,
				height,
			},
			tier: DEFAULT_TIER,
		};
	}, [width, height]);
	const currentTier =
		IMAGE_RESOLUTION_TIERS.find(
			(tier) => tier.value === data.outputResolutionTier,
		) ?? inferredTier;

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
		if (form.state.width === undefined || form.state.height === undefined) {
			form.patch({
				width: DEFAULT_RATIO.width * DEFAULT_TIER.scale,
				height: DEFAULT_RATIO.height * DEFAULT_TIER.scale,
			});
		}
	}, [form.state.width, form.state.height, form.patch]);

	const applySize = useCallback(
		(ratio: AspectRatio, tier: ResolutionTier) => {
			form.patch({
				width: ratio.width * tier.scale,
				height: ratio.height * tier.scale,
			});
			updateNodeMeta({
				followReferenceRatio: false,
				outputResolutionTier: tier.value,
			});
		},
		[form, updateNodeMeta],
	);

	useEffect(() => {
		if (!followReferenceRatio || !referenceDimensions) return;
		const next = fitDimensionsToTier(referenceDimensions, currentTier);
		if (width !== next.width || height !== next.height) {
			form.patch(next);
		}
		if (data.outputResolutionTier !== currentTier.value) {
			updateNodeMeta({ outputResolutionTier: currentTier.value });
		}
	}, [
		followReferenceRatio,
		referenceDimensions,
		currentTier,
		width,
		height,
		form,
		data.outputResolutionTier,
		updateNodeMeta,
	]);

	const toggleFollowReferenceRatio = useCallback(
		(enabled: boolean) => {
			updateNodeMeta({ followReferenceRatio: enabled });
		},
		[updateNodeMeta],
	);

	const changeResolutionTier = useCallback(
		(tier: ResolutionTier) => {
			if (followReferenceRatio && referenceDimensions) {
				form.patch(fitDimensionsToTier(referenceDimensions, tier));
			} else if (currentRatio.value === "custom") {
				form.patch(fitDimensionsToTier({ width, height }, tier));
			} else {
				form.patch({
					width: currentRatio.width * tier.scale,
					height: currentRatio.height * tier.scale,
				});
			}
			updateNodeMeta({ outputResolutionTier: tier.value });
		},
		[
			followReferenceRatio,
			referenceDimensions,
			currentRatio,
			width,
			height,
			form,
			updateNodeMeta,
		],
	);

	const handleTaskUpdate = useCallback(
		(task: Task) => {
			if (!nodeId || task.status !== "COMPLETED") return false;
			const payload = normalizeTaskPayloadData(task.data);
			const abiNode = getAbiNodeBySlot("image-fusion");
			const routes = abiNode ? resolveAbiOutputMappings(abiNode) : [];
			const output = Object.values(computeOutputView(routes, payload)).find(
				(channel) => channel.nodeType === "imageNode",
			);
			if (!output?.values.length) return false;
			const current = useFlow
				.getState()
				.nodes.find((node) => node.id === nodeId);
			const currentData = (current?.data ?? {}) as Record<string, unknown>;
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
			useFlow.getState().updates(nodeId, {
				...withGenerationHistory(currentData, generationHistory),
				fileKeys: output.values,
			});
			return true;
		},
		[nodeId],
	);

	const generatedImage = data.fileKeys?.[0];
	const { url: generatedImageUrl } = useFileAsyncLoader(generatedImage, {
		priority: "high",
	});
	const [generatedDimensions, setGeneratedDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);

	useEffect(() => {
		setGeneratedDimensions(null);
	}, [generatedImageUrl]);

	const compactRatioLabel =
		currentRatio.value === "custom" ? `${width}×${height}` : currentRatio.value;

	const collapsedPreviewUrl = generatedImageUrl ?? firstReferenceUrl;
	const collapsedPreviewDimensions = generatedImageUrl
		? (generatedDimensions ?? { width, height })
		: (referenceDimensions ?? { width, height });
	const normalizedPreviewDimensions = normalizePreviewDimensions(
		collapsedPreviewDimensions,
	);
	const modeLabel = referenceCount > 0 ? "图生图" : "文生图";

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
						{collapsedPreviewUrl ? (
							<img
								src={collapsedPreviewUrl}
								alt={`${modeLabel}预览`}
								draggable={false}
								className="h-full w-full object-contain"
								onLoad={(event) => {
									if (!generatedImageUrl) return;
									const nextWidth = event.currentTarget.naturalWidth;
									const nextHeight = event.currentTarget.naturalHeight;
									if (nextWidth <= 0 || nextHeight <= 0) return;
									setGeneratedDimensions((previous) =>
										previous?.width === nextWidth && previous.height === nextHeight
											? previous
											: { width: nextWidth, height: nextHeight },
									);
								}}
							/>
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,rgba(59,130,246,.18),transparent_62%)] text-zinc-300">
								<Atom className="h-10 w-10 text-blue-300" />
								<div className="text-lg font-semibold">{modeLabel}</div>
								<div className="text-xs text-zinc-500">选中节点即可输入提示词</div>
							</div>
						)}
						<div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-4 py-3 text-white">
							<div className="flex items-center gap-2 text-sm font-medium"><Atom className="h-4 w-4" />{modeLabel}</div>
							<span className="text-xs text-white/70">{compactRatioLabel} / {currentTier.label}</span>
						</div>
						<div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 py-3 text-xs text-white/70 opacity-0 transition group-hover:opacity-100">
							<span>{selected ? "正在编辑" : "选中节点即可编辑"}</span>
						</div>
						{generatedImageUrl && (
							<div className="nodrag absolute bottom-3 right-3 flex gap-2 opacity-0 transition group-hover:opacity-100">
								<button
									type="button"
									className="flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 text-xs text-white shadow-lg backdrop-blur transition hover:bg-black/85"
									title="下载生成图片"
									onClick={(event) => {
										event.stopPropagation();
										void downloadImageFile(generatedImageUrl);
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
						<div className="nodrag nopan nowheel w-[min(800px,calc(100vw-32px))] select-text rounded-2xl border border-border/80 bg-background/95 p-3 text-foreground shadow-2xl backdrop-blur-xl [text-rendering:geometricPrecision]">
							<div className="mb-2 flex min-h-16 flex-wrap items-start gap-2">
								{referenceImages.length > 0 ? referenceImages.slice(0, 14).map((fileKey, index) => (
									<button key={`${fileKey}:${index}`} type="button"
										className={`nodrag relative rounded-xl border border-border/70 bg-muted/50 p-0.5 text-left transition hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/60 ${activeReference === index ? "scale-105 ring-2 ring-primary" : ""}`}
										title={`点击引用图片${index + 1}`} onClick={() => insertReferenceToken(index)}>
										<MediaThumbnail fileKey={fileKey} label={`图片${index + 1}`} type="image" />
									</button>
								)) : (
									<div className="flex h-16 min-w-32 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 text-xs text-muted-foreground">
										<ImagePlus className="h-4 w-4" /> 拖入参考图（可选）
									</div>
								)}
							</div>

							<div className="rounded-xl bg-muted/35 px-3 py-1">
								<NodeTextarea ref={promptRef} rows={2} showCard={false} enableVoiceInput={false}
									enableFullscreen placeholder="描述想生成或修改的画面，点击参考图可插入图片编号…"
									className="nodrag nopan nowheel min-h-12 resize-none select-text border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0" {...form.bind("text")} />
							</div>

							{advancedSettingsOpen && (
								<div className="mt-2 space-y-3 rounded-xl border border-border bg-muted/25 p-3 text-foreground">
										<div className="rounded-xl border bg-card p-3">
											<div className="flex items-center justify-between gap-4">
												<div><div className="text-sm font-medium">跟随参考图比例</div>
													<div className="mt-0.5 text-xs text-muted-foreground">
														{referenceDimensions ? `参考图 ${referenceDimensions.width} × ${referenceDimensions.height}，输出 ${width} × ${height}` : "连接参考图后可自动生成相同比例"}
													</div>
												</div>
												<Switch checked={followReferenceRatio && referenceCount > 0} disabled={referenceCount === 0}
													onCheckedChange={toggleFollowReferenceRatio} aria-label="跟随参考图比例" />
											</div>
										</div>
										{(!followReferenceRatio || referenceCount === 0) && (
											<AspectRatioPicker ratios={IMAGE_ASPECT_RATIOS} value={{ ...currentRatio, width, height }}
												onChange={(ratio) => applySize(ratio, currentTier)} showSize />
										)}
										<ResolutionPicker tiers={IMAGE_RESOLUTION_TIERS} value={currentTier.value} onChange={changeResolutionTier} />
								</div>
							)}

							<div className="mt-2 flex items-center gap-1 border-t border-border/70 pt-2">
								<NodePluginIdSelect nodeSlot="image-fusion" data={data} compact />
								<NodePluginModelSelect nodeSlot="image-fusion" data={data} compact />
								<button type="button" className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
									onClick={() => setAdvancedSettingsOpen((open) => !open)} aria-expanded={advancedSettingsOpen}>
									<SlidersHorizontal className="h-4 w-4" />
									{compactRatioLabel} / {currentTier.label}
									<ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedSettingsOpen ? "rotate-180" : ""}`} />
								</button>
								<div className="flex-1" />
								{execution.loading && execution.canCancel && (
									<Button type="button" variant="ghost" size="sm" className="h-9" onClick={execution.cancel}>
										<X className="h-4 w-4" /> 取消
									</Button>
								)}
								<Button type="button" size="icon" className="h-10 w-10 rounded-full shadow-md"
									onClick={execution.run} disabled={!localText.trim() || !execution.canRun || execution.loading}>
									{execution.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
								</Button>
							</div>
						</div>
					</NodeToolbar>
					{viewerOpen && generatedImageUrl &&
						createPortal(
							<div className="fixed inset-0 z-[9999] bg-black/90 p-4 backdrop-blur-sm">
								<button
									type="button"
									className="absolute right-6 top-6 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-xl transition hover:bg-white hover:text-black"
									title="关闭图片编辑器"
									onClick={() => setViewerOpen(false)}
								>
									<X className="h-5 w-5" />
								</button>
								<div className="h-full overflow-hidden rounded-2xl border border-white/15">
									<ZoomableImageViewer src={generatedImageUrl} alt="生成图片编辑器" />
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
