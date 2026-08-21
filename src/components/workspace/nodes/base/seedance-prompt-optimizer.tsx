"use client";

import {
    AlertCircle,
    Check,
    LoaderCircle,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generatePromptWithLlm } from "@/lib/prompt-llm";
import { buildSeedancePromptModelInstruction } from "@/lib/seedance-25-prompt";

type SeedancePromptOptimizerProps = {
    value: string;
    onChange: (value: string) => void;
    duration?: number;
    referenceLabels?: string[];
    operation?: "generate" | "edit" | "extend";
};

/** Model-driven Seedance prompt helper shown beside the video generate button. */
export function SeedancePromptOptimizer({
    value,
    onChange,
    duration,
    referenceLabels,
    operation,
}: SeedancePromptOptimizerProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const runOptimization = async () => {
        if (!value.trim()) {
            setDraft("");
            setError("请先输入原始提示词");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const result = await generatePromptWithLlm({
                input: value,
                instruction: buildSeedancePromptModelInstruction({
                    duration,
                    referenceLabels,
                    assetCount: referenceLabels?.length,
                    operation,
                }),
            });
            setDraft(result);
        } catch (cause) {
            setDraft("");
            setError(
                cause instanceof Error
                    ? cause.message
                    : "大语言模型优化失败，请检查提示词大模型插件设置",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            void runOptimization();
        }
        // Run once when the dialog opens. Prompt edits are applied on explicit retry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="nodrag h-7 gap-1.5 text-xs"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen(true)}
            >
                <Sparkles className="size-3.5" />
                大模型优化
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="nodrag max-h-[88vh] max-w-2xl overflow-y-auto"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <DialogHeader>
                        <DialogTitle>Seedance 提示词优化</DialogTitle>
                        <DialogDescription>
                            使用“提示词大模型（OpenAI
                            兼容）”插件理解创意和素材职责，再按 Seedance
                            规则重写。
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <Label htmlFor="seedance-prompt-raw">原始提示词</Label>
                        <Textarea
                            id="seedance-prompt-raw"
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            rows={4}
                            className="nodrag resize-y"
                        />
                        <Label htmlFor="seedance-prompt-result">
                            优化结果（可继续编辑）
                        </Label>
                        <Textarea
                            id="seedance-prompt-result"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            rows={12}
                            disabled={loading}
                            placeholder={
                                loading
                                    ? "大模型正在理解创意、素材和镜头关系…"
                                    : "优化结果将在这里显示"
                            }
                            className="nodrag resize-y font-mono text-xs leading-5"
                        />
                        {loading && (
                            <div className="flex items-center gap-2 rounded-lg border border-violet-300/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-200">
                                <LoaderCircle className="size-4 animate-spin" />
                                正在调用已配置的大语言模型进行推理…
                            </div>
                        )}
                        {error && (
                            <div className="flex items-start gap-2 rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-700 dark:text-red-200">
                                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            声音标记：音乐使用（），音效使用&lt;&gt;，台词使用&#123;&#125;，字幕使用【】；引用素材时建议明确
                            @图片1、@视频1、@音频1 的职责。
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="nodrag"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => void runOptimization()}
                            disabled={loading}
                        >
                            {loading ? (
                                <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                                <RotateCcw className="size-4" />
                            )}
                            {loading ? "优化中" : "重新优化"}
                        </Button>
                        <Button
                            type="button"
                            className="nodrag"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => {
                                onChange(draft);
                                setOpen(false);
                            }}
                            disabled={loading || !draft.trim()}
                        >
                            <Check className="size-4" />
                            替换提示词
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
