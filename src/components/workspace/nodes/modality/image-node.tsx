import { Handle, Position } from "@xyflow/react";
import {
	ArrowLeft,
	Download,
	Image as ImageIcon,
	Maximize2,
	Ungroup,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Waterfall } from "@/components/ui/waterfall";
import {
	useFileAsyncLoader,
	useFileAsyncLoaderBatch,
} from "@/hooks/use-file-async-loader";
import useFlow from "@/hooks/use-flow";
import { logger } from "@/lib/logger";
import type { RfDataNodeProps } from "@/types/nodes";
import { BaseNodeShell } from "../base/base-node-shell";
import {
	NodeHeader,
	NodeHeaderActions,
	NodeHeaderComboAction,
	NodeHeaderIcon,
	NodeHeaderMenuAction,
	NodeHeaderTitle,
} from "../base/node-header";
import { ZoomableImageViewer } from "../base/zoomable-image-viewer";
import {
	normalizedImageAspectRatio,
	normalizedImageNodeWidthPx,
} from "./media-node-max-width";
import { ModalityPlaceholder } from "./modality-placeholder";

type ImageNodeRfProps = RfDataNodeProps<"imageNode">;
const EMPTY_IMAGE_KEYS: string[] = [];

// Single-image lightbox modal
const FullScreenImageModal = ({
	fileKey,
	onClose,
}: {
	fileKey: string;
	onClose: () => void;
}) => {
	const t = useTranslations("Workspace.nodes.modal");
	const [mounted, setMounted] = useState(false);
	const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

	useEffect(() => {
		setMounted(true);
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.body.style.overflow = "unset";
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	if (!mounted) return null;

	const content = (
		<div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
			<button
				type="button"
				onClick={onClose}
				aria-label="关闭图片预览"
				title="关闭图片预览"
				className="fixed right-6 top-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-red-500"
			>
				<X className="h-7 w-7" />
			</button>
			<div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700 flex-shrink-0">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
						{t("imagePreview")}
					</h2>
					<Button size="sm" variant="ghost" onClick={onClose}>
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* Image with Scrollable Container */}
				<div className="min-h-0 flex-1 overflow-hidden">
					{url ? (
						<ZoomableImageViewer src={url} alt={t("fullScreenPreview")} />
					) : (
						<div className="flex h-full items-center justify-center bg-[#111315] text-gray-400">
							{t("loading")}
						</div>
					)}
				</div>
			</div>
		</div>
	);

	return createPortal(content, document.body);
};

// Multi-image masonry lightbox
const FullScreenWaterfallImageModal = ({
	imageKeys,
	onClose,
}: {
	imageKeys: string[];
	onClose: () => void;
}) => {
	const t = useTranslations("Workspace.nodes.modal");
	const [mounted, setMounted] = useState(false);
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const { urls } = useFileAsyncLoaderBatch(imageKeys, { priority: "normal" });

	useEffect(() => {
		setMounted(true);
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (previewKey) setPreviewKey(null);
			else onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.body.style.overflow = "unset";
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose, previewKey]);

	if (!mounted) return null;

	const ImageThumbnail = memo(
		({ data: fileKey }: { data: string; width?: number; index?: number }) => {
			const url = urls.get(fileKey);

			return (
				<button
					type="button"
					onClick={() => setPreviewKey(fileKey)}
					className="relative overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-md hover:shadow-lg transition-shadow cursor-zoom-in w-full h-full"
				>
					{url ? (
						<img
							src={url}
							alt={t("image")}
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="flex items-center justify-center h-full w-full bg-gray-300">
							<div className="text-xs text-gray-500">{t("loading")}</div>
						</div>
					)}
				</button>
			);
		},
	);

	const content = (
		<div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
			<button
				type="button"
				onClick={onClose}
				aria-label="关闭图片预览"
				title="关闭图片预览"
				className="fixed right-6 top-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-red-500"
			>
				<X className="h-7 w-7" />
			</button>
			<div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700 flex-shrink-0">
					<div className="flex items-center gap-2">
						{previewKey && (
							<Button
								size="icon"
								variant="ghost"
								onClick={() => setPreviewKey(null)}
								title="返回图片列表"
							>
								<ArrowLeft className="h-4 w-4" />
							</Button>
						)}
						<h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
							{previewKey
								? "图片预览"
								: t("images", { count: imageKeys.length })}
						</h2>
					</div>
					<Button size="sm" variant="ghost" onClick={onClose}>
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* Waterfall with Scrollable Container */}
				<div className="min-h-0 flex-1 overflow-hidden">
					{previewKey && urls.get(previewKey) ? (
						<ZoomableImageViewer
							src={urls.get(previewKey) as string}
							alt="上传图片预览"
						/>
					) : (
						<div className="h-full overflow-auto bg-white p-6 dark:bg-zinc-900">
							<Waterfall
								items={imageKeys.map((key) => ({
									id: key,
									key,
								}))}
								render={({ data: { key } }) => <ImageThumbnail data={key} />}
								columnWidth={200}
								columnGutter={12}
								rowGutter={12}
								itemKey={(data) => data.id}
								maxColumnCount={6}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);

	return createPortal(content, document.body);
};

// Grid thumbnail that falls back to a neutral placeholder on load failure.
const ImageGridThumb = ({
	url,
	index,
	loadingLabel,
}: {
	url: string | undefined;
	index: number;
	loadingLabel: string;
}) => {
	const [errored, setErrored] = useState(false);

	if (url && !errored) {
		return (
			<img
				src={url}
				alt={`预览 ${index + 1}`}
				className="h-full w-full object-cover"
				onError={() => setErrored(true)}
			/>
		);
	}

	if (errored) {
		return <ModalityPlaceholder modality="image" variant="thumb" />;
	}

	return (
		<div className="h-full w-full flex items-center justify-center bg-gray-300">
			<div className="text-xs text-gray-500">{loadingLabel}</div>
		</div>
	);
};

const ImageNode = ({ id, selected, data }: ImageNodeRfProps) => {
	const t = useTranslations("Workspace.nodes.modal");
	const keys: string[] = data.fileKeys ?? EMPTY_IMAGE_KEYS;
	const isSingle = keys.length === 1;
	const count = keys.length;
	const isUploadGroup = Boolean(
		(data as Record<string, unknown>).isUploadGroup && count > 1,
	);
	const groupLabel = String(
		(data as Record<string, unknown>).groupLabel ?? "上传组",
	);
	const batchPreviewKeys = useMemo(
		() => (isSingle ? EMPTY_IMAGE_KEYS : keys.slice(0, 6)),
		[isSingle, keys],
	);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [isWaterfallFullScreen, setIsWaterfallFullScreen] = useState(false);
	const [imageDimensions, setImageDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const [imageError, setImageError] = useState(false);

	// Lazy-load one asset via async hook
	const { url: singleImageUrl } = useFileAsyncLoader(
		isSingle ? keys[0] : null,
		{ priority: "high" },
	);

	// Batch lazy-load multiple assets
	const { urls: batchUrls } = useFileAsyncLoaderBatch(batchPreviewKeys, {
		priority: "normal",
	});

	// Resolve intrinsic dimensions for one image
	useEffect(() => {
		if (!singleImageUrl) {
			setImageDimensions(null);
			setImageError(false);
			return;
		}

		setImageError(false);
		const img = new Image();
		img.onload = () => {
			setImageDimensions({
				width: img.naturalWidth,
				height: img.naturalHeight,
			});
		};
		img.onerror = () => {
			setImageDimensions(null);
			setImageError(true);
		};
		img.src = singleImageUrl;
	}, [singleImageUrl]);

	const mediaNodeWidthPx =
		isSingle && imageDimensions
			? normalizedImageNodeWidthPx(
					imageDimensions.width,
					imageDimensions.height,
				)
			: undefined;

	return (
		<>
			<BaseNodeShell
				selected={selected}
				count={count}
				className={
					mediaNodeWidthPx != null
						? "min-w-0 max-w-none"
						: isUploadGroup
							? "min-w-[520px] max-w-[680px]"
							: undefined
				}
				style={
					mediaNodeWidthPx != null ? { width: mediaNodeWidthPx } : undefined
				}
			>
				<Handle
					type="target"
					position={Position.Left}
					id="in:imageNode"
					isConnectableStart={false}
				/>
				<Handle
					type="source"
					position={Position.Right}
					id="out:imageNode"
					className="image-node-source-handle"
					isConnectableStart={true}
					isConnectableEnd={false}
					aria-label="拖动以引用这张图片"
					title="拖动连接：将图片作为参考图"
					style={{
						top: "50%",
						right: -20,
						transform: "translateY(-50%)",
						width: 40,
						height: 40,
						zIndex: 100,
						pointerEvents: "all",
						touchAction: "none",
						cursor: "crosshair",
						background: "#f59e0b",
						border: "4px solid white",
						boxShadow:
							"0 0 0 5px rgba(245,158,11,.30), 0 4px 16px rgba(15,23,42,.35)",
					}}
				/>
				<NodeHeader>
					<NodeHeaderIcon>
						<ImageIcon />
					</NodeHeaderIcon>
					<NodeHeaderTitle>
						{isSingle
							? t("image")
							: isUploadGroup
								? `${groupLabel} · ${count} 张`
								: t("images", { count })}
					</NodeHeaderTitle>
					<NodeHeaderActions>
						{isUploadGroup && (
							<Button
								size="sm"
								variant="ghost"
								onClick={(event) => {
									event.stopPropagation();
									useFlow.getState().ungroupImageNode(id);
								}}
								title="解组为独立图片"
								aria-label="解组为独立图片"
							>
								<Ungroup className="h-4 w-4" />
								<span className="ml-1 text-xs">解组</span>
							</Button>
						)}
						{isSingle && singleImageUrl && (
							<a
								href={singleImageUrl}
								download={`dianmeng-${Date.now()}.png`}
								className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
								title="下载图片"
								onClick={(event) => event.stopPropagation()}
							>
								<Download className="h-4 w-4" />
							</a>
						)}
						{isSingle && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setIsFullScreen(true)}
								title={t("fullScreenPreview")}
							>
								<Maximize2 className="h-4 w-4" />
							</Button>
						)}
						{!isSingle && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setIsWaterfallFullScreen(true)}
								title={t("fullScreenWaterfall")}
							>
								<Maximize2 className="h-4 w-4" />
							</Button>
						)}
						<NodeHeaderComboAction
							onClick={() => logger.debug("compose mode toggle")}
						/>
						<NodeHeaderMenuAction label={t("moreOptions")}>
							<DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
						</NodeHeaderMenuAction>
					</NodeHeaderActions>
				</NodeHeader>

				{/* Content */}
				{isSingle ? (
					// Single image display
					<div
						className="relative w-full overflow-hidden"
						style={
							imageDimensions
								? {
										aspectRatio: normalizedImageAspectRatio(
											imageDimensions.width,
											imageDimensions.height,
										),
									}
								: undefined
						}
					>
						{imageError ? (
							<ModalityPlaceholder modality="image" />
						) : singleImageUrl ? (
							<img
								src={singleImageUrl}
								alt="生成内容"
								className="h-full w-full object-contain"
								onError={() => setImageError(true)}
							/>
						) : (
							<div className="w-full bg-gray-200 flex items-center justify-center text-gray-500 py-16">
								{t("loading")}
							</div>
						)}
						{imageDimensions && (
							<div className="absolute bottom-2 right-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
								{imageDimensions.width} × {imageDimensions.height}
							</div>
						)}
					</div>
				) : (
					// Multiple images with Grid layout
					<div className="w-full p-2">
						<div className="grid grid-cols-3 gap-2">
							{keys.slice(0, 6).map((key, index) => {
								// Overlay +N chip on final thumb when overflow
								const isLastAndMore = index === 5 && count > 6;
								const remainingCount = count - 6;
								const url = batchUrls.get(key);

								return isLastAndMore ? (
									<div
										key={`more-${key}`}
										className="relative aspect-square overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center"
									>
										<div className="text-center">
											<div className="text-3xl font-bold text-gray-700">
												+{remainingCount}
											</div>
											<div className="text-xs text-gray-600 mt-1">
												{t("more")}
											</div>
										</div>
									</div>
								) : (
									<div
										key={key}
										className="relative aspect-square overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-sm"
									>
										<ImageGridThumb
											url={url}
											index={index}
											loadingLabel={t("loading")}
										/>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</BaseNodeShell>

			{/* Full screen modals - rendered outside BaseNodeShell */}
			{isFullScreen && isSingle && keys[0] && (
				<FullScreenImageModal
					fileKey={keys[0]}
					onClose={() => setIsFullScreen(false)}
				/>
			)}
			{isWaterfallFullScreen && !isSingle && (
				<FullScreenWaterfallImageModal
					imageKeys={keys}
					onClose={() => setIsWaterfallFullScreen(false)}
				/>
			)}
		</>
	);
};

// Custom comparison function to prevent unnecessary re-renders
const areEqual = (prevProps: ImageNodeRfProps, nextProps: ImageNodeRfProps) => {
	const prevFileKeys = prevProps.data.fileKeys || [];
	const nextFileKeys = nextProps.data.fileKeys || [];
	const sameFileKeys =
		prevFileKeys.length === nextFileKeys.length &&
		prevFileKeys.every((key, index) => key === nextFileKeys[index]);

	return (
		prevProps.selected === nextProps.selected &&
		sameFileKeys &&
		(prevProps.data as Record<string, unknown>).isUploadGroup ===
			(nextProps.data as Record<string, unknown>).isUploadGroup &&
		(prevProps.data as Record<string, unknown>).groupLabel ===
			(nextProps.data as Record<string, unknown>).groupLabel
	);
};

ImageNode.displayName = "ImageNode";

export default memo(ImageNode, areEqual);
