"use client";

import { useReactFlow } from "@xyflow/react";
import {
    AlertCircle,
    Bot,
    Check,
    ChevronRight,
    Copy,
    Image as ImageIcon,
    LoaderCircle,
    MessageCircle,
    MessageSquareWarning,
    Plus,
    Send,
    Trash2,
    Video as VideoIcon,
    Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFlow } from "@/hooks/use-flow";
import {
    collectAgentContextNodes,
    collectAgentVisualMedia,
} from "@/lib/agent-media";
import type { SeedanceAgentVersion } from "@/lib/agent-skill-library";
import {
    buildCanvasAgentInput,
    buildCanvasAgentInstruction,
    type CanvasAgentMode,
    type CanvasAgentTarget,
} from "@/lib/canvas-agent";
import { getFileUrl } from "@/lib/file/url";
import { generatePromptWithLlm } from "@/lib/prompt-llm";
import { cn } from "@/lib/utils";

const selector = (state: ReturnType<typeof useFlow.getState>) => ({
    nodes: state.nodes,
    edges: state.edges,
    addNode: state.addNode,
    updates: state.updates,
});

function textValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
        return value.map(textValue).filter(Boolean).join(" / ");
    }
    return "";
}

function nodeName(node: { id: string; type?: string; data: unknown }) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    return (
        textValue(data.label) ||
        textValue(data.fileName) ||
        textValue(data.title) ||
        node.type ||
        node.id
    );
}

function nodeKind(type?: string) {
    const value = String(type ?? "").toLowerCase();
    if (value.includes("video")) return "视频";
    if (value.includes("image")) return "图片";
    if (value.includes("audio")) return "音频";
    return "节点";
}

function nodePreview(node: { data: unknown }) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const values = [
        ...(Array.isArray(data.fileKeys) ? data.fileKeys : []),
        data.fileKey,
        data.url,
        data.imageUrl,
        data.videoUrl,
        data.previewUrl,
        data.outputUrl,
    ];
    const value = values.find(
        (item): item is string => typeof item === "string" && item.length > 0,
    );
    return value ? getFileUrl(value) : "";
}

function extractUsablePrompt(value: string): string {
    const marker = "【可直接使用的提示词】";
    const index = value.indexOf(marker);
    if (index < 0) return value.trim();
    return value
        .slice(index + marker.length)
        .trim()
        .replace(/^[:：\s]+/, "");
}

function Segment({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs transition",
                active
                    ? "bg-white text-zinc-950"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
        >
            {children}
        </button>
    );
}

export function CanvasAgentAssistant({
    referencedNodeIds,
    onReferencedNodeIdsChange,
    onOpenChange,
}: {
    referencedNodeIds: string[];
    onReferencedNodeIdsChange: (ids: string[]) => void;
    onOpenChange: (open: boolean) => void;
}) {
    const { nodes, edges, addNode, updates } = useFlow(useShallow(selector));
    const reactFlow = useReactFlow();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<CanvasAgentMode>("chat");
    const [target, setTarget] = useState<CanvasAgentTarget>("video");
    const [videoVersion, setVideoVersion] =
        useState<SeedanceAgentVersion>("2.5");
    const [brief, setBrief] = useState("");
    const [result, setResult] = useState("");
    const [error, setError] = useState("");
    const [mediaNote, setMediaNote] = useState("");
    const [loading, setLoading] = useState(false);

    const selectedNodes = useMemo(() => {
        const ids = new Set(referencedNodeIds);
        return nodes.filter((node) => ids.has(node.id));
    }, [nodes, referencedNodeIds]);
    const contextNodes = useMemo(
        () =>
            collectAgentContextNodes({ nodes, edges, selectedNodes }).slice(
                0,
                12,
            ),
        [nodes, edges, selectedNodes],
    );
    const contextText = useMemo(
        () =>
            buildCanvasAgentInput({
                nodes,
                edges,
                selectedNodes,
                userBrief: [
                    brief,
                    selectedNodes.length
                        ? `用户在 Agent 面板中主动选择了：${selectedNodes
                              .map(
                                  (node) =>
                                      `${nodeKind(node.type)}=${nodeName(node)}`,
                              )
                              .join("，")}。`
                        : mode === "chat"
                          ? "普通询问，不要求选择画布节点。"
                          : "用户没有选择画布节点。",
                ]
                    .filter(Boolean)
                    .join("\n"),
                mode,
                target,
                videoVersion,
            }),
        [brief, edges, mode, nodes, selectedNodes, target, videoVersion],
    );

    const changeOpen = (value: boolean) => {
        setOpen(value);
        onOpenChange(value);
    };

    const runAgent = async () => {
        if (!brief.trim() && selectedNodes.length === 0) {
            setError("请输入问题，或先在画布上选择一个图片/视频节点。");
            return;
        }
        setLoading(true);
        setError("");
        setMediaNote("");
        setResult("");
        try {
            const visual = await collectAgentVisualMedia({
                nodes,
                edges,
                selectedNodes,
            });
            if (visual.media.length) {
                setMediaNote(`已读取 ${visual.media.length} 张原图/视频关键帧`);
            } else if (visual.candidateCount) {
                setMediaNote(
                    "检测到视觉节点，但画面读取失败，将使用节点文字上下文",
                );
            }
            if (visual.warnings.length) {
                setMediaNote((current) =>
                    [current, visual.warnings.join("；")]
                        .filter(Boolean)
                        .join("；"),
                );
            }
            const next = await generatePromptWithLlm({
                input: contextText,
                instruction: buildCanvasAgentInstruction({
                    mode,
                    target,
                    videoVersion,
                }),
                media: visual.media,
                timeoutMs: 180_000,
            });
            setResult(next);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Agent 调用失败，请检查大语言模型配置。",
            );
        } finally {
            setLoading(false);
        }
    };

    const applyToNode = () => {
        const node = selectedNodes[0];
        const prompt = extractUsablePrompt(result);
        if (!node || !prompt) return;
        updates(
            node.id,
            {
                ...(node.data as Record<string, unknown>),
                text: prompt,
                agentPromptUpdatedAt: Date.now(),
            },
            { immediate: true },
        );
        toast.success("已应用到第一个选中节点");
    };

    const createNode = () => {
        const prompt = extractUsablePrompt(result);
        if (!prompt) return;
        const root = document
            .querySelector(".react-flow")
            ?.getBoundingClientRect();
        const position = root
            ? reactFlow.screenToFlowPosition({
                  x: root.left + root.width / 2,
                  y: root.top + root.height / 2,
              })
            : undefined;
        addNode(
            target === "video"
                ? { type: "textGenVideoNode", data: { text: prompt } }
                : { type: "textGenImageNode", data: { text: prompt } },
            position,
        );
        toast.success(target === "video" ? "已新建视频节点" : "已新建图片节点");
    };

    return (
        <>
            {!open ? (
                <button
                    type="button"
                    className="pointer-events-auto flex h-10 items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-950/95 px-3.5 text-sm font-medium text-white shadow-xl transition hover:border-cyan-300/40 hover:bg-zinc-900"
                    onClick={() => changeOpen(true)}
                >
                    <Bot className="h-4 w-4 text-cyan-300" />
                    Agent
                </button>
            ) : null}

            {open && typeof document !== "undefined"
                ? createPortal(
                      <aside
                          className="pointer-events-auto fixed bottom-3 right-3 top-3 z-[10000] flex w-[min(410px,calc(100vw-24px))] flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#202020] text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.48)]"
                          onPointerDown={(event) => event.stopPropagation()}
                      >
                          <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
                              <div className="text-sm font-semibold">
                                  新对话
                              </div>
                              <div className="flex items-center gap-1">
                                  <button
                                      type="button"
                                      className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
                                      onClick={() => {
                                          setBrief("");
                                          setResult("");
                                          setError("");
                                          setMediaNote("");
                                      }}
                                      title="新对话"
                                  >
                                      <Plus className="h-4 w-4" />
                                  </button>
                                  <button
                                      type="button"
                                      className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
                                      onClick={() => changeOpen(false)}
                                      title="隐藏面板"
                                  >
                                      <ChevronRight className="h-4 w-4" />
                                  </button>
                              </div>
                          </header>

                          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                              <section className="rounded-xl border border-white/[0.08] bg-black/10 p-2.5">
                                  <div className="flex items-center justify-between gap-3">
                                      <span className="text-xs font-medium text-zinc-300">
                                          当前引用
                                      </span>
                                      {selectedNodes.length ? (
                                          <button
                                              type="button"
                                              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-300"
                                              onClick={() =>
                                                  onReferencedNodeIdsChange([])
                                              }
                                          >
                                              <Trash2 className="h-3 w-3" />
                                              取消全部
                                          </button>
                                      ) : (
                                          <span className="text-[11px] text-zinc-600">
                                              点击画布节点即可引用
                                          </span>
                                      )}
                                  </div>
                                  {contextNodes.length ? (
                                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                          {contextNodes.map((node) => {
                                              const kind = nodeKind(node.type);
                                              const sameKind = contextNodes
                                                  .slice(
                                                      0,
                                                      contextNodes.indexOf(
                                                          node,
                                                      ) + 1,
                                                  )
                                                  .filter(
                                                      (item) =>
                                                          nodeKind(
                                                              item.type,
                                                          ) === kind,
                                                  ).length;
                                              const preview = nodePreview(node);
                                              const direct =
                                                  referencedNodeIds.includes(
                                                      node.id,
                                                  );
                                              return (
                                                  <button
                                                      type="button"
                                                      key={node.id}
                                                      disabled={!direct}
                                                      className="relative w-[92px] shrink-0 overflow-hidden rounded-lg border border-cyan-300/20 bg-zinc-950/70 text-left disabled:cursor-default"
                                                      onClick={() =>
                                                          onReferencedNodeIdsChange(
                                                              referencedNodeIds.filter(
                                                                  (id) =>
                                                                      id !==
                                                                      node.id,
                                                              ),
                                                          )
                                                      }
                                                  >
                                                      <div className="h-14 bg-zinc-900">
                                                          {preview &&
                                                          kind === "图片" ? (
                                                              <img
                                                                  src={preview}
                                                                  alt=""
                                                                  className="h-full w-full object-cover"
                                                              />
                                                          ) : preview &&
                                                            kind === "视频" ? (
                                                              <video
                                                                  src={preview}
                                                                  muted
                                                                  preload="metadata"
                                                                  className="h-full w-full object-cover"
                                                              />
                                                          ) : (
                                                              <div className="flex h-full items-center justify-center text-zinc-600">
                                                                  {kind ===
                                                                  "视频" ? (
                                                                      <VideoIcon className="h-5 w-5" />
                                                                  ) : (
                                                                      <ImageIcon className="h-5 w-5" />
                                                                  )}
                                                              </div>
                                                          )}
                                                      </div>
                                                      <div className="flex items-center justify-between gap-1 px-1.5 py-1 text-[10px]">
                                                          <span className="font-medium text-cyan-200">
                                                              {kind}
                                                              {sameKind}
                                                          </span>
                                                          <span className="truncate text-zinc-500">
                                                              {nodeName(node)}
                                                          </span>
                                                      </div>
                                                      <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">
                                                          {direct
                                                              ? "已选"
                                                              : "上游参考"}
                                                      </span>
                                                  </button>
                                              );
                                          })}
                                      </div>
                                  ) : (
                                      <div className="mt-2 rounded-lg border border-dashed border-white/[0.08] px-3 py-2 text-[11px] leading-5 text-zinc-600">
                                          面板打开时可连续选择图片或视频节点，不需要按
                                          Ctrl。
                                      </div>
                                  )}
                              </section>

                              {mediaNote ? (
                                  <div className="mt-3 text-[11px] leading-5 text-cyan-300/80">
                                      {mediaNote}
                                  </div>
                              ) : null}
                              {error ? (
                                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
                                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                      {error}
                                  </div>
                              ) : null}

                              {loading ? (
                                  <div className="mt-8 flex flex-col items-center justify-center gap-3 text-xs text-zinc-500">
                                      <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" />
                                      Agent 正在读取素材并分析
                                  </div>
                              ) : result ? (
                                  <div className="mt-4">
                                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-400">
                                          <Bot className="h-4 w-4 text-cyan-300" />
                                          Agent
                                      </div>
                                      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-white/[0.08] bg-zinc-900/80 px-4 py-3 text-[13px] leading-6 text-zinc-200">
                                          {result}
                                      </div>
                                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                                          <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                  void navigator.clipboard.writeText(
                                                      extractUsablePrompt(
                                                          result,
                                                      ),
                                                  );
                                                  toast.success("提示词已复制");
                                              }}
                                          >
                                              <Copy className="h-3.5 w-3.5" />
                                              复制
                                          </Button>
                                          <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              disabled={!selectedNodes.length}
                                              onClick={applyToNode}
                                          >
                                              <Check className="h-3.5 w-3.5" />
                                              应用到节点
                                          </Button>
                                          <Button
                                              type="button"
                                              size="sm"
                                              onClick={createNode}
                                          >
                                              <Plus className="h-3.5 w-3.5" />
                                              新建节点
                                          </Button>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="flex min-h-[220px] flex-col items-center justify-center px-8 text-center">
                                      <Bot className="mb-3 h-7 w-7 text-zinc-600" />
                                      <p className="text-xs leading-6 text-zinc-600">
                                          选择节点后描述生成问题，或直接询问、从零撰写提示词。
                                      </p>
                                  </div>
                              )}
                          </div>

                          <div className="shrink-0 border-t border-white/[0.06] bg-[#202020] px-4 pb-4 pt-3">
                              <div className="mb-2 flex items-center gap-1 overflow-x-auto rounded-lg bg-black/20 p-1">
                                  <Segment
                                      active={mode === "chat"}
                                      onClick={() => setMode("chat")}
                                  >
                                      <MessageCircle className="mr-1 inline h-3 w-3" />
                                      普通询问
                                  </Segment>
                                  <Segment
                                      active={mode === "troubleshoot"}
                                      onClick={() => setMode("troubleshoot")}
                                  >
                                      <MessageSquareWarning className="mr-1 inline h-3 w-3" />
                                      问题诊断
                                  </Segment>
                                  <Segment
                                      active={mode === "draft"}
                                      onClick={() => setMode("draft")}
                                  >
                                      <Wand2 className="mr-1 inline h-3 w-3" />
                                      从零撰写
                                  </Segment>
                              </div>
                              <div className="mb-2 flex items-center gap-1 overflow-x-auto rounded-lg bg-black/20 p-1">
                                  <Segment
                                      active={target === "video"}
                                      onClick={() => setTarget("video")}
                                  >
                                      视频
                                  </Segment>
                                  <Segment
                                      active={target === "image"}
                                      onClick={() => setTarget("image")}
                                  >
                                      图片
                                  </Segment>
                                  {target === "video" ? (
                                      <>
                                          <Segment
                                              active={videoVersion === "2.0"}
                                              onClick={() =>
                                                  setVideoVersion("2.0")
                                              }
                                          >
                                              Seedance 2.0
                                          </Segment>
                                          <Segment
                                              active={videoVersion === "2.5"}
                                              onClick={() =>
                                                  setVideoVersion("2.5")
                                              }
                                          >
                                              Seedance 2.5
                                          </Segment>
                                      </>
                                  ) : null}
                              </div>
                              <div className="relative rounded-2xl border border-white/10 bg-zinc-900/90 p-2.5 pr-12 focus-within:border-white/20">
                                  <Textarea
                                      value={brief}
                                      onChange={(event) =>
                                          setBrief(event.target.value)
                                      }
                                      onKeyDown={(event) => {
                                          if (
                                              event.key === "Enter" &&
                                              !event.shiftKey &&
                                              !event.nativeEvent.isComposing
                                          ) {
                                              event.preventDefault();
                                              void runAgent();
                                          }
                                      }}
                                      placeholder="输入问题，或描述想生成的画面…"
                                      className="min-h-[72px] resize-none border-0 bg-transparent p-1 text-sm text-zinc-100 shadow-none focus-visible:ring-0 placeholder:text-zinc-600"
                                  />
                                  <button
                                      type="button"
                                      className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                                      onClick={() => void runAgent()}
                                      disabled={loading}
                                      title="发送给 Agent"
                                  >
                                      {loading ? (
                                          <LoaderCircle className="h-4 w-4 animate-spin" />
                                      ) : (
                                          <Send className="h-4 w-4" />
                                      )}
                                  </button>
                              </div>
                          </div>
                      </aside>,
                      document.body,
                  )
                : null}
        </>
    );
}
