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
import { MediaThumbnail } from "@/components/workspace/nodes/base/media-thumbnail";
import { ExecutionButton } from "@/components/workspace/execution-button";
import { ExecutionStatusLine } from "@/components/workspace/execution-status-line";
import { SaveExecuteDialog } from "@/components/workspace/save-execute-dialog";
import type { FlowState, PossibleNode } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
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

    const openHistoryImage = useCallback(
        (nodeId: string, fileKey: string) => {
            const state = useFlow.getState();
            const node = state.nodes.find((item) => item.id === nodeId);
            if (!node) return;
            state.updates(nodeId, {
                ...(node.data as Record<string, unknown>),
                fileKeys: [fileKey],
            });
            reactFlow.setCenter(node.position.x, node.position.y, {
                zoom: 0.8,
                duration: 350,
            });
            setHistoryOpen(false);
        },
        [reactFlow],
    );

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
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="max-h-[82vh] max-w-4xl overflow-hidden p-0">
                <DialogHeader className="border-b px-6 py-5">
                    <DialogTitle className="flex items-center gap-2">
                        <HistoryIcon className="h-5 w-5 text-blue-500" />
                        生成历史
                    </DialogTitle>
                    <DialogDescription>
                        自动保留当前画布近 7
                        天生成的图片。点击图片可回到对应节点，也可以多选后批量删除历史记录。
                    </DialogDescription>
                </DialogHeader>
                {generationHistory.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-6 py-3">
                        <div className="text-sm text-muted-foreground">
                            共 {generationHistory.length} 条 · 已选择{" "}
                            {selectedHistory.size} 条
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={selectAllHistory}
                            >
                                <CheckSquare className="mr-1.5 h-4 w-4" />
                                全选
                            </Button>
                            {selectedHistory.size > 0 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        setSelectedHistory(new Set())
                                    }
                                >
                                    取消选择
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={selectedHistory.size === 0}
                                onClick={deleteSelectedHistory}
                            >
                                <Trash2 className="mr-1.5 h-4 w-4" />
                                批量删除
                            </Button>
                        </div>
                    </div>
                )}
                <div className="max-h-[62vh] overflow-y-auto p-6">
                    {generationHistory.length === 0 ? (
                        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                            当前画布还没有生成记录
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                            {generationHistory.map((item, index) => {
                                const selectionKey = `${item.nodeId}:${item.fileKey}`;
                                const checked =
                                    selectedHistory.has(selectionKey);
                                return (
                                    <div
                                        key={selectionKey}
                                        className={`relative overflow-hidden rounded-xl border bg-muted/20 p-2 transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md ${checked ? "border-blue-500 ring-2 ring-blue-500/30" : ""}`}
                                    >
                                        <label className="absolute right-3 top-3 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border bg-background/90 shadow backdrop-blur">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer accent-blue-600"
                                                checked={checked}
                                                aria-label={`选择历史图片 ${index + 1}`}
                                                onChange={() =>
                                                    toggleHistorySelection(
                                                        selectionKey,
                                                    )
                                                }
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className="block w-full text-left"
                                            onClick={() =>
                                                openHistoryImage(
                                                    item.nodeId,
                                                    item.fileKey,
                                                )
                                            }
                                        >
                                            <MediaThumbnail
                                                fileKey={item.fileKey}
                                                label={`历史图片 ${index + 1}`}
                                                type="image"
                                            />
                                            <div className="mt-2 truncate px-1 text-xs font-medium">
                                                图片 {index + 1}
                                            </div>
                                            <div className="truncate px-1 text-[11px] text-muted-foreground">
                                                {new Intl.DateTimeFormat(
                                                    "zh-CN",
                                                    {
                                                        month: "2-digit",
                                                        day: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    },
                                                ).format(item.createdAt)}
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
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
