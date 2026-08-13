"use client";

/**
 * Workspace main component
 * ReactFlow canvas managing nodes and edges
 */

import type {
    Connection,
    Edge,
    FinalConnectionState,
    IsValidConnection,
    Node,
    OnReconnect,
} from "@xyflow/react";
import {
    Background,
    Controls,
    Panel,
    ReactFlow,
    ReactFlowProvider,
    reconnectEdge,
    SelectionMode,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileText, Home, ImagePlus, Trash2, Upload, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { showErrorToast } from "@/components/ui/error-toast";
import { usePreloadFeatures } from "@/hooks/use-features";
import type { FlowState } from "@/hooks/use-flow";
import { cancelPendingFlowPersistence, useFlow } from "@/hooks/use-flow";
import { useTaskStore } from "@/hooks/use-task";
import { useWorkflowRecovery } from "@/hooks/use-workflow-recovery";
import { listTasks } from "@/lib/api/task";
import { getPresignedUploadUrl } from "@/lib/api/upload";
import {
    canvasStorageKey,
    ensureCanvas,
    flushCanvasSnapshot,
    getActiveCanvasId,
    getCanvasHistory,
    hydrateCanvasHistoryFromDisk,
    saveCanvasNodesForCanvas,
    setActiveCanvasId,
    setWindowActiveCanvasId,
} from "@/lib/canvas-history";
import { logger } from "@/lib/logger";
import { reconcileCompletedImageTasks } from "@/lib/task/reconcile-image-results";
import { shouldVirtualizeCanvasNodes } from "@/lib/workflow/canvas-virtualization";
import { isValidFlowConnection } from "@/lib/workflow/connection-rules";
import {
    collectCopyableSelection,
    collectCopyableSelectionByIds,
    duplicateSelection,
} from "@/lib/workflow/duplicate-selection";
import { CanvasAgentAssistant } from "./canvas-agent-assistant";
import { ModeSwitch } from "./mode-switch";
import SmartIsland from "./smart-island";
import { EDGE_TYPES, NODE_TYPES } from "./types";
import { WorkflowTitleMenu } from "./workflow-title-menu";
import { WorkspaceLeftNav } from "./workspace-left-nav";
import { WorkspaceNav } from "./workspace-nav";
import { WorkspaceViewTools } from "./workspace-view-tools";

// Selector for performance optimization - select data only, not functions
const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
});

const IMAGE_FILE_EXTENSION = /\.(?:png|jpe?g|jfif|webp|gif|avif)$/i;
const VIDEO_FILE_EXTENSION = /\.(?:mp4|mov|m4v|webm|avi|mkv)$/i;
const AUTO_FOLLOW_STORAGE_KEY = "dianmeng-canvas-auto-follow";

function isSupportedImageFile(file: File): boolean {
    return (
        file.type.startsWith("image/") || IMAGE_FILE_EXTENSION.test(file.name)
    );
}

function isSupportedVideoFile(file: File): boolean {
    return (
        file.type.startsWith("video/") || VIDEO_FILE_EXTENSION.test(file.name)
    );
}

const UNIFIED_VIDEO_NODE_TYPES = new Set([
    "textGenVideoNode",
    "imageGenVideoNode",
    "imagesGenVideoNode",
    "imageImageGenVideoNode",
]);

function defaultVideoModeForType(type: string | undefined) {
    if (type === "imagesGenVideoNode") return "reference";
    if (type === "imageGenVideoNode") return "first";
    if (type === "imageImageGenVideoNode") return "first-last";
    return "text";
}

function mediaKindForConnection(
    sourceType: string | undefined,
    sourceHandle: string | null | undefined,
) {
    if (sourceType === "imageNode" || sourceHandle === "out:image")
        return "image";
    if (sourceType === "videoNode" || sourceHandle === "out:video")
        return "video";
    if (sourceType === "audioNode" || sourceHandle === "out:audio")
        return "audio";
    return undefined;
}

function normalizeUnifiedVideoConnection(
    connection: Connection,
    nodes: Node[],
    edges: Edge[],
    reconnectingEdgeId?: string | null,
): Connection {
    if (connection.targetHandle !== "in:references") return connection;
    const target = nodes.find((node) => node.id === connection.target);
    if (!target || !UNIFIED_VIDEO_NODE_TYPES.has(target.type ?? ""))
        return connection;
    const source = nodes.find((node) => node.id === connection.source);
    const kind = mediaKindForConnection(source?.type, connection.sourceHandle);
    if (!kind) return connection;

    const storedMode = (target.data as Record<string, unknown>).videoMode;
    const mode =
        typeof storedMode === "string"
            ? storedMode
            : defaultVideoModeForType(target.type);
    let targetHandle = "in:references";
    if (mode === "text" || mode === "reference") {
        targetHandle = `in:${kind}s`;
    } else if (kind === "image" && mode === "first") {
        targetHandle = "in:image";
    } else if (kind === "image" && mode === "first-last") {
        const occupied = new Set(
            edges
                .filter(
                    (edge) =>
                        edge.target === target.id &&
                        edge.id !== reconnectingEdgeId,
                )
                .map((edge) => edge.targetHandle),
        );
        targetHandle = occupied.has("in:image") ? "in:end_image" : "in:image";
    }
    return { ...connection, targetHandle };
}

/**
 * Workspace inner component
 * Must be used inside a ReactFlowProvider
 */
function WorkspaceInner({
    user: _user,
}: {
    user?: { id: string; email: string };
}) {
    const tIndex = useTranslations("Index");
    const tNodes = useTranslations("Workspace.nodes");
    const locale = useLocale();
    const [colorMode, setColorMode] = useState<"light" | "dark">("light");
    const [selectionModeActive, setSelectionModeActive] = useState(false);
    const [agentPanelOpen, setAgentPanelOpen] = useState(false);
    const [agentReferencedNodeIds, setAgentReferencedNodeIds] = useState<
        string[]
    >([]);
    const [miniMapVisible, setMiniMapVisible] = useState(false);
    const [edgeLinesVisible, setEdgeLinesVisible] = useState(true);
    const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
    const [autoFollowEnabled, setAutoFollowEnabled] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [paneContextMenu, setPaneContextMenu] = useState<{
        left: number;
        top: number;
        position: { x: number; y: number };
    } | null>(null);
    const [edgeContextMenu, setEdgeContextMenu] = useState<{
        left: number;
        top: number;
        edgeId: string;
    } | null>(null);
    const [referenceMenu, setReferenceMenu] = useState<{
        left: number;
        top: number;
        position: { x: number; y: number };
        sourceId: string;
        sourceHandle: string | null;
        fileKeys: string[];
    } | null>(null);
    const nodeClipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(
        null,
    );
    const pasteOffsetRef = useRef(0);
    const connectionStartRef = useRef<{
        nodeId: string | null;
        handleId: string | null;
        handleType: string | null;
    } | null>(null);
    const suppressNextPaneClickRef = useRef(false);
    const imageUploadInputRef = useRef<HTMLInputElement>(null);
    const videoUploadInputRef = useRef<HTMLInputElement>(null);
    const pendingUploadPositionRef = useRef<{ x: number; y: number } | null>(
        null,
    );
    const [isUploadingContextImage, setIsUploadingContextImage] =
        useState(false);
    const [isUploadingContextVideo, setIsUploadingContextVideo] =
        useState(false);
    const [isDraggingImages, setIsDraggingImages] = useState(false);
    const [isUploadingDroppedImages, setIsUploadingDroppedImages] =
        useState(false);
    const imageDragDepthRef = useRef(0);
    const nodeDragHistoryRef = useRef(false);
    const altDragDuplicatedRef = useRef(false);

    useEffect(() => {
        const saved = window.localStorage.getItem(AUTO_FOLLOW_STORAGE_KEY);
        if (saved !== null) setAutoFollowEnabled(saved !== "false");
    }, []);

    const changeAutoFollow = useCallback((enabled: boolean) => {
        setAutoFollowEnabled(enabled);
        window.localStorage.setItem(
            AUTO_FOLLOW_STORAGE_KEY,
            enabled ? "true" : "false",
        );
    }, []);

    // Separate data and functions to avoid re-renders caused by function reference changes
    const { nodes, edges } = useFlow(useShallow(selector));
    const agentReferenceIdSet = useMemo(
        () => new Set(agentReferencedNodeIds),
        [agentReferencedNodeIds],
    );
    const renderedNodes = useMemo(() => {
        if (agentReferenceIdSet.size === 0) return nodes;
        return nodes.map((node) => {
            if (!agentReferenceIdSet.has(node.id)) return node;
            return {
                ...node,
                className: [node.className, "agent-reference-selected"]
                    .filter(Boolean)
                    .join(" "),
            };
        });
    }, [nodes, agentReferenceIdSet]);

    useEffect(() => {
        const existing = new Set(nodes.map((node) => node.id));
        setAgentReferencedNodeIds((current) => {
            const next = current.filter((id) => existing.has(id));
            return next.length === current.length ? current : next;
        });
    }, [nodes]);

    const handleAgentNodePointerDownCapture = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (!agentPanelOpen || event.button !== 0) return;
            const target = event.target as HTMLElement;
            const nodeElement = target.closest<HTMLElement>(
                ".react-flow__node[data-id]",
            );
            const nodeId = nodeElement?.dataset.id;
            if (!nodeId) return;
            event.preventDefault();
            event.stopPropagation();
            setAgentReferencedNodeIds((current) =>
                current.includes(nodeId)
                    ? current.filter((id) => id !== nodeId)
                    : [...current, nodeId],
            );
        },
        [agentPanelOpen],
    );
    const virtualizeCanvasNodes = useTaskStore((state) =>
        shouldVirtualizeCanvasNodes(state.tasks.values()),
    );
    // Get functions directly from the store (function references never change)
    const onNodesChange = useFlow.getState().onNodesChange;
    const onEdgesChange = useFlow.getState().onEdgesChange;
    const onSelectionChange = useFlow.getState().onSelectionChange;
    const storeOnConnect = useFlow.getState().onConnect;
    const reactFlowInstance = useReactFlow();

    const isValidConnection = useCallback<IsValidConnection<Edge>>(
        (connection) => {
            const { nodes, edges, reconnectingEdgeId } = useFlow.getState();
            const normalized = normalizeUnifiedVideoConnection(
                connection as Connection,
                nodes,
                edges,
                reconnectingEdgeId,
            );
            return isValidFlowConnection(
                normalized,
                nodes,
                edges,
                reconnectingEdgeId ?? undefined,
            );
        },
        [],
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            const { nodes, edges } = useFlow.getState();
            storeOnConnect(
                normalizeUnifiedVideoConnection(connection, nodes, edges),
            );
        },
        [storeOnConnect],
    );

    const tEdges = useTranslations("Workspace.edges");
    // Edge whose endpoint was dropped on empty canvas → confirm deletion.
    const [pendingDeleteEdgeId, setPendingDeleteEdgeId] = useState<
        string | null
    >(null);

    // Both new connections and reconnections pass through the same ABI-aware
    // validator, so incompatible media types and duplicate inputs are rejected.
    const onReconnectStart = useCallback((_event: unknown, edge: Edge) => {
        useFlow.getState().setReconnectingEdgeId(edge.id);
    }, []);

    const onReconnect = useCallback<OnReconnect<Edge>>(
        (oldEdge, newConnection) => {
            const { nodes, edges, setEdges } = useFlow.getState();
            const normalized = normalizeUnifiedVideoConnection(
                newConnection,
                nodes,
                edges,
                oldEdge.id,
            );
            setEdges(reconnectEdge(oldEdge, normalized, edges));
        },
        [],
    );

    const onReconnectEnd = useCallback(
        (
            _event: MouseEvent | TouchEvent,
            edge: Edge,
            _handleType: unknown,
            connectionState: FinalConnectionState,
        ) => {
            useFlow.getState().setReconnectingEdgeId(null);
            // Dropped on empty canvas (no target handle) → ask to delete.
            if (!connectionState.toHandle) {
                setPendingDeleteEdgeId(edge.id);
            }
        },
        [],
    );

    const confirmDeleteEdge = useCallback(() => {
        if (!pendingDeleteEdgeId) return;
        useFlow.getState().removeEdges([pendingDeleteEdgeId]);
        setPendingDeleteEdgeId(null);
    }, [pendingDeleteEdgeId]);

    const autoArrangeCanvas = useCallback(() => {
        const state = useFlow.getState();
        if (state.nodes.length < 2) {
            void reactFlowInstance.fitView({
                duration: 500,
                padding: 0.18,
                maxZoom: 1,
            });
            return;
        }

        state.pushHistory();
        const nodeById = new Map(state.nodes.map((node) => [node.id, node]));
        const incoming = new Map(state.nodes.map((node) => [node.id, 0]));
        const outgoing = new Map(
            state.nodes.map((node) => [node.id, [] as string[]]),
        );
        for (const edge of state.edges) {
            if (!nodeById.has(edge.source) || !nodeById.has(edge.target))
                continue;
            incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
            outgoing.get(edge.source)?.push(edge.target);
        }

        const levelById = new Map<string, number>();
        const queue = state.nodes
            .filter((node) => (incoming.get(node.id) ?? 0) === 0)
            .map((node) => node.id);
        for (const id of queue) levelById.set(id, 0);
        let cursor = 0;
        while (cursor < queue.length) {
            const id = queue[cursor++];
            const nextLevel = (levelById.get(id) ?? 0) + 1;
            for (const targetId of outgoing.get(id) ?? []) {
                levelById.set(
                    targetId,
                    Math.max(levelById.get(targetId) ?? 0, nextLevel),
                );
                const remaining = (incoming.get(targetId) ?? 1) - 1;
                incoming.set(targetId, remaining);
                if (remaining === 0) queue.push(targetId);
            }
        }

        let fallbackLevel = Math.max(0, ...levelById.values());
        for (const node of state.nodes) {
            if (!levelById.has(node.id)) {
                levelById.set(node.id, fallbackLevel);
                fallbackLevel += 1;
            }
        }

        const columns = new Map<number, Node[]>();
        for (const node of state.nodes) {
            const level = levelById.get(node.id) ?? 0;
            columns.set(level, [...(columns.get(level) ?? []), node]);
        }

        const horizontalGap = 180;
        const verticalGap = 90;
        let x = 0;
        const nextPositions = new Map<string, { x: number; y: number }>();
        for (const level of [...columns.keys()].sort((a, b) => a - b)) {
            const column = columns.get(level) ?? [];
            const columnWidth = Math.max(
                ...column.map(
                    (node) => node.measured?.width ?? node.width ?? 420,
                ),
            );
            const totalHeight =
                column.reduce(
                    (sum, node) =>
                        sum + (node.measured?.height ?? node.height ?? 300),
                    0,
                ) +
                Math.max(0, column.length - 1) * verticalGap;
            let y = -totalHeight / 2;
            for (const node of column) {
                const height = node.measured?.height ?? node.height ?? 300;
                nextPositions.set(node.id, {
                    x: x + columnWidth / 2,
                    y: y + height / 2,
                });
                y += height + verticalGap;
            }
            x += columnWidth + horizontalGap;
        }

        state.setNodes(
            state.nodes.map((node) => ({
                ...node,
                position: nextPositions.get(node.id) ?? node.position,
            })),
        );
        window.setTimeout(() => {
            void reactFlowInstance.fitView({
                duration: 650,
                padding: 0.16,
                maxZoom: 1,
            });
        }, 60);
    }, [reactFlowInstance]);

    // Listen for theme changes
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    setColorMode(
                        document.documentElement.classList.contains("dark")
                            ? "dark"
                            : "light",
                    );
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        // Initialize theme
        setColorMode(
            document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
        );

        return () => observer.disconnect();
    }, []);

    // Preload feature data
    usePreloadFeatures();

    // Node data update callback (does not depend on nodes; gets the latest state directly from the store)
    const handleNodeDataUpdate = useCallback(
        (nodeId: string, data: { fileKeys?: string[]; texts?: string[] }) => {
            const currentNodes = useFlow.getState().nodes;
            const node = currentNodes.find((n) => n.id === nodeId);
            if (node) {
                const currentData =
                    (node.data as Record<string, unknown>) || {};
                const newData: Record<string, unknown> = { ...currentData };
                if (data.fileKeys && data.fileKeys.length > 0) {
                    newData.fileKeys = data.fileKeys;
                }
                if (data.texts && data.texts.length > 0) {
                    newData.texts = data.texts;
                }
                useFlow.getState().updates(nodeId, newData);
            }
        },
        [],
    );

    // Workflow task recovery hook
    useWorkflowRecovery({
        onNodeDataUpdate: handleNodeDataUpdate,
    });

    // Subscribe to node-creation events and smoothly zoom to the new node
    useEffect(() => {
        const unsubscribe = useFlow.getState().onNodeCreated((nodeIds) => {
            if (!autoFollowEnabled || nodeIds.length === 0) return;
            // Defer fitView until the node has finished rendering
            setTimeout(() => {
                void reactFlowInstance.fitView({
                    nodes: nodeIds.map((id) => ({ id })),
                    duration: 800,
                    padding: 0.3,
                    maxZoom: 1.2,
                    minZoom: 0.1,
                });
            }, 50);
        });
        return unsubscribe;
    }, [autoFollowEnabled, reactFlowInstance]);

    // Handle node double-click: smoothly zoom the view to the node
    const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
        if (!node?.position) return;

        // Use ReactFlow's built-in method to precisely center the node
        void reactFlowInstance.fitView({
            nodes: [{ id: node.id }],
            duration: 800,
            padding: 0.3, // Leave 30% padding around the node
            maxZoom: 1.2,
            minZoom: 0.1,
        });
    };

    // Click on empty canvas to exit Combo Mode
    const handlePaneClick = useCallback(() => {
        if (suppressNextPaneClickRef.current) {
            suppressNextPaneClickRef.current = false;
            return;
        }
        setPaneContextMenu(null);
        setEdgeContextMenu(null);
        setReferenceMenu(null);
        const store = useFlow.getState();
        if (store.comboMode) {
            store.setComboMode(false);
        }
    }, []);

    const handlePaneContextMenu = useCallback(
        (event: React.MouseEvent | MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (
                target?.closest(
                    ".react-flow__node, .react-flow__edge, .react-flow__controls, button, input, textarea, [role='menu']",
                )
            ) {
                return;
            }
            event.preventDefault();

            const menuWidth = 224;
            const menuHeight = 190;
            setPaneContextMenu({
                left: Math.min(
                    event.clientX,
                    window.innerWidth - menuWidth - 8,
                ),
                top: Math.min(
                    event.clientY,
                    window.innerHeight - menuHeight - 8,
                ),
                position: reactFlowInstance.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                }),
            });
        },
        [reactFlowInstance],
    );

    const handleEdgeContextMenu = useCallback(
        (event: React.MouseEvent | MouseEvent, edge: Edge) => {
            event.preventDefault();
            event.stopPropagation();
            setPaneContextMenu(null);
            setReferenceMenu(null);
            setEdgeContextMenu({
                left: Math.min(event.clientX, window.innerWidth - 176),
                top: Math.min(event.clientY, window.innerHeight - 56),
                edgeId: edge.id,
            });
        },
        [],
    );

    const deleteEdge = useCallback((edgeId: string) => {
        useFlow.getState().removeEdges([edgeId]);
        setEdgeContextMenu(null);
    }, []);

    const handleNodeDragStart = useCallback(
        (event: React.MouseEvent, draggedNode: Node) => {
            const state = useFlow.getState();
            if (!nodeDragHistoryRef.current) {
                state.pushHistory();
                nodeDragHistoryRef.current = true;
            }
            if (!event.altKey || altDragDuplicatedRef.current) return;
            altDragDuplicatedRef.current = true;

            const moving = draggedNode.selected
                ? state.nodes.filter((node) => node.selected)
                : state.nodes.filter((node) => node.id === draggedNode.id);
            const movingIds = new Set(moving.map((node) => node.id));
            const selection = collectCopyableSelectionByIds(
                state.nodes,
                state.edges,
                movingIds,
            );
            const duplicate = duplicateSelection(selection, {
                makeId: () => crypto.randomUUID(),
                selected: false,
            });
            state.setNodes([...state.nodes, ...duplicate.nodes]);
            state.setEdges([...state.edges, ...duplicate.edges]);
        },
        [],
    );

    const handleNodeDragStop = useCallback(() => {
        nodeDragHistoryRef.current = false;
        altDragDuplicatedRef.current = false;
    }, []);

    const handleConnectEnd = useCallback(
        (
            event: MouseEvent | TouchEvent,
            connectionState: FinalConnectionState,
        ) => {
            const started = connectionStartRef.current;
            connectionStartRef.current = null;
            if (connectionState.toNode) return;
            const sourceId = connectionState.fromNode?.id ?? started?.nodeId;
            const sourceHandle =
                connectionState.fromHandle?.id ?? started?.handleId ?? null;
            const handleType =
                connectionState.fromHandle?.type ?? started?.handleType;
            if (!sourceId || handleType !== "source") return;
            const target = event.target as HTMLElement | null;
            if (target?.closest(".react-flow__node")) return;

            const source = useFlow
                .getState()
                .nodes.find((node) => node.id === sourceId);
            const fileKeys = ((source?.data as Record<string, unknown>)
                ?.fileKeys ?? []) as string[];
            if (!source || fileKeys.length === 0) return;
            const point =
                "changedTouches" in event ? event.changedTouches[0] : event;
            if (!point) return;
            const menuWidth = 288;
            const menuHeight = 220;
            suppressNextPaneClickRef.current = true;
            setReferenceMenu({
                left: Math.min(
                    point.clientX,
                    window.innerWidth - menuWidth - 8,
                ),
                top: Math.min(
                    point.clientY,
                    window.innerHeight - menuHeight - 8,
                ),
                position: reactFlowInstance.screenToFlowPosition({
                    x: point.clientX,
                    y: point.clientY,
                }),
                sourceId,
                sourceHandle,
                fileKeys,
            });
        },
        [reactFlowInstance],
    );

    const createReferencedNode = useCallback(
        (type: "text" | "image" | "video") => {
            if (!referenceMenu) return;
            const source = useFlow
                .getState()
                .nodes.find((node) => node.id === referenceMenu.sourceId);
            const sourceType = source?.type;
            const needsMultimodalVideoNode =
                sourceType === "videoNode" ||
                sourceType === "audioNode" ||
                referenceMenu.fileKeys.length > 1;
            const targetType =
                type === "image"
                    ? "textGenImageNode"
                    : type === "video"
                      ? needsMultimodalVideoNode
                          ? "imagesGenVideoNode"
                          : "imageGenVideoNode"
                      : "imageGenTextNode";
            const data: Record<string, unknown> =
                type === "image"
                    ? {
                          pluginId: "tongflow-api-banana-relay",
                          referenceBootstrapFileKeys: referenceMenu.fileKeys,
                      }
                    : type === "text"
                      ? { fileKeys: referenceMenu.fileKeys }
                      : {};
            const targetId = useFlow
                .getState()
                .addNode({ type: targetType, data }, referenceMenu.position);
            const resolvedSourceHandle =
                referenceMenu.sourceHandle ??
                (sourceType ? `out:${sourceType}` : null);
            useFlow.getState().onConnect({
                source: referenceMenu.sourceId,
                sourceHandle: resolvedSourceHandle,
                target: targetId,
                targetHandle:
                    type === "image"
                        ? "in:images"
                        : type === "video" && sourceType === "videoNode"
                          ? "in:videos"
                          : type === "video" && sourceType === "audioNode"
                            ? "in:audios"
                            : type === "video" &&
                                referenceMenu.fileKeys.length > 1
                              ? "in:images"
                              : "in:image",
            });
            setReferenceMenu(null);
        },
        [referenceMenu],
    );

    const addNodeFromContextMenu = useCallback(
        (type: string, data?: Record<string, unknown>) => {
            if (!paneContextMenu) return;
            useFlow
                .getState()
                .addNode({ type, data }, paneContextMenu.position);
            setPaneContextMenu(null);
        },
        [paneContextMenu],
    );

    const chooseContextImage = useCallback(() => {
        if (!paneContextMenu || isUploadingContextImage) return;
        pendingUploadPositionRef.current = paneContextMenu.position;
        setPaneContextMenu(null);
        imageUploadInputRef.current?.click();
    }, [paneContextMenu, isUploadingContextImage]);

    const chooseContextVideo = useCallback(() => {
        if (!paneContextMenu || isUploadingContextVideo) return;
        pendingUploadPositionRef.current = paneContextMenu.position;
        setPaneContextMenu(null);
        videoUploadInputRef.current?.click();
    }, [paneContextMenu, isUploadingContextVideo]);

    const uploadContextImage = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            const position = pendingUploadPositionRef.current;
            pendingUploadPositionRef.current = null;
            if (!file || !position) return;

            setIsUploadingContextImage(true);
            try {
                const uploaded = await getPresignedUploadUrl(file);
                useFlow.getState().addNode(
                    {
                        type: "imageNode",
                        data: { fileKeys: [uploaded.fileKey] },
                    },
                    position,
                );
            } catch (error) {
                logger.error("Failed to upload image from canvas menu:", error);
                showErrorToast({
                    message:
                        error instanceof Error
                            ? error.message
                            : "上传图片失败，请重试",
                });
            } finally {
                setIsUploadingContextImage(false);
            }
        },
        [],
    );

    const uploadContextVideo = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            const position = pendingUploadPositionRef.current;
            pendingUploadPositionRef.current = null;
            if (!file || !position) return;

            setIsUploadingContextVideo(true);
            try {
                const uploaded = await getPresignedUploadUrl(file);
                useFlow.getState().addNode(
                    {
                        type: "videoNode",
                        data: { fileKeys: [uploaded.fileKey] },
                    },
                    position,
                );
            } catch (error) {
                logger.error("Failed to upload video from canvas menu:", error);
                showErrorToast({
                    message:
                        error instanceof Error
                            ? error.message
                            : "上传视频失败，请重试",
                });
            } finally {
                setIsUploadingContextVideo(false);
            }
        },
        [],
    );

    const handleImageDragEnter = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault();
            imageDragDepthRef.current += 1;
            setIsDraggingImages(true);
        },
        [],
    );

    const handleImageDragOver = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setIsDraggingImages(true);
        },
        [],
    );

    const handleImageDragLeave = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            imageDragDepthRef.current = Math.max(
                0,
                imageDragDepthRef.current - 1,
            );
            if (imageDragDepthRef.current === 0) setIsDraggingImages(false);
        },
        [],
    );

    const handleCanvasImageDrop = useCallback(
        async (event: React.DragEvent<HTMLDivElement>) => {
            imageDragDepthRef.current = 0;
            setIsDraggingImages(false);
            // An upload area inside a node already owns this drop.
            if (event.defaultPrevented) return;

            const files = Array.from(event.dataTransfer.files);
            if (files.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            setPaneContextMenu(null);

            const mediaFiles = files.filter(
                (file) =>
                    isSupportedImageFile(file) || isSupportedVideoFile(file),
            );
            const rejectedCount = files.length - mediaFiles.length;
            if (mediaFiles.length === 0) {
                showErrorToast({
                    message: "请拖入图片，或 MP4、MOV、WebM、AVI、MKV 视频",
                });
                return;
            }

            const dropPosition = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            setIsUploadingDroppedImages(true);
            try {
                const uploads = await Promise.allSettled(
                    mediaFiles.map(async (file) => ({
                        uploaded: await getPresignedUploadUrl(file),
                        kind: isSupportedVideoFile(file) ? "video" : "image",
                    })),
                );
                let failedCount = rejectedCount;
                const uploadedFileKeys: string[] = [];
                const uploadedVideoKeys: string[] = [];
                for (const upload of uploads) {
                    if (upload.status === "rejected") {
                        failedCount += 1;
                        logger.error(
                            "Failed to upload dropped media:",
                            upload.reason,
                        );
                        continue;
                    }
                    if (upload.value.kind === "video")
                        uploadedVideoKeys.push(upload.value.uploaded.fileKey);
                    else uploadedFileKeys.push(upload.value.uploaded.fileKey);
                }

                if (uploadedFileKeys.length > 0) {
                    useFlow.getState().addNode(
                        {
                            type: "imageNode",
                            data: {
                                fileKeys: uploadedFileKeys,
                                isUploadGroup: uploadedFileKeys.length > 1,
                                groupLabel:
                                    uploadedFileKeys.length > 1
                                        ? "上传组"
                                        : undefined,
                            },
                        },
                        dropPosition,
                    );
                }

                if (uploadedVideoKeys.length > 0) {
                    useFlow.getState().addNode(
                        {
                            type: "videoNode",
                            data: { fileKeys: uploadedVideoKeys },
                        },
                        {
                            x: dropPosition.x,
                            y:
                                dropPosition.y +
                                (uploadedFileKeys.length > 0 ? 320 : 0),
                        },
                    );
                }

                if (failedCount > 0) {
                    showErrorToast({
                        message: `已导入 ${uploadedFileKeys.length} 张图片、${uploadedVideoKeys.length} 个视频，另有 ${failedCount} 个文件导入失败`,
                    });
                }
            } finally {
                setIsUploadingDroppedImages(false);
            }
        },
        [reactFlowInstance],
    );

    // Listen for the Escape key to exit Combo Mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const editingText = Boolean(
                target?.closest("input, textarea, [contenteditable='true']"),
            );
            const command = e.ctrlKey || e.metaKey;

            if (
                !editingText &&
                e.altKey &&
                e.shiftKey &&
                e.key.toLowerCase() === "f"
            ) {
                e.preventDefault();
                autoArrangeCanvas();
                return;
            }

            if (command && !editingText && e.key === "0") {
                e.preventDefault();
                void reactFlowInstance.fitView({
                    duration: 500,
                    padding: 0.16,
                    maxZoom: 1,
                });
                return;
            }

            if (!editingText && !command && !e.altKey && !e.shiftKey) {
                if (e.key.toLowerCase() === "v") {
                    setSelectionModeActive(true);
                    e.preventDefault();
                    return;
                }
                if (e.key.toLowerCase() === "h") {
                    setSelectionModeActive(false);
                    e.preventDefault();
                    return;
                }
            }

            if (command && !editingText && e.key.toLowerCase() === "z") {
                const changed = e.shiftKey
                    ? useFlow.getState().redo()
                    : useFlow.getState().undo();
                if (changed) e.preventDefault();
                return;
            }

            if (command && !editingText && e.key.toLowerCase() === "c") {
                const state = useFlow.getState();
                const selection = collectCopyableSelection(
                    state.nodes,
                    state.edges,
                );
                if (selection.nodes.length > 0) {
                    nodeClipboardRef.current = selection;
                    pasteOffsetRef.current = 0;
                    e.preventDefault();
                }
                return;
            }

            if (command && !editingText && e.key.toLowerCase() === "v") {
                const clipboard = nodeClipboardRef.current;
                if (clipboard?.nodes.length) {
                    const state = useFlow.getState();
                    state.pushHistory();
                    pasteOffsetRef.current += 40;
                    const offset = pasteOffsetRef.current;
                    const duplicate = duplicateSelection(clipboard, {
                        makeId: () => crypto.randomUUID(),
                        offset,
                        selected: true,
                    });
                    const deselected = state.nodes.map((node) => ({
                        ...node,
                        selected: false,
                    }));
                    state.setNodes([...deselected, ...duplicate.nodes]);
                    state.setEdges([...state.edges, ...duplicate.edges]);
                    e.preventDefault();
                }
                return;
            }

            if (
                !editingText &&
                !command &&
                (e.key === "Delete" || e.key === "Backspace")
            ) {
                const state = useFlow.getState();
                const selectedNodeIds = state.nodes
                    .filter((node) => node.selected)
                    .map((node) => node.id);
                if (selectedNodeIds.length > 0) {
                    state.removeNodes(selectedNodeIds);
                    e.preventDefault();
                    return;
                }
                const selectedEdgeIds = new Set(
                    state.edges
                        .filter((edge) => edge.selected)
                        .map((edge) => edge.id),
                );
                if (selectedEdgeIds.size > 0) {
                    state.removeEdges(Array.from(selectedEdgeIds));
                    setEdgeContextMenu(null);
                    e.preventDefault();
                    return;
                }
            }

            if (e.key === "Escape") {
                setPaneContextMenu(null);
                setEdgeContextMenu(null);
                setReferenceMenu(null);
                const store = useFlow.getState();
                if (store.comboMode) {
                    store.setComboMode(false);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [autoArrangeCanvas, reactFlowInstance]);

    // Paste a screenshot or copied image directly onto the canvas. Node
    // clipboard paste keeps priority because its keydown handler prevents the
    // native paste event before this listener runs.
    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, [contenteditable='true']"))
                return;
            const imageFiles = Array.from(event.clipboardData?.items ?? [])
                .filter(
                    (item) =>
                        item.kind === "file" && item.type.startsWith("image/"),
                )
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
            if (imageFiles.length === 0) return;
            event.preventDefault();
            setIsUploadingDroppedImages(true);
            try {
                const uploads = await Promise.allSettled(
                    imageFiles.map((file) => getPresignedUploadUrl(file)),
                );
                const fileKeys = uploads.flatMap((upload) =>
                    upload.status === "fulfilled" ? [upload.value.fileKey] : [],
                );
                if (fileKeys.length === 0) {
                    showErrorToast({ message: "粘贴图片失败，请重试" });
                    return;
                }
                const position = reactFlowInstance.screenToFlowPosition({
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                });
                useFlow.getState().addNode(
                    {
                        type: "imageNode",
                        data: {
                            fileKeys,
                            isUploadGroup: fileKeys.length > 1,
                            groupLabel:
                                fileKeys.length > 1 ? "粘贴组" : undefined,
                        },
                    },
                    position,
                );
                const failed = imageFiles.length - fileKeys.length;
                if (failed > 0) {
                    showErrorToast({
                        message: `已粘贴 ${fileKeys.length} 张图片，另有 ${failed} 张失败`,
                    });
                }
            } finally {
                setIsUploadingDroppedImages(false);
            }
        };
        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [reactFlowInstance]);

    // Restore nodes, edges, and workflow metadata from port-independent disk
    // storage, with localStorage retained as a fast per-session cache.
    useEffect(() => {
        let cancelled = false;
        const restore = async () => {
            const requestedId = new URLSearchParams(window.location.search).get(
                "canvas",
            );
            useFlow.setState({ nodes: [], edges: [] });
            // The desktop server starts on a different localhost port after
            // every reboot, so that launch begins with a fresh localStorage
            // origin. Hydrate the port-independent disk store before resolving
            // the active canvas; otherwise getActiveCanvasId() returns
            // "default" and the user appears to have lost every saved node.
            await hydrateCanvasHistoryFromDisk();
            if (cancelled) return;
            const canvasId = requestedId || getActiveCanvasId();
            if (requestedId) setWindowActiveCanvasId(canvasId);
            else setActiveCanvasId(canvasId);
            ensureCanvas(canvasId);

            try {
                const nodes = JSON.parse(
                    localStorage.getItem(canvasStorageKey(canvasId, "nodes")) ||
                        "[]",
                ) as Node[];
                const edges = JSON.parse(
                    localStorage.getItem(canvasStorageKey(canvasId, "edges")) ||
                        "[]",
                ) as Edge[];
                const savedMeta = localStorage.getItem(
                    canvasStorageKey(canvasId, "meta"),
                );
                const meta = savedMeta
                    ? (JSON.parse(savedMeta) as {
                          id: number | null;
                          name: string;
                          description: string;
                      })
                    : null;
                useFlow.setState({
                    nodes,
                    edges,
                    workflowId: meta?.id ?? null,
                    workflowName: meta?.name || tIndex("title"),
                    workflowDescription: meta?.description || "",
                });
                void (async () => {
                    const tasks: Awaited<
                        ReturnType<typeof listTasks>
                    >["tasks"] = [];
                    const pageSize = 500;
                    for (let page = 1; page <= 20; page += 1) {
                        const batch = await listTasks(page, pageSize);
                        tasks.push(...batch.tasks);
                        if (batch.tasks.length < pageSize) break;
                    }

                    if (cancelled) return;
                    for (const item of getCanvasHistory()) {
                        const savedNodes = JSON.parse(
                            localStorage.getItem(
                                canvasStorageKey(item.id, "nodes"),
                            ) || "[]",
                        ) as Node[];
                        const reconciled = reconcileCompletedImageTasks(
                            savedNodes,
                            tasks,
                        );
                        if (!reconciled.changed) continue;
                        logger.warn(
                            `[Workspace] Recovered completed image results for canvas ${item.id}`,
                        );
                        await saveCanvasNodesForCanvas(
                            item.id,
                            reconciled.nodes,
                        );
                        if (item.id === canvasId && !cancelled) {
                            useFlow.getState().setNodes(reconciled.nodes, {
                                immediate: true,
                            });
                        }
                    }
                })()
                    .then(() => {
                        if (cancelled) return;
                        logger.debug(
                            "[Workspace] Completed-task reconciliation finished",
                        );
                    })
                    .catch((error) => {
                        logger.debug(
                            "[Workspace] Completed-task reconciliation is not available:",
                            error,
                        );
                    });
            } catch (e) {
                logger.error("Failed to restore canvas:", e);
            }
        };
        void restore();
        return () => {
            cancelled = true;
        };
    }, []);

    // Flush a complete snapshot when Windows is shutting down, the Electron
    // window closes, or the app is backgrounded. Node data includes the
    // per-node generation records, so one atomic snapshot protects both the
    // canvas layout and its recent generation history.
    useEffect(() => {
        const flush = () => {
            const flow = useFlow.getState();
            cancelPendingFlowPersistence();
            flushCanvasSnapshot(flow.nodes, flow.edges, {
                id: flow.workflowId,
                name: flow.workflowName,
                description: flow.workflowDescription,
            });
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flush();
        };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("pagehide", flush);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, []);

    // Listen for locale changes: if the workflow is unsaved, update the name to the default for the new locale
    useEffect(() => {
        const workflowName = useFlow.getState().workflowName;
        if (!workflowName) {
            // Unsaved workflow — update the name to the default for the current locale
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, [locale, tIndex]);

    return (
        <div
            className="relative w-full h-full overflow-hidden [&_.react-flow]:!bg-[#f6f7f9] dark:[&_.react-flow]:!bg-background [&_.react-flow__background]:!pointer-events-none [&_.agent-reference-selected]:!ring-4 [&_.agent-reference-selected]:!ring-cyan-400/70 [&_.agent-reference-selected]:!ring-offset-2 [&_.agent-reference-selected]:!ring-offset-transparent [&_.react-flow__handle]:!z-20 [&_.react-flow__handle]:!pointer-events-auto [&_.react-flow__handle-source]:!h-7 [&_.react-flow__handle-source]:!w-7 [&_.react-flow__handle-source]:!cursor-crosshair [&_.react-flow__handle-source]:!border-[3px] [&_.react-flow__handle-source]:!border-white [&_.react-flow__handle-source]:!bg-amber-500 [&_.react-flow__handle-source]:!shadow-[0_0_0_4px_rgba(245,158,11,.22)] [&_.react-flow__handle-target]:!h-6 [&_.react-flow__handle-target]:!w-6 [&_.react-flow__handle-target]:!cursor-crosshair [&_.react-flow__handle-target]:!border-[3px] [&_.react-flow__handle-target]:!border-white [&_.react-flow__handle-target]:!bg-blue-500"
            onPointerDownCapture={handleAgentNodePointerDownCapture}
            onContextMenuCapture={handlePaneContextMenu}
            onDragEnter={handleImageDragEnter}
            onDragOver={handleImageDragOver}
            onDragLeave={handleImageDragLeave}
            onDrop={(event) => void handleCanvasImageDrop(event)}
        >
            <ReactFlow
                nodes={renderedNodes}
                onNodesChange={onNodesChange}
                edges={edgeLinesVisible ? edges : []}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={(_event, params) => {
                    connectionStartRef.current = {
                        nodeId: params.nodeId,
                        handleId: params.handleId,
                        handleType: params.handleType,
                    };
                }}
                onConnectEnd={handleConnectEnd}
                isValidConnection={isValidConnection}
                // New connections and reconnects are both validated by the
                // ABI/type compatibility rules above.
                onReconnect={onReconnect}
                onReconnectStart={onReconnectStart}
                onReconnectEnd={onReconnectEnd}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                defaultEdgeOptions={{
                    type: "custom-edge",
                    selectable: true,
                    focusable: true,
                }}
                // While reconnecting, ReactFlow hides the original edge and
                // shows this connection-line preview following the cursor.
                // Match the custom-edge style so it stays visible/cursor-tracked.
                connectionLineStyle={{
                    strokeWidth: 3,
                    stroke: "#94a3b8",
                    strokeLinecap: "round",
                }}
                onSelectionChange={onSelectionChange}
                onNodeDoubleClick={handleNodeDoubleClick}
                onNodeDragStart={handleNodeDragStart}
                onNodeDragStop={handleNodeDragStop}
                onPaneClick={handlePaneClick}
                onPaneContextMenu={handlePaneContextMenu}
                onEdgeContextMenu={handleEdgeContextMenu}
                nodeOrigin={[0.5, 0.5]}
                // A running node owns the live SSE subscription. Keep all
                // nodes mounted while any task is active so panning it out of
                // view cannot tear down the generation stream. Virtualize
                // again as soon as the canvas becomes idle.
                onlyRenderVisibleElements={virtualizeCanvasNodes}
                elevateNodesOnSelect={false}
                selectNodesOnDrag={selectionModeActive}
                selectionOnDrag={selectionModeActive}
                selectionMode={SelectionMode.Partial}
                panOnDrag={selectionModeActive ? [1] : [0, 1]}
                snapToGrid={gridSnapEnabled}
                snapGrid={[20, 20]}
                fitView
                minZoom={0.02}
                maxZoom={8}
                connectionRadius={64}
                reconnectRadius={40}
                connectionDragThreshold={0}
                deleteKeyCode={null}
                connectOnClick={true}
                autoPanOnConnect={true}
                proOptions={{ hideAttribution: true }}
                colorMode={colorMode}
            >
                <Background style={{ pointerEvents: "none" }} />
                <Panel
                    position="top-right"
                    className="!right-[212px] !top-5 z-30"
                >
                    <CanvasAgentAssistant
                        referencedNodeIds={agentReferencedNodeIds}
                        onReferencedNodeIdsChange={setAgentReferencedNodeIds}
                        onOpenChange={setAgentPanelOpen}
                    />
                </Panel>
                <Controls position="top-right" className="!mt-16 !mr-4" />
                <WorkspaceViewTools
                    colorMode={colorMode}
                    miniMapVisible={miniMapVisible}
                    edgeLinesVisible={edgeLinesVisible}
                    gridSnapEnabled={gridSnapEnabled}
                    autoFollowEnabled={autoFollowEnabled}
                    shortcutsOpen={shortcutsOpen}
                    onAutoArrange={autoArrangeCanvas}
                    onMiniMapVisibleChange={setMiniMapVisible}
                    onEdgeLinesVisibleChange={setEdgeLinesVisible}
                    onGridSnapEnabledChange={setGridSnapEnabled}
                    onAutoFollowEnabledChange={changeAutoFollow}
                    onShortcutsOpenChange={setShortcutsOpen}
                />
                <Panel position="bottom-center" className="!mb-5 z-10">
                    <SmartIsland
                        selectionMode={selectionModeActive}
                        onSelectionModeChange={setSelectionModeActive}
                    />
                </Panel>
            </ReactFlow>

            {(isDraggingImages || isUploadingDroppedImages) && (
                <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-3xl border-2 border-dashed border-blue-400 bg-blue-500/10 backdrop-blur-sm">
                    <div className="flex items-center gap-3 rounded-2xl bg-zinc-950/85 px-6 py-4 text-white shadow-2xl">
                        <ImagePlus className="h-7 w-7 text-blue-300" />
                        <div>
                            <div className="font-medium">
                                {isUploadingDroppedImages
                                    ? "正在导入图片或视频…"
                                    : "松开鼠标，将图片或视频放入画布"}
                            </div>
                            <div className="text-xs text-zinc-400">
                                支持一次拖入多张图片或多个视频
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {paneContextMenu && (
                <div
                    role="menu"
                    aria-label={tNodes("titles.addText")}
                    className="fixed z-50 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                    style={{
                        left: paneContextMenu.left,
                        top: paneContextMenu.top,
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isUploadingContextImage}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-wait disabled:opacity-50"
                        onClick={chooseContextImage}
                    >
                        <Upload className="h-4 w-4" />
                        {isUploadingContextImage ? "正在上传图片…" : "上传图片"}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isUploadingContextVideo}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-wait disabled:opacity-50"
                        onClick={chooseContextVideo}
                    >
                        <Video className="h-4 w-4" />
                        {isUploadingContextVideo ? "正在上传视频…" : "上传视频"}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() =>
                            addNodeFromContextMenu("textGenImageNode", {
                                pluginId: "tongflow-api-banana-relay",
                            })
                        }
                    >
                        <ImagePlus className="h-4 w-4" />
                        {tNodes("titles.textGenImage")}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() =>
                            addNodeFromContextMenu("textGenVideoNode")
                        }
                    >
                        <Video className="h-4 w-4" />
                        {tNodes("titles.textGenVideo")}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() =>
                            addNodeFromContextMenu("textNode", { texts: [""] })
                        }
                    >
                        <FileText className="h-4 w-4" />
                        {tNodes("titles.addText")}
                    </button>
                </div>
            )}

            {edgeContextMenu && (
                <div
                    role="menu"
                    aria-label="连接线操作"
                    className="fixed z-50 w-44 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                    style={{
                        left: edgeContextMenu.left,
                        top: edgeContextMenu.top,
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10"
                        onClick={() => deleteEdge(edgeContextMenu.edgeId)}
                    >
                        <Trash2 className="h-4 w-4" />
                        删除连接线
                    </button>
                </div>
            )}

            <input
                ref={imageUploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={uploadContextImage}
            />
            <input
                ref={videoUploadInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.m4v,.webm,.avi,.mkv"
                className="hidden"
                onChange={uploadContextVideo}
            />

            {referenceMenu && (
                <div
                    role="menu"
                    aria-label="引用该节点生成"
                    className="fixed z-50 w-72 rounded-2xl border border-white/10 bg-zinc-900/95 p-2 text-zinc-100 shadow-2xl backdrop-blur-xl"
                    style={{ left: referenceMenu.left, top: referenceMenu.top }}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <div className="px-3 pb-2 pt-1 text-xs font-medium text-zinc-400">
                        引用该节点生成
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/10"
                        onClick={() => createReferencedNode("text")}
                    >
                        <FileText className="h-5 w-5 text-violet-300" />
                        <span>
                            <span className="block text-sm font-medium">
                                文本
                            </span>
                            <span className="block text-xs text-zinc-500">
                                识别并描述这张图片
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/10"
                        onClick={() => createReferencedNode("image")}
                    >
                        <ImagePlus className="h-5 w-5 text-blue-300" />
                        <span>
                            <span className="block text-sm font-medium">
                                图片
                            </span>
                            <span className="block text-xs text-zinc-500">
                                作为参考图继续生成
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/10"
                        onClick={() => createReferencedNode("video")}
                    >
                        <Video className="h-5 w-5 text-amber-300" />
                        <span>
                            <span className="block text-sm font-medium">
                                视频
                            </span>
                            <span className="block text-xs text-zinc-500">
                                以这张图片生成视频
                            </span>
                        </span>
                    </button>
                </div>
            )}

            <div className="absolute left-5 top-5 z-10 flex items-center gap-3">
                <a
                    href="/"
                    title="返回首页"
                    onClick={() => {
                        // Client-side navigation does not fire pagehide. Save
                        // the latest node/result snapshot before React unmounts
                        // the workspace, otherwise a just-created node can be
                        // lost when the user immediately returns home.
                        const flow = useFlow.getState();
                        cancelPendingFlowPersistence();
                        flushCanvasSnapshot(flow.nodes, flow.edges, {
                            id: flow.workflowId,
                            name: flow.workflowName,
                            description: flow.workflowDescription,
                        });
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200"
                >
                    <Home className="h-5 w-5" />
                </a>
                <WorkflowTitleMenu />
                <WorkspaceLeftNav />
            </div>

            <div className="absolute right-5 top-5 z-10">
                <WorkspaceNav />
            </div>

            <div className="absolute right-4 bottom-5 z-10">
                <ModeSwitch />
            </div>

            <AlertDialog
                open={pendingDeleteEdgeId !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingDeleteEdgeId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {tEdges("deleteConfirmTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {tEdges("deleteConfirmDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {tEdges("cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteEdge}>
                            {tEdges("delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/**
 * Workspace main component (with Provider)
 */
export default function Workspace({
    user,
}: {
    user?: { id: string; email: string };
}) {
    return (
        <ReactFlowProvider>
            <WorkspaceInner user={user} />
        </ReactFlowProvider>
    );
}
