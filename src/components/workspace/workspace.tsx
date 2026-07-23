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
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileText, Home, ImagePlus, Trash2, Upload, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useFlow } from "@/hooks/use-flow";
import { useWorkflowRecovery } from "@/hooks/use-workflow-recovery";
import { getPresignedUploadUrl } from "@/lib/api/upload";
import {
	canvasStorageKey,
	ensureCanvas,
	getActiveCanvasId,
	hydrateCanvasHistoryFromDisk,
	setActiveCanvasId,
} from "@/lib/canvas-history";
import { logger } from "@/lib/logger";
import { isValidFlowConnection } from "@/lib/workflow/connection-rules";
import { ModeSwitch } from "./mode-switch";
import SmartIsland from "./smart-island";
import { EDGE_TYPES, NODE_TYPES } from "./types";
import { WorkflowTitleMenu } from "./workflow-title-menu";
import { WorkspaceLeftNav } from "./workspace-left-nav";
import { WorkspaceNav } from "./workspace-nav";

// Selector for performance optimization - select data only, not functions
const selector = (state: FlowState) => ({
	nodes: state.nodes,
	edges: state.edges,
});

const IMAGE_FILE_EXTENSION = /\.(?:png|jpe?g|jfif|webp|gif|avif)$/i;

function isSupportedImageFile(file: File): boolean {
	return file.type.startsWith("image/") || IMAGE_FILE_EXTENSION.test(file.name);
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
	const pendingUploadPositionRef = useRef<{ x: number; y: number } | null>(
		null,
	);
	const [isUploadingContextImage, setIsUploadingContextImage] = useState(false);
	const [isDraggingImages, setIsDraggingImages] = useState(false);
	const [isUploadingDroppedImages, setIsUploadingDroppedImages] =
		useState(false);
	const imageDragDepthRef = useRef(0);

	// Separate data and functions to avoid re-renders caused by function reference changes
	const { nodes, edges } = useFlow(useShallow(selector));

	// Get functions directly from the store (function references never change)
	const onNodesChange = useFlow.getState().onNodesChange;
	const onEdgesChange = useFlow.getState().onEdgesChange;
	const onSelectionChange = useFlow.getState().onSelectionChange;
	const onConnect = useFlow.getState().onConnect;
	const reactFlowInstance = useReactFlow();

	const isValidConnection = useCallback<IsValidConnection<Edge>>(
		(connection) => {
			const { nodes, edges, reconnectingEdgeId } = useFlow.getState();
			return isValidFlowConnection(
				connection as Connection,
				nodes,
				edges,
				reconnectingEdgeId ?? undefined,
			);
		},
		[],
	);

	const tEdges = useTranslations("Workspace.edges");
	// Edge whose endpoint was dropped on empty canvas → confirm deletion.
	const [pendingDeleteEdgeId, setPendingDeleteEdgeId] = useState<string | null>(
		null,
	);

	// Both new connections and reconnections pass through the same ABI-aware
	// validator, so incompatible media types and duplicate inputs are rejected.
	const onReconnectStart = useCallback((_event: unknown, edge: Edge) => {
		useFlow.getState().setReconnectingEdgeId(edge.id);
	}, []);

	const onReconnect = useCallback<OnReconnect<Edge>>(
		(oldEdge, newConnection) => {
			const { edges, setEdges } = useFlow.getState();
			setEdges(reconnectEdge(oldEdge, newConnection, edges));
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
		const { edges, setEdges } = useFlow.getState();
		setEdges(edges.filter((e) => e.id !== pendingDeleteEdgeId));
		setPendingDeleteEdgeId(null);
	}, [pendingDeleteEdgeId]);

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
			document.documentElement.classList.contains("dark") ? "dark" : "light",
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
				const currentData = (node.data as Record<string, unknown>) || {};
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
			if (nodeIds.length === 0) return;
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
	}, [reactFlowInstance]);

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
			const menuHeight = 148;
			setPaneContextMenu({
				left: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
				top: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
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
		const state = useFlow.getState();
		state.setEdges(state.edges.filter((edge) => edge.id !== edgeId));
		setEdgeContextMenu(null);
	}, []);

	const handleConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
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
			const fileKeys = ((source?.data as Record<string, unknown>)?.fileKeys ??
				[]) as string[];
			const point = "changedTouches" in event ? event.changedTouches[0] : event;
			if (!point) return;
			const menuWidth = 288;
			const menuHeight = 220;
			suppressNextPaneClickRef.current = true;
			setReferenceMenu({
				left: Math.min(point.clientX, window.innerWidth - menuWidth - 8),
				top: Math.min(point.clientY, window.innerHeight - menuHeight - 8),
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
			const targetType =
				type === "image"
					? "textGenImageNode"
					: type === "video"
						? "imageGenVideoNode"
						: "imageGenTextNode";
			const data: Record<string, unknown> =
				type === "image"
					? { pluginId: "tongflow-api-banana-relay" }
					: type === "text"
						? { fileKeys: referenceMenu.fileKeys }
						: {};
			const targetId = useFlow
				.getState()
				.addNode({ type: targetType, data }, referenceMenu.position);
			useFlow.getState().onConnect({
				source: referenceMenu.sourceId,
				sourceHandle: referenceMenu.sourceHandle,
				target: targetId,
				targetHandle: type === "image" ? "in:images" : "in:image",
			});
			setReferenceMenu(null);
		},
		[referenceMenu],
	);

	const addNodeFromContextMenu = useCallback(
		(type: string, data?: Record<string, unknown>) => {
			if (!paneContextMenu) return;
			useFlow.getState().addNode({ type, data }, paneContextMenu.position);
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
						error instanceof Error ? error.message : "上传图片失败，请重试",
				});
			} finally {
				setIsUploadingContextImage(false);
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
			imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1);
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

			const images = files.filter(isSupportedImageFile);
			const rejectedCount = files.length - images.length;
			if (images.length === 0) {
				showErrorToast({ message: "请拖入 PNG、JPG、WebP、GIF 或 AVIF 图片" });
				return;
			}

			const dropPosition = reactFlowInstance.screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});
			setIsUploadingDroppedImages(true);
			try {
				const uploads = await Promise.allSettled(
					images.map((file) => getPresignedUploadUrl(file)),
				);
				let failedCount = rejectedCount;
				const uploadedFileKeys: string[] = [];
				for (const upload of uploads) {
					if (upload.status === "rejected") {
						failedCount += 1;
						logger.error("Failed to upload dropped image:", upload.reason);
						continue;
					}
					uploadedFileKeys.push(upload.value.fileKey);
				}

				if (uploadedFileKeys.length > 0) {
					useFlow.getState().addNode(
						{
							type: "imageNode",
							data: {
								fileKeys: uploadedFileKeys,
								isUploadGroup: uploadedFileKeys.length > 1,
								groupLabel:
									uploadedFileKeys.length > 1 ? "上传组" : undefined,
							},
						},
						dropPosition,
					);
				}

				if (failedCount > 0) {
					showErrorToast({
						message: `已导入 ${uploadedFileKeys.length} 张图片，另有 ${failedCount} 个文件导入失败`,
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

			if (command && !editingText && e.key.toLowerCase() === "c") {
				const state = useFlow.getState();
				const selected = state.nodes.filter((node) => node.selected);
				if (selected.length > 0) {
					const selectedIds = new Set(selected.map((node) => node.id));
					nodeClipboardRef.current = {
						nodes: structuredClone(selected),
						edges: structuredClone(
							state.edges.filter(
								(edge) =>
									selectedIds.has(edge.source) && selectedIds.has(edge.target),
							),
						),
					};
					pasteOffsetRef.current = 0;
					e.preventDefault();
				}
				return;
			}

			if (command && !editingText && e.key.toLowerCase() === "v") {
				const clipboard = nodeClipboardRef.current;
				if (clipboard?.nodes.length) {
					const state = useFlow.getState();
					const idMap = new Map<string, string>();
					pasteOffsetRef.current += 40;
					const offset = pasteOffsetRef.current;
					const copiedNodes = clipboard.nodes.map((node) => {
						const id = crypto.randomUUID();
						idMap.set(node.id, id);
						return {
							...structuredClone(node),
							id,
							selected: true,
							position: {
								x: node.position.x + offset,
								y: node.position.y + offset,
							},
						};
					});
					const copiedEdges = clipboard.edges.map((edge) => ({
						...structuredClone(edge),
						id: crypto.randomUUID(),
						source: idMap.get(edge.source) ?? edge.source,
						target: idMap.get(edge.target) ?? edge.target,
						selected: false,
					}));
					const deselected = state.nodes.map((node) => ({
						...node,
						selected: false,
					}));
					state.setNodes([...deselected, ...copiedNodes]);
					state.setEdges([...state.edges, ...copiedEdges]);
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
				const selectedEdgeIds = new Set(
					state.edges.filter((edge) => edge.selected).map((edge) => edge.id),
				);
				if (selectedEdgeIds.size > 0) {
					state.setEdges(
						state.edges.filter((edge) => !selectedEdgeIds.has(edge.id)),
					);
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
	}, []);

	// Restore nodes, edges, and workflow metadata from port-independent disk
	// storage, with localStorage retained as a fast per-session cache.
	useEffect(() => {
		let cancelled = false;
		const restore = async () => {
			const requestedId = new URLSearchParams(window.location.search).get(
				"canvas",
			);
			const canvasId = requestedId || getActiveCanvasId();
			setActiveCanvasId(canvasId);
			useFlow.setState({ nodes: [], edges: [] });
			await hydrateCanvasHistoryFromDisk();
			if (cancelled) return;
			ensureCanvas(canvasId);

			try {
				const nodes = JSON.parse(
					localStorage.getItem(canvasStorageKey(canvasId, "nodes")) || "[]",
				) as Node[];
				const edges = JSON.parse(
					localStorage.getItem(canvasStorageKey(canvasId, "edges")) || "[]",
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
			} catch (e) {
				logger.error("Failed to restore canvas:", e);
			}
		};
		void restore();
		return () => {
			cancelled = true;
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
		// biome-ignore lint/a11y/noStaticElementInteractions: the canvas drop surface must receive native file drag events
		<div
			className="relative w-full h-full overflow-hidden [&_.react-flow]:!bg-[#f6f7f9] dark:[&_.react-flow]:!bg-background [&_.react-flow__background]:!pointer-events-none [&_.react-flow__handle]:!z-20 [&_.react-flow__handle]:!pointer-events-auto [&_.react-flow__handle-source]:!h-7 [&_.react-flow__handle-source]:!w-7 [&_.react-flow__handle-source]:!cursor-crosshair [&_.react-flow__handle-source]:!border-[3px] [&_.react-flow__handle-source]:!border-white [&_.react-flow__handle-source]:!bg-amber-500 [&_.react-flow__handle-source]:!shadow-[0_0_0_4px_rgba(245,158,11,.22)] [&_.react-flow__handle-target]:!h-6 [&_.react-flow__handle-target]:!w-6 [&_.react-flow__handle-target]:!cursor-crosshair [&_.react-flow__handle-target]:!border-[3px] [&_.react-flow__handle-target]:!border-white [&_.react-flow__handle-target]:!bg-blue-500"
			onContextMenuCapture={handlePaneContextMenu}
			onDragEnter={handleImageDragEnter}
			onDragOver={handleImageDragOver}
			onDragLeave={handleImageDragLeave}
			onDrop={(event) => void handleCanvasImageDrop(event)}
		>
			<ReactFlow
				nodes={nodes}
				onNodesChange={onNodesChange}
				edges={edges}
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
				onPaneClick={handlePaneClick}
				onPaneContextMenu={handlePaneContextMenu}
				onEdgeContextMenu={handleEdgeContextMenu}
				nodeOrigin={[0.5, 0.5]}
				onlyRenderVisibleElements
				elevateNodesOnSelect={false}
				selectNodesOnDrag={false}
				fitView
				minZoom={0.02}
				maxZoom={8}
				connectionRadius={64}
				reconnectRadius={40}
				connectionDragThreshold={0}
				connectOnClick={true}
				autoPanOnConnect={true}
				proOptions={{ hideAttribution: true }}
				colorMode={colorMode}
			>
				<Background style={{ pointerEvents: "none" }} />
				<Controls />
				<Panel position="bottom-center" className="!mb-5 z-10">
					<SmartIsland />
				</Panel>
			</ReactFlow>

			{(isDraggingImages || isUploadingDroppedImages) && (
				<div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-3xl border-2 border-dashed border-blue-400 bg-blue-500/10 backdrop-blur-sm">
					<div className="flex items-center gap-3 rounded-2xl bg-zinc-950/85 px-6 py-4 text-white shadow-2xl">
						<ImagePlus className="h-7 w-7 text-blue-300" />
						<div>
							<div className="font-medium">
								{isUploadingDroppedImages
									? "正在导入图片…"
									: "松开鼠标，将图片放入画布"}
							</div>
							<div className="text-xs text-zinc-400">支持一次拖入多张图片</div>
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
						onClick={() => addNodeFromContextMenu("textGenVideoNode")}
					>
						<Video className="h-4 w-4" />
						{tNodes("titles.textGenVideo")}
					</button>
					<button
						type="button"
						role="menuitem"
						className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
						onClick={() => addNodeFromContextMenu("textNode", { texts: [""] })}
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
							<span className="block text-sm font-medium">文本</span>
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
							<span className="block text-sm font-medium">图片</span>
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
							<span className="block text-sm font-medium">视频</span>
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
						<AlertDialogTitle>{tEdges("deleteConfirmTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{tEdges("deleteConfirmDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{tEdges("cancel")}</AlertDialogCancel>
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
