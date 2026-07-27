"use client";

/**
 * Smart Island
 *
 * Bottom toolbar that adapts to canvas state:
 *  - execute mode: shows the play / running ball + a save-and-execute dialog
 *  - no selection: shows the add-node icon row
 *  - single node / combo: shows contextual actions from `useNodeActions`
 */

import { useReactFlow } from "@xyflow/react";
import {
    Box,
    Download,
    Eye,
    FileText,
    Image,
    ImagePlus,
    History as HistoryIcon,
    CheckSquare,
    Link,
    Music,
    Trash2,
    Type,
    Video,
    X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ExecutionButton } from "@/components/workspace/execution-button";
import { ExecutionStatusLine } from "@/components/workspace/execution-status-line";
import { SaveExecuteDialog } from "@/components/workspace/save-execute-dialog";
import type { FlowState, PossibleNode } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";
import { useNodeActions } from "@/hooks/use-node-actions";
import { useTaskStore } from "@/hooks/use-task";
import { useWorkflowExecution } from "@/hooks/use-workflow-execution";
import { emitTaskCancelRequest } from "@/lib/task/sse-events";
import {
    generationHistoryNeedsSync,
    readGenerationHistory,
    withGenerationHistory,
} from "@/lib/generation-history";
import { cn } from "@/lib/utils";
import {
    downloadImageFile,
    ZoomableImageViewer,
} from "@/components/workspace/nodes/base/zoomable-image-viewer";

interface IconButtonProps {
    icon: React.ComponentType<{ className?: string }>;
    tooltip: string;
    onClick?: () => void;
}

function IconButton({ icon: Icon, tooltip, onClick }: IconButtonProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "w-10 h-10 flex items-center justify-center cursor-pointer rounded-full",
                        "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50",
                        "transition-colors duration-200",
                        "active:scale-95",
                        "text-gray-600 dark:text-gray-200",
                    )}
                    onClick={onClick}
                >
                    <Icon className="w-5 h-5" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    );
}

function HistoryImageCard({
    fileKey,
    label,
    checked,
    selectionMode,
    onToggle,
    onView,
    onUse,
}: {
    fileKey: string;
    label: string;
    checked: boolean;
    selectionMode: boolean;
    onToggle: () => void;
    onView: (url: string) => void;
    onUse: () => void;
}) {
    const { url, isLoading } = useFileAsyncLoader(fileKey, {
        priority: "high",
    });

    return (
        <div
            className={cn(
                "group relative aspect-square overflow-hidden rounded-xl border bg-zinc-900/40",
                "transition duration-200 hover:-translate-y-0.5 hover:border-zinc-500 hover:shadow-xl",
                checked && "border-blue-500 ring-2 ring-blue-500/40",
            )}
        >
            {url ? (
                <img
                    src={url}
                    alt={label}
                    className="h-full w-full object-contain"
                    loading="lazy"
                />
            ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    {isLoading ? "正在加载…" : "图片暂不可用"}
                </div>
            )}
            {selectionMode ? (
                <label className="absolute right-3 top-3 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/70 backdrop-blur">
                    <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-blue-500"
                        checked={checked}
                        aria-label={`选择${label}`}
                        onChange={onToggle}
                    />
                </label>
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition duration-200 group-hover:bg-black/60 group-hover:opacity-100">
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!url}
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => url && onView(url)}
                >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    查看
                </Button>
                <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-zinc-200"
                    onClick={onUse}
                >
                    使用
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!url}
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => url && void downloadImageFile(url)}
                >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    下载
                </Button>
            </div>
        </div>
    );
}

const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
    comboMode: state.comboMode,
    comboSelectedIds: state.comboSelectedIds,
    addNode: state.addNode,
    selectedNodes: state.selectedNodes,
    expands: state.expands,
    compose: state.compose,
    workflowId: state.workflowId,
    workflowName: state.workflowName,
    workflowDescription: state.workflowDescription,
    setWorkflowName: state.setWorkflowName,
    setWorkflowId: state.setWorkflowId,
    setWorkflowDescription: state.setWorkflowDescription,
});

export default function SmartIsland() {
    const {
        nodes,
        edges,
        addNode,
        selectedNodes,
        comboMode,
        comboSelectedIds,
        expands,
        compose,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowName,
        setWorkflowId,
        setWorkflowDescription,
    } = useFlow(useShallow(selector));

    const t = useTranslations("Workspace.smartIsland");
    const tIndex = useTranslations("Index");
    const reactFlow = useReactFlow();
    const { screenToFlowPosition } = reactFlow;
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historySelectionMode, setHistorySelectionMode] = useState(false);
    const [historyPreview, setHistoryPreview] = useState<string | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<Set<string>>(
        () => new Set(),
    );

    useEffect(() => {
        const syncHistory = () => {
            const now = Date.now();
            let changed = false;
            const currentNodes = useFlow.getState().nodes;
            const nextNodes = currentNodes.map((node) => {
                const data = node.data as Record<string, unknown>;
                const hasHistory =
                    Array.isArray(data.generationHistory) ||
                    Array.isArray(data.generationHistoryRecords);
                if (!hasHistory) return node;
                const records = readGenerationHistory(data, now);
                if (!generationHistoryNeedsSync(data, records)) return node;
                changed = true;
                return { ...node, data: withGenerationHistory(data, records) };
            });
            if (changed) useFlow.getState().setNodes(nextNodes);
        };

        syncHistory();
        const timer = window.setInterval(syncHistory, 60 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, [nodes]);

    const generationHistory = useMemo(() => {
        const seen = new Set<string>();
        const items: Array<{
            nodeId: string;
            fileKey: string;
            createdAt: number;
        }> = [];
        const now = Date.now();
        for (const node of nodes) {
            const data = node.data as Record<string, unknown>;
            const records = readGenerationHistory(data, now);
            for (const { fileKey, createdAt } of records) {
                if (!fileKey || seen.has(fileKey)) continue;
                seen.add(fileKey);
                items.push({ nodeId: node.id, fileKey, createdAt });
            }
        }
        return items.sort((a, b) => b.createdAt - a.createdAt);
    }, [nodes]);

    useEffect(() => {
        const available = new Set(
            generationHistory.map((item) => `${item.nodeId}:${item.fileKey}`),
        );
        setSelectedHistory((current) => {
            const next = new Set(
                [...current].filter((key) => available.has(key)),
            );
            const unchanged =
                next.size === current.size &&
                [...next].every((key) => current.has(key));
            return unchanged ? current : next;
        });
    }, [generationHistory]);

    const toggleHistorySelection = useCallback((key: string) => {
        setSelectedHistory((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const selectAllHistory = useCallback(() => {
        setSelectedHistory(
            new Set(
                generationHistory.map(
                    (item) => `${item.nodeId}:${item.fileKey}`,
                ),
            ),
        );
    }, [generationHistory]);

    const deleteSelectedHistory = useCallback(() => {
        if (selectedHistory.size === 0) return;
        if (
            !window.confirm(
                `确定从生成历史中删除选中的 ${selectedHistory.size} 条记录吗？`,
            )
        ) {
            return;
        }
        const state = useFlow.getState();
        const now = Date.now();
        const nextNodes = state.nodes.map((node) => {
            const data = node.data as Record<string, unknown>;
            const records = readGenerationHistory(data, now);
            const filtered = records.filter(
                (record) =>
                    !selectedHistory.has(`${node.id}:${record.fileKey}`),
            );
            return filtered.length === records.length
                ? node
                : { ...node, data: withGenerationHistory(data, filtered) };
        });
        state.setNodes(nextNodes);
        setSelectedHistory(new Set());
    }, [selectedHistory]);

    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const workflowExecutionStatus = useTaskStore(
        (state) => state.workflowExecutionStatus,
    );
    const isExecuteMode = workspaceMode === "execute";
    const isRunning = workflowExecutionStatus === "running";

    const addNodeAtViewportCenter = useCallback(
        (node: PossibleNode) => {
            const el =
                typeof document !== "undefined"
                    ? document.querySelector(".react-flow")
                    : null;
            if (!el) {
                addNode(node);
                return;
            }
            const r = el.getBoundingClientRect();
            addNode(
                node,
                screenToFlowPosition({
                    x: r.left + r.width / 2,
                    y: r.top + r.height / 2,
                }),
            );
        },
        [addNode, screenToFlowPosition],
    );

    const useHistoryImage = useCallback(
        (fileKey: string) => {
            addNodeAtViewportCenter({
                type: "imageNode",
                data: { fileKeys: [fileKey] },
            });
            setHistoryOpen(false);
        },
        [addNodeAtViewportCenter],
    );

    const {
        showSaveDialog,
        setShowSaveDialog,
        tempName,
        setTempName,
        tempDescription,
        setTempDescription,
        isSaving,
        handleExecuteClick,
        handleSaveAndExecute,
    } = useWorkflowExecution({
        nodes,
        edges,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowId,
        setWorkflowName,
        setWorkflowDescription,
        defaultWorkflowName: tIndex("title"),
        t,
    });

    const { comboActions, singleActions } = useNodeActions({
        nodes,
        selectedNodes,
        comboMode,
        comboSelectedIds,
        expands,
        compose,
        t,
    });

    const historyControl = (
        <div className="relative flex h-12 items-center rounded-2xl border border-gray-200/50 bg-white p-1 shadow-sm backdrop-blur-md dark:border-gray-500/60 dark:bg-zinc-800/90">
            <IconButton
                icon={HistoryIcon}
                tooltip="历史记录"
                onClick={() => setHistoryOpen(true)}
            />
            {generationHistory.length > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-600 px-1.5 text-center text-[11px] leading-5 text-white">
                    {generationHistory.length > 99
                        ? "99+"
                        : generationHistory.length}
                </span>
            )}
        </div>
    );

    const historyDialog = (
        <>
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-h-[86vh] max-w-6xl overflow-hidden border-zinc-700 bg-zinc-950 p-0 text-zinc-100">
                    <DialogHeader className="sr-only">
                        <DialogTitle>图片历史</DialogTitle>
                        <DialogDescription>
                            查看、使用、下载或批量管理近 7 天生成的图片。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1">
                            <button
                                type="button"
                                className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium"
                            >
                                图片历史
                            </button>
                            <span className="px-3 py-1.5 text-sm text-zinc-500">
                                近 7 天
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                onClick={() => {
                                    setHistorySelectionMode((value) => !value);
                                    setSelectedHistory(new Set());
                                }}
                            >
                                <CheckSquare className="mr-1.5 h-4 w-4" />
                                {historySelectionMode ? "完成" : "批量操作"}
                            </Button>
                            <button
                                type="button"
                                aria-label="关闭历史记录"
                                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
                                onClick={() => setHistoryOpen(false)}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {historySelectionMode && generationHistory.length > 0 ? (
                        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/60 px-5 py-3">
                            <span className="text-sm text-zinc-400">
                                共 {generationHistory.length} 张，已选择{" "}
                                {selectedHistory.size} 张
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-zinc-700 bg-zinc-900"
                                    onClick={selectAllHistory}
                                >
                                    全选
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={selectedHistory.size === 0}
                                    onClick={deleteSelectedHistory}
                                >
                                    <Trash2 className="mr-1.5 h-4 w-4" />
                                    删除选中
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="max-h-[72vh] overflow-y-auto p-5">
                        {generationHistory.length === 0 ? (
                            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-500">
                                当前画布还没有生成记录
                            </div>
                        ) : (
                            <>
                                <div className="mb-3 text-sm text-zinc-400">
                                    最近生成
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                                    {generationHistory.map((item, index) => {
                                        const selectionKey = `${item.nodeId}:${item.fileKey}`;
                                        return (
                                            <HistoryImageCard
                                                key={selectionKey}
                                                fileKey={item.fileKey}
                                                label={`历史图片 ${index + 1}`}
                                                checked={selectedHistory.has(
                                                    selectionKey,
                                                )}
                                                selectionMode={
                                                    historySelectionMode
                                                }
                                                onToggle={() =>
                                                    toggleHistorySelection(
                                                        selectionKey,
                                                    )
                                                }
                                                onView={setHistoryPreview}
                                                onUse={() =>
                                                    useHistoryImage(
                                                        item.fileKey,
                                                    )
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(historyPreview)}
                onOpenChange={(open) => {
                    if (!open) setHistoryPreview(null);
                }}
            >
                <DialogContent className="h-[90vh] max-w-[94vw] overflow-hidden border-zinc-700 bg-zinc-950 p-3 text-white">
                    <DialogHeader className="sr-only">
                        <DialogTitle>查看历史图片</DialogTitle>
                        <DialogDescription>
                            可缩放查看并下载原图。
                        </DialogDescription>
                    </DialogHeader>
                    {historyPreview ? (
                        <ZoomableImageViewer
                            src={historyPreview}
                            alt="历史图片预览"
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );

    // Execute mode: always show play/running button regardless of node selection
    if (isExecuteMode) {
        return (
            <>
                {historyDialog}
                <SaveExecuteDialog
                    open={showSaveDialog}
                    onOpenChange={setShowSaveDialog}
                    isNewWorkflow={!workflowId}
                    tempName={tempName}
                    tempDescription={tempDescription}
                    onNameChange={setTempName}
                    onDescriptionChange={setTempDescription}
                    onConfirm={handleSaveAndExecute}
                    isSaving={isSaving}
                />
                <div className="flex items-end gap-3">
                    <div className="flex flex-col items-center gap-2">
                        <ExecutionStatusLine />
                        <ExecutionButton
                            isRunning={isRunning}
                            onExecute={handleExecuteClick}
                            onCancel={() => emitTaskCancelRequest(null)}
                        />
                    </div>
                    {historyControl}
                </div>
            </>
        );
    }

    const addToolbar = (
        <div
            className="flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className={cn(
                    "relative overflow-hidden flex items-center justify-center gap-2",
                    "border border-gray-200/50 dark:border-gray-500/60",
                    "backdrop-blur-md bg-white dark:bg-zinc-800/90",
                    "w-auto h-12 rounded-2xl p-1",
                )}
            >
                <div className="flex items-center gap-2">
                    <IconButton
                        icon={Box}
                        tooltip={t("tooltip3D")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addModelNode" })
                        }
                    />
                    <IconButton
                        icon={FileText}
                        tooltip={t("tooltipDocument")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addFileNode" })
                        }
                    />
                    <IconButton
                        icon={Image}
                        tooltip={t("tooltipImage")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addImageNode" })
                        }
                    />
                    <IconButton
                        icon={ImagePlus}
                        tooltip="AI 图片生成"
                        onClick={() =>
                            addNodeAtViewportCenter({
                                type: "textGenImageNode",
                                data: {
                                    pluginId: "tongflow-api-banana-relay",
                                },
                            })
                        }
                    />
                    <IconButton
                        icon={Type}
                        tooltip={t("tooltipText")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addTextNode" })
                        }
                    />
                    <IconButton
                        icon={Video}
                        tooltip={t("tooltipVideo")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addVideoNode" })
                        }
                    />
                    <IconButton
                        icon={Music}
                        tooltip={t("tooltipAudio")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addAudioNode" })
                        }
                    />
                    <IconButton
                        icon={Link}
                        tooltip={t("tooltipLink")}
                        onClick={() =>
                            addNodeAtViewportCenter({ type: "addLinkNode" })
                        }
                    />
                </div>
            </div>
        </div>
    );

    // No nodes selected -> add-node toolbar
    if (selectedNodes.length === 0) {
        return (
            <>
                {historyDialog}
                <div className="flex items-center gap-3">
                    {addToolbar}
                    {historyControl}
                </div>
            </>
        );
    }

    // Combo or single-node actions; fall back to the add toolbar if there are no
    // applicable actions (e.g. a selected processing node)
    const actions = comboMode ? comboActions : singleActions;
    if (actions === null) {
        return (
            <>
                {historyDialog}
                <div className="flex items-center gap-3">
                    {addToolbar}
                    {historyControl}
                </div>
            </>
        );
    }

    return (
        <>
            {historyDialog}
            <div className="flex items-center justify-center gap-3">
                <div>{actions}</div>
                {historyControl}
            </div>
        </>
    );
}
