"use client";

import { Check, RotateCcw, Sparkles } from "lucide-react";
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
import { optimizeSeedance25Prompt } from "@/lib/seedance-25-prompt";

type SeedancePromptOptimizerProps = {
    value: string;
    onChange: (value: string) => void;
    duration?: number;
    referenceLabels?: string[];
};

/** Local Seedance prompt helper shown beside the video generate button. */
export function SeedancePromptOptimizer({
    value,
    onChange,
    duration,
    referenceLabels,
}: SeedancePromptOptimizerProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");

    useEffect(() => {
        if (open) {
            setDraft(
                optimizeSeedance25Prompt(value, {
                    duration,
                    referenceLabels,
                    assetCount: referenceLabels?.length,
                }),
            );
        }
        // Recompute when the dialog opens. Keeping the dependency to `open` avoids
        // resetting the editable result on every keystroke in the raw prompt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const optimizeAgain = () =>
        setDraft(
            optimizeSeedance25Prompt(value, {
                duration,
                referenceLabels,
                assetCount: referenceLabels?.length,
            }),
        );

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
                提示词优化
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="nodrag max-h-[88vh] max-w-2xl overflow-y-auto"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <DialogHeader>
                        <DialogTitle>Seedance 提示词优化</DialogTitle>
                        <DialogDescription>
                            按官方顺序整理主体与动作、场景、视觉风格、镜头和声音，并保留原始创意。
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
                            className="nodrag resize-y font-mono text-xs leading-5"
                        />
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
                            onClick={optimizeAgain}
                        >
                            <RotateCcw className="size-4" />
                            重新优化
                        </Button>
                        <Button
                            type="button"
                            className="nodrag"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => {
                                onChange(draft);
                                setOpen(false);
                            }}
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
