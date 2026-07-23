"use client";

import { Download, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";
import { ZoomableImageViewer } from "./zoomable-image-viewer";

async function downloadImage(url: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("download failed");
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `dianmeng-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
    } catch {
        window.open(url, "_blank");
    }
}

export function GeneratedImagePreview({ fileKey }: { fileKey: string }) {
    const { url } = useFileAsyncLoader(fileKey, { priority: "high" });
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        const close = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [open]);

    return (
        <>
            <div className="nodrag nowheel overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm dark:border-slate-700">
                <div className="group relative flex min-h-52 items-center justify-center">
                    {url ? (
                        <img
                            src={url}
                            alt="生成结果"
                            className="max-h-[380px] w-full cursor-zoom-in object-contain"
                            onDoubleClick={() => setOpen(true)}
                        />
                    ) : (
                        <div className="py-20 text-sm text-slate-400">
                            正在加载生成结果…
                        </div>
                    )}
                    {url && (
                        <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition group-hover:opacity-100">
                            <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="h-9 w-9 bg-black/60 text-white hover:bg-black/75"
                                title="放大预览"
                                onClick={() => setOpen(true)}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="h-9 w-9 bg-black/60 text-white hover:bg-black/75"
                                title="下载图片"
                                onClick={() => void downloadImage(url)}
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 text-xs text-slate-300">
                    <span>生成结果 · 双击图片放大</span>
                    {url && (
                        <button
                            type="button"
                            className="flex items-center gap-1 hover:text-white"
                            onClick={() => void downloadImage(url)}
                        >
                            <Download className="h-3.5 w-3.5" /> 下载
                        </button>
                    )}
                </div>
            </div>

            {mounted &&
                open &&
                url &&
                createPortal(
                    <div className="nodrag nowheel fixed inset-0 z-[100] flex flex-col bg-black/92 p-4">
                        <button
                            type="button"
                            aria-label="关闭图片预览"
                            title="关闭图片预览"
                            className="fixed right-6 top-6 z-[110] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-red-500"
                            onClick={(event) => {
                                event.stopPropagation();
                                setOpen(false);
                            }}
                        >
                            <X className="h-7 w-7" />
                        </button>
                        <div className="mb-3 flex items-center justify-between text-white">
                            <div className="text-sm font-medium">图片预览</div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => void downloadImage(url)}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    下载原图
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    onClick={() => setOpen(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden rounded-xl">
                            <ZoomableImageViewer
                                src={url}
                                alt="生成图片大图预览"
                            />
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
