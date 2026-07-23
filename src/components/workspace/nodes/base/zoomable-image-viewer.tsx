"use client";

import {
    Brush,
    Check,
    Circle as CircleIcon,
    Crop,
    Download,
    Minus,
    MoveUpRight,
    Pencil,
    Plus,
    RotateCcw,
    Save,
    Trash2,
    Undo2,
    X,
} from "lucide-react";
import { useNodeId } from "@xyflow/react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";
import toast from "react-hot-toast";
import useFlow from "@/hooks/use-flow";
import { getPresignedUploadUrl } from "@/lib/api/upload";

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const SCALE_STEP = 1.25;

export async function downloadImageFile(src: string) {
    try {
        const normalizedSrc = src.replace(/\\/g, "/");
        const resolvedUrl = new URL(normalizedSrc, window.location.href);
        const extension = resolvedUrl.pathname.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "png";
        const link = document.createElement("a");
        link.href = resolvedUrl.toString();
        link.download = `dianmeng-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch {
        window.open(src, "_blank", "noopener,noreferrer");
    }
}

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
type DrawTool = "pen" | "arrow" | "circle";
type DrawStroke = {
    tool: DrawTool;
    color: string;
    width: number;
    points: Point[];
};

function arrowHead(start: Point, end: Point, size: number) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    return [
        {
            x: end.x - size * Math.cos(angle - Math.PI / 6),
            y: end.y - size * Math.sin(angle - Math.PI / 6),
        },
        {
            x: end.x - size * Math.cos(angle + Math.PI / 6),
            y: end.y - size * Math.sin(angle + Math.PI / 6),
        },
    ];
}

function StrokeShape({ stroke }: { stroke: DrawStroke }) {
    if (stroke.points.length < 2) return null;
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    const common = {
        fill: "none",
        stroke: stroke.color,
        strokeWidth: stroke.width,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
    };
    if (stroke.tool === "pen") {
        const path = stroke.points
            .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
            .join(" ");
        return <path d={path} {...common} />;
    }
    if (stroke.tool === "circle") {
        return (
            <ellipse
                cx={(start.x + end.x) / 2}
                cy={(start.y + end.y) / 2}
                rx={Math.abs(end.x - start.x) / 2}
                ry={Math.abs(end.y - start.y) / 2}
                {...common}
            />
        );
    }
    const [left, right] = arrowHead(start, end, Math.max(16, stroke.width * 3));
    return (
        <path
            d={`M${start.x},${start.y} L${end.x},${end.y} M${left.x},${left.y} L${end.x},${end.y} L${right.x},${right.y}`}
            {...common}
        />
    );
}

function paintStroke(context: CanvasRenderingContext2D, stroke: DrawStroke) {
    if (stroke.points.length < 2) return;
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    context.save();
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    if (stroke.tool === "pen") {
        context.moveTo(start.x, start.y);
        stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    } else if (stroke.tool === "circle") {
        context.ellipse(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2,
            Math.abs(end.x - start.x) / 2,
            Math.abs(end.y - start.y) / 2,
            0,
            0,
            Math.PI * 2,
        );
    } else {
        const [left, right] = arrowHead(start, end, Math.max(16, stroke.width * 3));
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.moveTo(left.x, left.y);
        context.lineTo(end.x, end.y);
        context.lineTo(right.x, right.y);
    }
    context.stroke();
    context.restore();
}

export function ZoomableImageViewer({
    src,
    alt,
}: {
    src: string;
    alt: string;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const dragRef = useRef<{ pointer: Point; offset: Point } | null>(null);
    const cropStartRef = useRef<Point | null>(null);
    const activeStrokeRef = useRef<DrawStroke | null>(null);
    const nodeId = useNodeId();
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [cropMode, setCropMode] = useState(false);
    const [drawMode, setDrawMode] = useState(false);
    const [drawTool, setDrawTool] = useState<DrawTool>("pen");
    const [drawColor, setDrawColor] = useState("#ff3b30");
    const [drawWidth, setDrawWidth] = useState(8);
    const [strokes, setStrokes] = useState<DrawStroke[]>([]);
    const [activeStroke, setActiveStroke] = useState<DrawStroke | null>(null);
    const [cropRect, setCropRect] = useState<Rect | null>(null);
    const [imageRect, setImageRect] = useState<Rect | null>(null);
    const [savingCrop, setSavingCrop] = useState(false);
    const [savingDrawing, setSavingDrawing] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const downloadCurrentImage = useCallback(async () => {
        setDownloading(true);
        try {
            await downloadImageFile(src);
        } finally {
            setDownloading(false);
        }
    }, [src]);

    const reset = useCallback(() => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    }, []);

    useEffect(() => reset(), [reset, src]);

    const measureImage = useCallback(() => {
        const viewport = viewportRef.current?.getBoundingClientRect();
        const image = imageRef.current?.getBoundingClientRect();
        if (!viewport || !image || image.width <= 0 || image.height <= 0)
            return;
        const rect = {
            x: image.left - viewport.left,
            y: image.top - viewport.top,
            width: image.width,
            height: image.height,
        };
        setImageRect(rect);
        setCropRect(
            (current) =>
                current ?? {
                    x: rect.x + rect.width * 0.1,
                    y: rect.y + rect.height * 0.1,
                    width: rect.width * 0.8,
                    height: rect.height * 0.8,
                },
        );
    }, []);

    useEffect(() => {
        if (!cropMode && !drawMode) return;
        const frame = requestAnimationFrame(() =>
            requestAnimationFrame(measureImage),
        );
        window.addEventListener("resize", measureImage);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", measureImage);
        };
    }, [cropMode, drawMode, measureImage]);

    const applyScale = useCallback(
        (nextScale: number, anchor?: Point) => {
            const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
            if (clamped === scale) return;
            const point = anchor ?? { x: 0, y: 0 };
            const ratio = clamped / scale;
            setOffset((current) => ({
                x: point.x - (point.x - current.x) * ratio,
                y: point.y - (point.y - current.y) * ratio,
            }));
            setScale(clamped);
        },
        [scale],
    );

    const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        applyScale(scale * (event.deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP), {
            x: event.clientX - rect.left - rect.width / 2,
            y: event.clientY - rect.top - rect.height / 2,
        });
    };

    const drawingPoint = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): Point | null => {
            const viewport = viewportRef.current?.getBoundingClientRect();
            if (!viewport || !imageRect) return null;
            const x = event.clientX - viewport.left - imageRect.x;
            const y = event.clientY - viewport.top - imageRect.y;
            if (x < 0 || y < 0 || x > imageRect.width || y > imageRect.height)
                return null;
            return { x, y };
        },
        [imageRect],
    );

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (drawMode) {
            const point = drawingPoint(event);
            if (!point) return;
            const stroke: DrawStroke = {
                tool: drawTool,
                color: drawColor,
                width: drawWidth,
                points: [point],
            };
            activeStrokeRef.current = stroke;
            setActiveStroke(stroke);
            return;
        }
        if (cropMode && imageRect) {
            const viewport = viewportRef.current?.getBoundingClientRect();
            if (!viewport) return;
            const point = {
                x: Math.min(
                    imageRect.x + imageRect.width,
                    Math.max(imageRect.x, event.clientX - viewport.left),
                ),
                y: Math.min(
                    imageRect.y + imageRect.height,
                    Math.max(imageRect.y, event.clientY - viewport.top),
                ),
            };
            cropStartRef.current = point;
            setCropRect({ ...point, width: 0, height: 0 });
            return;
        }
        dragRef.current = {
            pointer: { x: event.clientX, y: event.clientY },
            offset,
        };
        setDragging(true);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (drawMode && activeStrokeRef.current) {
            const point = drawingPoint(event);
            if (!point) return;
            const current = activeStrokeRef.current;
            const next = {
                ...current,
                points:
                    current.tool === "pen"
                        ? [...current.points, point]
                        : [current.points[0], point],
            };
            activeStrokeRef.current = next;
            setActiveStroke(next);
            return;
        }
        if (cropMode && cropStartRef.current && imageRect) {
            const viewport = viewportRef.current?.getBoundingClientRect();
            if (!viewport) return;
            const start = cropStartRef.current;
            const end = {
                x: Math.min(
                    imageRect.x + imageRect.width,
                    Math.max(imageRect.x, event.clientX - viewport.left),
                ),
                y: Math.min(
                    imageRect.y + imageRect.height,
                    Math.max(imageRect.y, event.clientY - viewport.top),
                ),
            };
            setCropRect({
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: Math.abs(end.x - start.x),
                height: Math.abs(end.y - start.y),
            });
            return;
        }
        const drag = dragRef.current;
        if (!drag) return;
        setOffset({
            x: drag.offset.x + event.clientX - drag.pointer.x,
            y: drag.offset.y + event.clientY - drag.pointer.y,
        });
    };

    const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        dragRef.current = null;
        cropStartRef.current = null;
        if (activeStrokeRef.current) {
            const completedStroke = activeStrokeRef.current;
            if (completedStroke.points.length > 1) {
                setStrokes((current) => [...current, completedStroke]);
            }
            activeStrokeRef.current = null;
            setActiveStroke(null);
        }
        setDragging(false);
    };

    const startCrop = () => {
        reset();
        setCropRect(null);
        setImageRect(null);
        setCropMode(true);
    };

    const cancelCrop = () => {
        setCropMode(false);
        setCropRect(null);
        setImageRect(null);
        cropStartRef.current = null;
    };

    const startDrawing = () => {
        reset();
        setCropMode(false);
        setDrawMode(true);
        setImageRect(null);
        setStrokes([]);
        setActiveStroke(null);
        activeStrokeRef.current = null;
    };

    const cancelDrawing = () => {
        setDrawMode(false);
        setImageRect(null);
        setStrokes([]);
        setActiveStroke(null);
        activeStrokeRef.current = null;
    };

    const saveDrawing = async () => {
        if (!imageRect || strokes.length === 0 || savingDrawing) return;
        setSavingDrawing(true);
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error("无法读取原图");
            const bitmap = await createImageBitmap(await response.blob());
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("浏览器无法创建标注画布");
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            context.save();
            context.scale(
                canvas.width / imageRect.width,
                canvas.height / imageRect.height,
            );
            strokes.forEach((stroke) => paintStroke(context, stroke));
            context.restore();
            const blob = await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                    (value) =>
                        value
                            ? resolve(value)
                            : reject(new Error("生成标注图片失败")),
                    "image/png",
                    1,
                ),
            );
            const file = new File(
                [blob],
                `dianmeng-annotation-${Date.now()}.png`,
                { type: "image/png" },
            );
            const uploaded = await getPresignedUploadUrl(file);
            const flow = useFlow.getState();
            const sourceNode = nodeId
                ? flow.nodes.find((node) => node.id === nodeId)
                : undefined;
            flow.addNode(
                { type: "imageNode", data: { fileKeys: [uploaded.fileKey] } },
                sourceNode
                    ? {
                          x:
                              sourceNode.position.x +
                              (sourceNode.measured?.width ?? 360) +
                              180,
                          y:
                              sourceNode.position.y +
                              (sourceNode.measured?.height ?? 240) +
                              80,
                      }
                    : undefined,
            );
            cancelDrawing();
            toast.success("标注图片已添加到画布", { duration: 2000 });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "保存标注图片失败",
            );
        } finally {
            setSavingDrawing(false);
        }
    };

    const saveCrop = async () => {
        if (
            !cropRect ||
            !imageRect ||
            cropRect.width < 2 ||
            cropRect.height < 2 ||
            savingCrop
        )
            return;
        setSavingCrop(true);
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error("无法读取原图");
            const bitmap = await createImageBitmap(await response.blob());
            const sourceX = Math.round(
                ((cropRect.x - imageRect.x) / imageRect.width) * bitmap.width,
            );
            const sourceY = Math.round(
                ((cropRect.y - imageRect.y) / imageRect.height) * bitmap.height,
            );
            const sourceWidth = Math.max(
                1,
                Math.round((cropRect.width / imageRect.width) * bitmap.width),
            );
            const sourceHeight = Math.max(
                1,
                Math.round(
                    (cropRect.height / imageRect.height) * bitmap.height,
                ),
            );
            const canvas = document.createElement("canvas");
            canvas.width = sourceWidth;
            canvas.height = sourceHeight;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("浏览器无法创建裁切画布");
            context.drawImage(
                bitmap,
                sourceX,
                sourceY,
                sourceWidth,
                sourceHeight,
                0,
                0,
                sourceWidth,
                sourceHeight,
            );
            bitmap.close();
            const blob = await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                    (value) =>
                        value
                            ? resolve(value)
                            : reject(new Error("生成裁切图片失败")),
                    "image/png",
                    1,
                ),
            );
            const file = new File([blob], `dianmeng-crop-${Date.now()}.png`, {
                type: "image/png",
            });
            const uploaded = await getPresignedUploadUrl(file);
            const flow = useFlow.getState();
            const sourceNode = nodeId
                ? flow.nodes.find((node) => node.id === nodeId)
                : undefined;
            flow.addNode(
                { type: "imageNode", data: { fileKeys: [uploaded.fileKey] } },
                sourceNode
                    ? {
                          x:
                              sourceNode.position.x +
                              (sourceNode.measured?.width ?? 360) +
                              180,
                          y: sourceNode.position.y,
                      }
                    : undefined,
            );
            cancelCrop();
            toast.success("裁切图片已添加到画布", { duration: 2000 });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "裁切图片失败",
            );
        } finally {
            setSavingCrop(false);
        }
    };

    return (
        <div
            ref={viewportRef}
            className={`relative h-full w-full select-none overflow-hidden bg-[#111315] ${cropMode || drawMode ? "cursor-crosshair" : dragging ? "cursor-grabbing" : "cursor-grab"}`}
            onWheel={cropMode || drawMode ? undefined : onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onDoubleClick={reset}
        >
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <img
                    ref={imageRef}
                    src={src}
                    alt={alt}
                    draggable={false}
                    className="max-h-full max-w-full object-contain shadow-2xl"
                    style={{
                        transform: cropMode || drawMode
                            ? "none"
                            : `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                        transformOrigin: "center",
                    }}
                />
            </div>

            {drawMode && imageRect && (
                <svg
                    className="pointer-events-none absolute z-[5] overflow-visible"
                    style={{
                        left: imageRect.x,
                        top: imageRect.y,
                        width: imageRect.width,
                        height: imageRect.height,
                    }}
                    viewBox={`0 0 ${imageRect.width} ${imageRect.height}`}
                    aria-hidden="true"
                >
                    {strokes.map((stroke, index) => (
                        <StrokeShape key={index} stroke={stroke} />
                    ))}
                    {activeStroke && <StrokeShape stroke={activeStroke} />}
                </svg>
            )}

            {cropMode &&
                cropRect &&
                cropRect.width > 0 &&
                cropRect.height > 0 && (
                    <div
                        className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.6)]"
                        style={{
                            left: cropRect.x,
                            top: cropRect.y,
                            width: cropRect.width,
                            height: cropRect.height,
                        }}
                    >
                        <div className="absolute -left-1 -top-1 h-2 w-2 bg-white" />
                        <div className="absolute -right-1 -top-1 h-2 w-2 bg-white" />
                        <div className="absolute -bottom-1 -left-1 h-2 w-2 bg-white" />
                        <div className="absolute -bottom-1 -right-1 h-2 w-2 bg-white" />
                    </div>
                )}

            <div
                className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/70 p-1.5 text-white shadow-xl backdrop-blur"
                onPointerDown={(event) => event.stopPropagation()}
            >
                {cropMode ? (
                    <>
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-white/15"
                            onClick={cancelCrop}
                        >
                            <X className="h-4 w-4" /> 取消
                        </button>
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-500 px-3 text-xs font-medium hover:bg-emerald-400 disabled:opacity-50"
                            disabled={
                                !cropRect ||
                                cropRect.width < 2 ||
                                cropRect.height < 2 ||
                                savingCrop
                            }
                            onClick={() => void saveCrop()}
                        >
                            <Check className="h-4 w-4" />
                            {savingCrop ? "保存中…" : "裁切并添加到画布"}
                        </button>
                    </>
                ) : drawMode ? (
                    <>
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-white/15"
                            onClick={cancelDrawing}
                        >
                            <X className="h-4 w-4" /> 取消
                        </button>
                        <div className="mx-1 h-5 w-px bg-white/15" />
                        <button
                            type="button"
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${drawTool === "pen" ? "bg-white text-black" : "hover:bg-white/15"}`}
                            title="自由画笔"
                            onClick={() => setDrawTool("pen")}
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${drawTool === "arrow" ? "bg-white text-black" : "hover:bg-white/15"}`}
                            title="箭头"
                            onClick={() => setDrawTool("arrow")}
                        >
                            <MoveUpRight className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${drawTool === "circle" ? "bg-white text-black" : "hover:bg-white/15"}`}
                            title="圈选"
                            onClick={() => setDrawTool("circle")}
                        >
                            <CircleIcon className="h-4 w-4" />
                        </button>
                        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/20" title="标注颜色">
                            <span className="h-5 w-5 rounded-full border-2 border-white/80" style={{ backgroundColor: drawColor }} />
                            <input
                                type="color"
                                value={drawColor}
                                onChange={(event) => setDrawColor(event.target.value)}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                        </label>
                        <label className="flex items-center gap-1 px-1 text-[11px] text-white/65" title="画笔粗细">
                            <span>{drawWidth}</span>
                            <input
                                type="range"
                                min="2"
                                max="24"
                                value={drawWidth}
                                onChange={(event) => setDrawWidth(Number(event.target.value))}
                                className="w-16 accent-white"
                            />
                        </label>
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30"
                            title="撤销"
                            disabled={strokes.length === 0}
                            onClick={() => setStrokes((current) => current.slice(0, -1))}
                        >
                            <Undo2 className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30"
                            title="清空标注"
                            disabled={strokes.length === 0}
                            onClick={() => setStrokes([])}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full bg-blue-500 px-3 text-xs font-medium hover:bg-blue-400 disabled:opacity-50"
                            disabled={strokes.length === 0 || savingDrawing}
                            onClick={() => void saveDrawing()}
                        >
                            <Save className="h-4 w-4" />
                            {savingDrawing ? "保存中…" : "保存到画布"}
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
                            title="缩小"
                            disabled={scale <= MIN_SCALE}
                            onClick={() => applyScale(scale / SCALE_STEP)}
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            className="min-w-16 rounded-full px-2 py-2 text-xs font-medium tabular-nums hover:bg-white/15"
                            title="恢复适合窗口大小（也可双击图片）"
                            onClick={reset}
                        >
                            {Math.round(scale * 100)}%
                        </button>
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
                            title="放大"
                            disabled={scale >= MAX_SCALE}
                            onClick={() => applyScale(scale * SCALE_STEP)}
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                        <div className="mx-1 h-5 w-px bg-white/15" />
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-white/15 disabled:opacity-50"
                            title="下载当前图片"
                            disabled={downloading}
                            onClick={() => void downloadCurrentImage()}
                        >
                            <Download className="h-4 w-4" />
                            {downloading ? "下载中…" : "下载图片"}
                        </button>
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-white/15"
                            title="在图片上绘制箭头、圈选或自由线"
                            onClick={startDrawing}
                        >
                            <Brush className="h-4 w-4" /> 标注
                        </button>
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                            title="复位"
                            onClick={reset}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>
                        <div className="mx-1 h-5 w-px bg-white/15" />
                        <button
                            type="button"
                            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-white/15"
                            title="框选裁切并创建新图片节点"
                            onClick={startCrop}
                        >
                            <Crop className="h-4 w-4" /> 裁切
                        </button>
                    </>
                )}
            </div>
            <div className="pointer-events-none absolute left-5 top-5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/75 backdrop-blur">
                {cropMode
                    ? "拖动框选裁切区域"
                    : drawMode
                      ? "在图片上拖动绘制，保存后会新增图片节点"
                      : "滚轮缩放 · 拖动查看 · 双击复位"}
            </div>
        </div>
    );
}
