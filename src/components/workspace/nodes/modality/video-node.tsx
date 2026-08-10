import { Handle, Position } from "@xyflow/react";
import { Download, Maximize2, Video as VideoIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Waterfall } from "@/components/ui/waterfall";
import {
    useFileAsyncLoader,
    useFileAsyncLoaderBatch,
} from "@/hooks/use-file-async-loader";
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
import {
    normalizedImageAspectRatio,
    normalizedImageNodeWidthPx,
} from "./media-node-max-width";
import { ModalityPlaceholder } from "./modality-placeholder";

type VideoNodeRfProps = RfDataNodeProps<"videoNode">;

// Single-video fullscreen modal
const FullScreenVideoModal = ({
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
            <button
                type="button"
                onClick={onClose}
                aria-label="关闭视频预览"
                title="关闭视频预览"
                className="fixed right-6 top-6 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-red-500"
            >
                <X className="h-7 w-7" />
            </button>
            {url ? (
                <video
                    src={url}
                    controls
                    autoPlay
                    className="max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] object-contain shadow-2xl"
                >
                    Your browser does not support the video tag.
                </video>
            ) : (
                <div className="text-white/70">{t("loading")}</div>
            )}
        </div>
    );

    return createPortal(content, document.body);
};

// Multi-video gallery modal
const FullScreenWaterfallModal = ({
    videoKeys,
    onClose,
}: {
    videoKeys: string[];
    onClose: () => void;
}) => {
    const t = useTranslations("Workspace.nodes.modal");
    const [mounted, setMounted] = useState(false);
    const { urls } = useFileAsyncLoaderBatch(videoKeys, { priority: "normal" });

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    if (!mounted) return null;

    const VideoThumbnail = memo(
        ({
            data: fileKey,
        }: {
            data: string;
            width?: number;
            index?: number;
        }) => {
            const videoRef = useRef<HTMLVideoElement>(null);
            const [videoHeight, setVideoHeight] = useState<number | null>(null);
            const url = urls.get(fileKey);

            useEffect(() => {
                const video = videoRef.current;
                if (!video || !url) return;

                const handleLoadedMetadata = () => {
                    if (video.videoWidth && video.videoHeight) {
                        // Derive tile height using intrinsic ratio at fixed 200px width
                        const aspectRatio =
                            video.videoHeight / video.videoWidth;
                        setVideoHeight(200 * aspectRatio);
                    }
                };

                video.addEventListener("loadedmetadata", handleLoadedMetadata);

                // Shortcut when metadata cached
                if (video.readyState >= 1) {
                    handleLoadedMetadata();
                }

                return () => {
                    video.removeEventListener(
                        "loadedmetadata",
                        handleLoadedMetadata,
                    );
                };
            }, [url]);

            const height = videoHeight || 200 * 0.5625; // Default portrait baseline 16:9

            return (
                <div
                    className="relative overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                    style={{ width: 200, height }}
                >
                    {url ? (
                        <>
                            <video
                                ref={videoRef}
                                src={url}
                                className="h-full w-full object-cover"
                                preload="none"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
                                    <VideoIcon className="h-4 w-4 text-gray-800" />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-xs text-gray-500">
                                {t("loading")}
                            </div>
                        </div>
                    )}
                </div>
            );
        },
    );

    const content = (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {t("videos", { count: videoKeys.length })}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Waterfall with Scrollable Container */}
                <div className="flex-1 bg-white overflow-auto p-6">
                    <Waterfall
                        items={videoKeys.map((key) => ({ id: key, key }))}
                        render={({ data: { key } }) => (
                            <VideoThumbnail data={key} />
                        )}
                        columnWidth={200}
                        columnGutter={12}
                        rowGutter={12}
                        itemHeightEstimate={200}
                        itemKey={(data) => data.id}
                        maxColumnCount={6}
                    />
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// Grid thumbnail that falls back to a neutral placeholder on load failure.
const VideoGridThumb = ({
    url,
    loadingLabel,
}: {
    url: string | undefined;
    loadingLabel: string;
}) => {
    const [errored, setErrored] = useState(false);

    if (url && !errored) {
        return (
            <>
                <video
                    src={url}
                    className="h-full w-full object-cover"
                    preload="metadata"
                    onError={() => setErrored(true)}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90">
                        <VideoIcon className="h-3 w-3 text-gray-800" />
                    </div>
                </div>
            </>
        );
    }

    if (errored) {
        return <ModalityPlaceholder modality="video" variant="thumb" />;
    }

    return (
        <div className="h-full w-full flex items-center justify-center bg-gray-300">
            <div className="text-xs text-gray-500">{loadingLabel}</div>
        </div>
    );
};

const VideoNode = ({ selected, data }: VideoNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const keys: string[] = data.fileKeys ?? [];

    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isWaterfallFullScreen, setIsWaterfallFullScreen] = useState(false);
    const [videoDimensions, setVideoDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const [videoError, setVideoError] = useState(false);

    // Async embed one remote video preview
    const { url: singleVideoUrl } = useFileAsyncLoader(keys[0], {
        priority: "high",
    });

    // Batch hydrate many clips
    const { urls: batchUrls } = useFileAsyncLoaderBatch(keys.slice(0, 6), {
        priority: "normal",
    });

    const isSingle = keys.length === 1;
    const count = keys.length;

    // One media element is enough: resetting on URL changes avoids stale
    // dimensions while the visible player supplies metadata. Creating an
    // additional detached <video> doubled network/decoder work per node.
    useEffect(() => {
        setVideoDimensions(null);
        setVideoError(false);
    }, [isSingle, singleVideoUrl]);

    const handleDownload = (url: string, fileKey: string) => {
        const ext = fileKey.includes(".") ? fileKey.split(".").pop() : "mp4";
        const filename = `video.${ext}`;
        const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${filename}`;
        window.open(downloadUrl, "_blank");
    };

    const mediaNodeWidthPx =
        isSingle && videoDimensions
            ? normalizedImageNodeWidthPx(
                  videoDimensions.width,
                  videoDimensions.height,
              )
            : undefined;

    return (
        <>
            <BaseNodeShell
                selected={selected}
                count={count}
                className={
                    mediaNodeWidthPx != null ? "min-w-0 max-w-none" : undefined
                }
                style={
                    mediaNodeWidthPx != null
                        ? { width: mediaNodeWidthPx }
                        : undefined
                }
            >
                <Handle
                    type="target"
                    position={Position.Left}
                    id="in:videoNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:videoNode"
                    className="image-node-source-handle"
                    isConnectableStart={true}
                    isConnectableEnd={false}
                    aria-label="拖动以引用这个视频"
                    title="拖动连接：将视频作为参考素材"
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
                        background: "#8b5cf6",
                        border: "4px solid white",
                        boxShadow:
                            "0 0 0 5px rgba(139,92,246,.28), 0 4px 16px rgba(15,23,42,.35)",
                    }}
                />
                <NodeHeader>
                    <NodeHeaderIcon>
                        <VideoIcon />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>
                        {isSingle ? t("video") : t("videos", { count })}
                    </NodeHeaderTitle>
                    <NodeHeaderActions>
                        {isSingle && singleVideoUrl && (
                            <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                                title="下载视频"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleDownload(singleVideoUrl, keys[0]);
                                }}
                            >
                                <Download className="h-4 w-4" />
                            </button>
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
                            <DropdownMenuLabel>
                                {t("actions")}
                            </DropdownMenuLabel>
                            {isSingle && singleVideoUrl && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleDownload(
                                                singleVideoUrl,
                                                keys[0],
                                            )
                                        }
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        {t("download")}
                                    </DropdownMenuItem>
                                </>
                            )}
                        </NodeHeaderMenuAction>
                    </NodeHeaderActions>
                </NodeHeader>

                {/* Content */}
                {isSingle ? (
                    // Single-player layout akin to image node with resolution badge
                    <div
                        className="relative w-full overflow-hidden bg-black nodrag"
                        style={
                            videoDimensions
                                ? {
                                      aspectRatio: normalizedImageAspectRatio(
                                          videoDimensions.width,
                                          videoDimensions.height,
                                      ),
                                  }
                                : undefined
                        }
                        onPointerDown={(e) => e.stopPropagation()}
                        onDoubleClick={() => setIsFullScreen(true)}
                        title="双击全屏查看视频"
                    >
                        {videoError ? (
                            <ModalityPlaceholder modality="video" />
                        ) : singleVideoUrl ? (
                            <video
                                src={singleVideoUrl}
                                controls
                                controlsList="nodownload"
                                className="h-full w-full object-contain"
                                preload="metadata"
                                onLoadedMetadata={(event) => {
                                    const video = event.currentTarget;
                                    if (
                                        video.videoWidth > 0 &&
                                        video.videoHeight > 0
                                    ) {
                                        setVideoDimensions({
                                            width: video.videoWidth,
                                            height: video.videoHeight,
                                        });
                                    }
                                }}
                                onError={() => setVideoError(true)}
                            >
                                Your browser does not support the video tag.
                            </video>
                        ) : (
                            <div className="w-full bg-gray-200 flex items-center justify-center text-gray-500 py-16">
                                {t("loading")}
                            </div>
                        )}
                        {videoDimensions && (
                            <div className="absolute bottom-2 right-2 text-xs text-white bg-black/50 px-2 py-1 rounded pointer-events-none">
                                {videoDimensions.width} ×{" "}
                                {videoDimensions.height}
                            </div>
                        )}
                    </div>
                ) : (
                    // Multiple videos with Grid layout
                    <div
                        className="w-full p-2 nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="grid grid-cols-3 gap-2">
                            {keys.slice(0, 6).map((key, index) => {
                                // Overflow chip on thumbnail rail
                                const isLastAndMore =
                                    index === 5 && keys.length > 6;
                                const remainingCount = keys.length - 6;
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
                                        <VideoGridThumb
                                            url={url}
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
                <FullScreenVideoModal
                    fileKey={keys[0]}
                    onClose={() => setIsFullScreen(false)}
                />
            )}
            {isWaterfallFullScreen && !isSingle && (
                <FullScreenWaterfallModal
                    videoKeys={keys}
                    onClose={() => setIsWaterfallFullScreen(false)}
                />
            )}
        </>
    );
};

VideoNode.displayName = "VideoNode";

export default memo(VideoNode);
