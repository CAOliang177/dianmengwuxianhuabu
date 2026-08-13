"use client";

import type { Edge, Node } from "@xyflow/react";
import { getFileUrl } from "@/lib/file/url";
import type { PromptLlmMedia } from "@/lib/prompt-llm";

type VisualKind = "image" | "video";

export type AgentVisualCollection = {
    candidateCount: number;
    media: PromptLlmMedia[];
    warnings: string[];
};

const MAX_VISUAL_SOURCES = 5;
const MAX_VISUAL_ATTACHMENTS = 6;
const MAX_FRAME_EDGE = 1024;

function textValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function visualKind(node: Node): VisualKind | null {
    const type = String(node.type ?? "").toLowerCase();
    if (type.includes("video")) return "video";
    if (type.includes("image")) return "image";
    return null;
}

function nodeLabel(node: Node): string {
    const data = (node.data ?? {}) as Record<string, unknown>;
    return (
        textValue(data.label) ||
        textValue(data.fileName) ||
        textValue(data.title) ||
        node.type ||
        node.id
    );
}

function nodeMediaValues(node: Node): string[] {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const values: string[] = [];
    if (Array.isArray(data.fileKeys)) {
        for (const value of data.fileKeys) {
            const text = textValue(value);
            if (text) values.push(text);
        }
    }
    for (const key of [
        "fileKey",
        "url",
        "imageUrl",
        "videoUrl",
        "previewUrl",
        "outputUrl",
    ]) {
        const text = textValue(data[key]);
        if (text) values.push(text);
    }
    return [...new Set(values)];
}

/** Only video outputs inherit their upstream generation references. */
export function collectAgentContextNodes({
    nodes,
    edges,
    selectedNodes,
}: {
    nodes: Node[];
    edges: Edge[];
    selectedNodes: Node[];
}): Node[] {
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const selectedVideoIds = new Set(
        selectedNodes
            .filter((node) => visualKind(node) === "video")
            .map((node) => node.id),
    );
    const incomingIds = new Set<string>();
    for (const edge of edges) {
        if (selectedVideoIds.has(edge.target)) incomingIds.add(edge.source);
    }
    return [
        ...selectedNodes,
        ...nodes.filter(
            (node) => incomingIds.has(node.id) && !selectedIds.has(node.id),
        ),
    ];
}

function visualCandidates(options: {
    nodes: Node[];
    edges: Edge[];
    selectedNodes: Node[];
}) {
    const candidates: Array<{
        kind: VisualKind;
        label: string;
        nodeId: string;
        url: string;
    }> = [];
    const seen = new Set<string>();
    for (const node of collectAgentContextNodes(options)) {
        const kind = visualKind(node);
        if (!kind) continue;
        for (const value of nodeMediaValues(node)) {
            const url = getFileUrl(value);
            const identity = `${kind}:${url}`;
            if (!url || seen.has(identity)) continue;
            seen.add(identity);
            candidates.push({
                kind,
                label: nodeLabel(node),
                nodeId: node.id,
                url,
            });
            if (candidates.length >= MAX_VISUAL_SOURCES) return candidates;
        }
    }
    return candidates;
}

function scaledSize(width: number, height: number) {
    const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function drawFrame(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
) {
    const size = scaledSize(sourceWidth, sourceHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前环境无法读取视觉素材");
    context.drawImage(source, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", 0.76);
}

async function fetchBlob(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok)
        throw new Error(`读取素材失败（HTTP ${response.status}）`);
    return await response.blob();
}

async function imageAttachment(candidate: {
    label: string;
    url: string;
}): Promise<PromptLlmMedia> {
    try {
        const bitmap = await createImageBitmap(await fetchBlob(candidate.url));
        try {
            return {
                type: "image",
                url: drawFrame(bitmap, bitmap.width, bitmap.height),
                label: `${candidate.label}（图片原图）`,
            };
        } finally {
            bitmap.close();
        }
    } catch (error) {
        if (/^https:\/\//i.test(candidate.url)) {
            return {
                type: "image",
                url: candidate.url,
                label: `${candidate.label}（图片原图）`,
            };
        }
        throw error;
    }
}

function waitForMedia(
    element: HTMLMediaElement,
    eventName: "loadeddata" | "loadedmetadata" | "seeked",
    timeoutMs = 12_000,
) {
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("读取视频关键帧超时"));
        }, timeoutMs);
        const ready = () => {
            cleanup();
            resolve();
        };
        const failed = () => {
            cleanup();
            reject(new Error("当前视频编码无法读取关键帧"));
        };
        const cleanup = () => {
            window.clearTimeout(timeout);
            element.removeEventListener(eventName, ready);
            element.removeEventListener("error", failed);
        };
        element.addEventListener(eventName, ready, { once: true });
        element.addEventListener("error", failed, { once: true });
    });
}

async function videoAttachments(candidate: {
    label: string;
    url: string;
}): Promise<PromptLlmMedia[]> {
    const objectUrl = URL.createObjectURL(await fetchBlob(candidate.url));
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    try {
        await waitForMedia(video, "loadedmetadata");
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            await waitForMedia(video, "loadeddata");
        }
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (!duration || !video.videoWidth || !video.videoHeight) {
            throw new Error("视频没有可读取的画面或时长信息");
        }
        const moments = [
            Math.min(0.08, duration / 10),
            duration / 2,
            Math.max(0, duration - 0.08),
        ];
        const labels = ["开头", "中段", "结尾"];
        const frames: PromptLlmMedia[] = [];
        for (let index = 0; index < moments.length; index += 1) {
            const moment = moments[index];
            if (Math.abs(video.currentTime - moment) > 0.02) {
                video.currentTime = moment;
                await waitForMedia(video, "seeked");
            }
            frames.push({
                type: "image",
                url: drawFrame(video, video.videoWidth, video.videoHeight),
                label: `${candidate.label}（视频${labels[index]}，${moment.toFixed(1)}秒）`,
            });
        }
        return frames;
    } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
    }
}

export async function collectAgentVisualMedia(options: {
    nodes: Node[];
    edges: Edge[];
    selectedNodes: Node[];
}): Promise<AgentVisualCollection> {
    const candidates = visualCandidates(options);
    const media: PromptLlmMedia[] = [];
    const warnings: string[] = [];
    for (const candidate of candidates) {
        if (media.length >= MAX_VISUAL_ATTACHMENTS) break;
        try {
            const attachments =
                candidate.kind === "video"
                    ? await videoAttachments(candidate)
                    : [await imageAttachment(candidate)];
            media.push(
                ...attachments.slice(0, MAX_VISUAL_ATTACHMENTS - media.length),
            );
        } catch (error) {
            warnings.push(
                `${candidate.label}：${error instanceof Error ? error.message : "无法读取视觉内容"}`,
            );
        }
    }
    return { candidateCount: candidates.length, media, warnings };
}
