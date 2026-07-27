"use client";

import { Check, Clapperboard, Copy, ExternalLink, Plus, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IMAGE_ASPECT_RATIOS } from "@/constants/media-options";
import { useFlow } from "@/hooks/use-flow";
import {
    buildCinematicPrompt,
    CINEMATIC_CAMERAS,
    CINEMATIC_LIGHTING,
    CINEMATIC_STORY_MOMENTS,
} from "@/lib/cinematic-prompt";
import { cn } from "@/lib/utils";

interface CinematicPromptToolProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateNode: (data: Record<string, unknown>) => void;
}

const RATIO_OPTIONS = ["auto", ...IMAGE_ASPECT_RATIOS.map((ratio) => ratio.value)];

export function CinematicPromptTool({
    open,
    onOpenChange,
    onCreateNode,
}: CinematicPromptToolProps) {
    const [brief, setBrief] = useState("");
    const [storyMoment, setStoryMoment] = useState("unfolding");
    const [camera, setCamera] = useState("observer");
    const [lighting, setLighting] = useState("available");
    const [aspectRatio, setAspectRatio] = useState("16:9");
    const [extraAvoid, setExtraAvoid] = useState("");
    const [generated, setGenerated] = useState(false);
    const selectedNode = useFlow((state) =>
        state.selectedNodes.length === 1 ? state.selectedNodes[0] : null,
    );
    const canApply = selectedNode?.type === "textGenImageNode";

    const result = useMemo(
        () =>
            brief.trim()
                ? buildCinematicPrompt({
                      brief,
                      storyMoment,
                      camera,
                      lighting,
                      aspectRatio,
                      extraAvoid,
                  })
                : null,
        [brief, storyMoment, camera, lighting, aspectRatio, extraAvoid],
    );

    const combinedPrompt = result
        ? `${result.prompt}\n\nAvoid: ${result.avoid}.`
        : "";

    const ensureGenerated = () => {
        if (!result) {
            toast.error("请先输入画面想法");
            return false;
        }
        setGenerated(true);
        return true;
    };

    const sizeData = () => {
        if (aspectRatio === "auto") {
            return { followReferenceRatio: true };
        }
        const ratio = IMAGE_ASPECT_RATIOS.find(
            (item) => item.value === aspectRatio,
        );
        return ratio
            ? {
                  width: ratio.width,
                  height: ratio.height,
                  outputResolutionTier: "1k",
                  followReferenceRatio: false,
              }
            : {};
    };

    const applyToSelected = () => {
        if (!ensureGenerated() || !selectedNode || !canApply) return;
        useFlow.getState().updates(selectedNode.id, {
            ...(selectedNode.data as Record<string, unknown>),
            text: combinedPrompt,
            ...sizeData(),
        });
        toast.success("电影感提示词已应用到当前生图节点", { duration: 2000 });
        onOpenChange(false);
    };

    const createNode = () => {
        if (!ensureGenerated()) return;
        onCreateNode({
            pluginId: "tongflow-api-banana-relay",
            text: combinedPrompt,
            ...sizeData(),
        });
        toast.success("已新建电影感生图节点", { duration: 2000 });
        onOpenChange(false);
    };

    const copyPrompt = async () => {
        if (!ensureGenerated()) return;
        await navigator.clipboard.writeText(combinedPrompt);
        toast.success("提示词已复制", { duration: 2000 });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg">
                            <Clapperboard className="h-5 w-5" />
                        </span>
                        电影感提示词
                    </DialogTitle>
                    <DialogDescription>
                        把简单想法整理成有故事瞬间、真实机位和动机光的生图提示词。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="cinematic-brief">画面想法</Label>
                        <Textarea
                            id="cinematic-brief"
                            value={brief}
                            onChange={(event) => {
                                setBrief(event.target.value);
                                setGenerated(false);
                            }}
                            className="min-h-24 resize-y"
                            placeholder="例如：雨夜里，一名刚下班的厨师站在关门后的餐馆门口，手里捏着一封信……"
                        />
                        <p className="text-xs text-muted-foreground">
                            中文或英文都可以。写清人物、地点和正在发生的事，效果会更稳定。
                        </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <ToolSelect
                            label="故事瞬间"
                            value={storyMoment}
                            onChange={setStoryMoment}
                            options={CINEMATIC_STORY_MOMENTS}
                        />
                        <ToolSelect
                            label="机位"
                            value={camera}
                            onChange={setCamera}
                            options={CINEMATIC_CAMERAS}
                        />
                        <ToolSelect
                            label="光线"
                            value={lighting}
                            onChange={setLighting}
                            options={CINEMATIC_LIGHTING}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>画面比例</Label>
                        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
                            {RATIO_OPTIONS.map((ratio) => (
                                <button
                                    key={ratio}
                                    type="button"
                                    className={cn(
                                        "flex h-12 flex-col items-center justify-center gap-1 rounded-lg border text-xs transition",
                                        aspectRatio === ratio
                                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                            : "border-border bg-card hover:border-primary/60 hover:bg-accent",
                                    )}
                                    onClick={() => setAspectRatio(ratio)}
                                >
                                    {aspectRatio === ratio ? (
                                        <Check className="h-3 w-3" />
                                    ) : (
                                        <span className="h-3" />
                                    )}
                                    {ratio === "auto" ? "自适应" : ratio}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="cinematic-avoid">额外避开（可选）</Label>
                        <Textarea
                            id="cinematic-avoid"
                            value={extraAvoid}
                            onChange={(event) => setExtraAvoid(event.target.value)}
                            className="min-h-16"
                            placeholder="例如：雨伞、霓虹文字、正面看镜头（用逗号分隔）"
                        />
                    </div>

                    <Button
                        type="button"
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
                        onClick={ensureGenerated}
                    >
                        <Wand2 className="mr-2 h-4 w-4" />
                        生成电影感提示词
                    </Button>

                    {generated && result ? (
                        <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
                            <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">
                                    画面理解
                                </div>
                                <p className="text-sm leading-6">{result.interpretation}</p>
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">
                                    可直接用于生图的提示词
                                </div>
                                <Textarea
                                    readOnly
                                    value={combinedPrompt}
                                    className="min-h-44 resize-y bg-background font-mono text-xs leading-5"
                                />
                            </div>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" onClick={copyPrompt}>
                            <Copy className="mr-2 h-4 w-4" />
                            复制
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!canApply}
                            onClick={applyToSelected}
                            title={
                                canApply
                                    ? "覆盖当前生图节点的提示词和比例"
                                    : "请先在画布中选中一个生图节点"
                            }
                        >
                            <Wand2 className="mr-2 h-4 w-4" />
                            应用到选中节点
                        </Button>
                        <Button type="button" onClick={createNode}>
                            <Plus className="mr-2 h-4 w-4" />
                            新建生图节点
                        </Button>
                    </div>

                    <p className="border-t pt-3 text-[11px] leading-5 text-muted-foreground">
                        本工具为独立实现，方法灵感来自{" "}
                        <a
                            href="https://github.com/popopo-99/zy-cinematic-realism"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                        >
                            zy-cinematic-realism
                            <ExternalLink className="h-3 w-3" />
                        </a>
                        ，未复制其受 CC BY-NC 4.0 限制的提示词正文。
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ToolSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Record<string, { zh: string; en: string }>;
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {Object.entries(options).map(([key, option]) => (
                        <SelectItem key={key} value={key}>
                            {option.zh}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

