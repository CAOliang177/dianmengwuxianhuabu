"use client";

import {
    Aperture,
    Check,
    Clapperboard,
    Copy,
    LibraryBig,
    Palette,
    Plus,
    Search,
    Sparkles,
    Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    IMAGE_ASPECT_RATIOS,
    VIDEO_ASPECT_RATIOS,
} from "@/constants/media-options";
import { useFlow } from "@/hooks/use-flow";
import {
    buildCreativeSkillPrompt,
    CREATIVE_SKILLS,
    type CreativeSkill,
    type CreativeSkillKind,
    type CreativeSkillTarget,
} from "@/lib/creative-skills";
import { cn } from "@/lib/utils";

interface CreativeSkillLibraryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateNode: (node: {
        type: string;
        data: Record<string, unknown>;
    }) => void;
}

type SkillFilter = "all" | CreativeSkillTarget | CreativeSkillKind;

const FILTERS: Array<{ value: SkillFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "optimizer", label: "提示优化" },
    { value: "style", label: "风格化" },
];

const COVER_THEMES = [
    {
        background:
            "linear-gradient(135deg, #4338ca 0%, #7c3aed 42%, #f97316 100%)",
        glow: "rgba(251,146,60,.72)",
    },
    {
        background:
            "linear-gradient(135deg, #0f172a 0%, #0369a1 48%, #22d3ee 100%)",
        glow: "rgba(34,211,238,.7)",
    },
    {
        background:
            "linear-gradient(135deg, #3f0d2b 0%, #be185d 48%, #fb7185 100%)",
        glow: "rgba(251,113,133,.7)",
    },
    {
        background:
            "linear-gradient(135deg, #052e16 0%, #15803d 46%, #facc15 100%)",
        glow: "rgba(250,204,21,.65)",
    },
    {
        background:
            "linear-gradient(135deg, #18181b 0%, #52525b 48%, #d4d4d8 100%)",
        glow: "rgba(244,244,245,.55)",
    },
    {
        background:
            "linear-gradient(135deg, #172554 0%, #1d4ed8 46%, #f0abfc 100%)",
        glow: "rgba(240,171,252,.7)",
    },
] as const;

function skillHash(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function SkillCover({
    skill,
    active,
}: {
    skill: CreativeSkill;
    active: boolean;
}) {
    const hash = skillHash(skill.id);
    const theme = COVER_THEMES[hash % COVER_THEMES.length];
    const coverImage =
        skill.coverImage ??
        (hash % 2 === 0
            ? "/skill-covers/cinematic-director.png"
            : "/skill-covers/style-lab.png");
    const icon =
        skill.target === "video" ? (
            <Clapperboard className="h-6 w-6" />
        ) : skill.kind === "style" ? (
            <Palette className="h-6 w-6" />
        ) : (
            <Aperture className="h-6 w-6" />
        );

    return (
        <div
            className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/10"
            style={{ background: theme.background }}
        >
            <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.04]"
                style={{ backgroundImage: `url("${coverImage}")` }}
            />
            <div
                className="absolute inset-0 opacity-35 mix-blend-color"
                style={{ background: theme.background }}
            />
            <div
                className="absolute -right-8 -top-12 h-36 w-36 rounded-full blur-2xl"
                style={{ backgroundColor: theme.glow }}
            />
            <div className="absolute -bottom-16 -left-8 h-36 w-48 rotate-12 rounded-[48%] border border-white/30 bg-black/20 backdrop-blur-sm" />
            <div
                className="absolute inset-0 opacity-25"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                    maskImage:
                        "linear-gradient(to bottom right, black, transparent 72%)",
                }}
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 to-transparent" />
            <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/25 bg-black/25 text-white shadow-xl backdrop-blur-md">
                    {icon}
                </span>
                <span className="rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur-md">
                    {skill.target === "image" ? "图片 Skill" : "视频 Skill"}
                </span>
            </div>
            <div className="absolute inset-x-3 bottom-3">
                <div className="line-clamp-1 text-base font-semibold tracking-tight text-white drop-shadow">
                    {skill.shortName}
                </div>
                <div className="mt-0.5 line-clamp-1 text-[10px] text-white/70">
                    {skill.tags.slice(0, 3).join(" · ")}
                </div>
            </div>
            {active ? (
                <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg">
                    <Check className="h-4 w-4" />
                </span>
            ) : null}
        </div>
    );
}

function skillTargetForNode(
    nodeType?: string | null,
): CreativeSkillTarget | null {
    if (nodeType === "textGenImageNode") return "image";
    if (nodeType === "textGenVideoNode" || nodeType === "imageGenVideoNode") {
        return "video";
    }
    return null;
}

function ratioData(skill: CreativeSkill): Record<string, unknown> {
    const ratios =
        skill.target === "image" ? IMAGE_ASPECT_RATIOS : VIDEO_ASPECT_RATIOS;
    const ratio =
        ratios.find((item) => item.value === skill.defaultAspectRatio) ??
        ratios[0];
    if (!ratio) return {};
    return {
        width: ratio.width,
        height: ratio.height,
        ...(skill.target === "image"
            ? {
                  outputResolutionTier: "1k",
                  followReferenceRatio: false,
              }
            : { duration: skill.defaultDuration ?? 8 }),
    };
}

export function CreativeSkillLibrary({
    open,
    onOpenChange,
    onCreateNode,
}: CreativeSkillLibraryProps) {
    const [filter, setFilter] = useState<SkillFilter>("all");
    const [query, setQuery] = useState("");
    const [selectedSkillId, setSelectedSkillId] = useState(
        CREATIVE_SKILLS[0]?.id ?? "",
    );
    const [brief, setBrief] = useState("");
    const [generatedPrompt, setGeneratedPrompt] = useState("");

    const selectedNode = useFlow((state) =>
        state.selectedNodes.length === 1 ? state.selectedNodes[0] : null,
    );

    const filteredSkills = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return CREATIVE_SKILLS.filter((skill) => {
            const matchesFilter =
                filter === "all" ||
                skill.target === filter ||
                skill.kind === filter;
            if (!matchesFilter) return false;
            if (!needle) return true;
            return [
                skill.name,
                skill.shortName,
                skill.description,
                ...skill.tags,
            ]
                .join(" ")
                .toLocaleLowerCase()
                .includes(needle);
        });
    }, [filter, query]);

    const selectedSkill =
        filteredSkills.find((skill) => skill.id === selectedSkillId) ??
        filteredSkills[0];

    const selectedNodeTarget = skillTargetForNode(selectedNode?.type);
    const canApply =
        Boolean(selectedSkill) && selectedNodeTarget === selectedSkill?.target;

    const selectSkill = (skill: CreativeSkill) => {
        setSelectedSkillId(skill.id);
        setGeneratedPrompt("");
    };

    const ensurePrompt = () => {
        if (!selectedSkill) {
            toast.error("请先选择一个 Skill");
            return "";
        }
        if (!brief.trim()) {
            toast.error("请先输入画面或视频想法");
            return "";
        }
        const next = buildCreativeSkillPrompt(selectedSkill.id, brief);
        setGeneratedPrompt(next);
        return next;
    };

    const promptForAction = () => generatedPrompt.trim() || ensurePrompt();

    const applyToSelected = () => {
        const prompt = promptForAction();
        if (!prompt || !selectedSkill || !selectedNode || !canApply) return;
        useFlow.getState().updates(selectedNode.id, {
            ...(selectedNode.data as Record<string, unknown>),
            text: prompt,
            creativeSkillId: selectedSkill.id,
            creativeSkillName: selectedSkill.name,
        });
        toast.success(`已将“${selectedSkill.name}”应用到当前节点`, {
            duration: 2000,
        });
        onOpenChange(false);
    };

    const createNode = () => {
        const prompt = promptForAction();
        if (!prompt || !selectedSkill) return;
        const commonData = {
            text: prompt,
            creativeSkillId: selectedSkill.id,
            creativeSkillName: selectedSkill.name,
            ...ratioData(selectedSkill),
        };
        onCreateNode(
            selectedSkill.target === "image"
                ? {
                      type: "textGenImageNode",
                      data: {
                          pluginId: "tongflow-api-banana-relay",
                          ...commonData,
                      },
                  }
                : {
                      type: "textGenVideoNode",
                      data: commonData,
                  },
        );
        toast.success(`已新建“${selectedSkill.name}”节点`, {
            duration: 2000,
        });
        onOpenChange(false);
    };

    const copyPrompt = async () => {
        const prompt = promptForAction();
        if (!prompt) return;
        await navigator.clipboard.writeText(prompt);
        toast.success("提示词已复制", { duration: 2000 });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton
                className="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden border-zinc-700 bg-zinc-950 p-0 text-zinc-100 sm:!max-w-[1360px]"
            >
                <DialogHeader className="border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,.18),transparent_38%)] px-6 py-5">
                    <DialogTitle className="flex items-center gap-3 text-xl tracking-tight">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 text-white shadow-lg shadow-fuchsia-950/40">
                            <LibraryBig className="h-5 w-5" />
                        </span>
                        <span>
                            <span className="block">创作 Skill 市场</span>
                            <span className="mt-0.5 block text-[11px] font-normal tracking-normal text-zinc-500">
                                一句话生成专业提示词，直接用于当前画布
                            </span>
                        </span>
                        <Badge
                            variant="secondary"
                            className="ml-1 border border-white/10 bg-white/10 text-zinc-300"
                        >
                            {CREATIVE_SKILLS.length} 个
                        </Badge>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        选择图片或视频创作 Skill，生成提示词后应用到节点。
                    </DialogDescription>
                </DialogHeader>

                <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(390px,0.8fr)]">
                    <section className="flex min-h-0 flex-col border-b border-white/10 bg-zinc-900/45 lg:border-b-0 lg:border-r">
                        <div className="space-y-3 border-b border-white/10 bg-black/10 p-4">
                            <div className="flex items-center gap-3">
                                <div className="relative min-w-0 flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                    <Input
                                        value={query}
                                        onChange={(event) =>
                                            setQuery(event.target.value)
                                        }
                                        placeholder="搜索 Skill、风格或用途"
                                        className="border-white/10 bg-black/25 pl-9 text-zinc-100 placeholder:text-zinc-600"
                                    />
                                </div>
                                <span className="hidden shrink-0 text-xs text-zinc-600 sm:inline">
                                    找到 {filteredSkills.length} 个
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {FILTERS.map((item) => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className={cn(
                                            "rounded-full border px-3 py-1.5 text-xs transition-all duration-200",
                                            filter === item.value
                                                ? "border-white/30 bg-white text-zinc-950 shadow-sm"
                                                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:bg-white/[0.07] hover:text-white",
                                        )}
                                        onClick={() => setFilter(item.value)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {filteredSkills.map((skill) => {
                                    const active =
                                        selectedSkill?.id === skill.id;
                                    return (
                                        <button
                                            key={skill.id}
                                            type="button"
                                            className={cn(
                                                "group min-w-0 overflow-hidden rounded-2xl border text-left transition-all duration-200",
                                                active
                                                    ? "border-violet-400/80 bg-violet-500/10 shadow-xl shadow-violet-950/30 ring-1 ring-violet-400/25"
                                                    : "border-white/10 bg-zinc-950/70 hover:-translate-y-0.5 hover:border-white/30 hover:shadow-xl hover:shadow-black/30",
                                            )}
                                            onClick={() => selectSkill(skill)}
                                        >
                                            <SkillCover
                                                skill={skill}
                                                active={active}
                                            />
                                            <div className="p-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="line-clamp-1 text-sm font-semibold text-zinc-100">
                                                        {skill.name}
                                                    </span>
                                                    <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-zinc-500">
                                                        {
                                                            skill.defaultAspectRatio
                                                        }
                                                    </span>
                                                </div>
                                                <p className="mt-1 line-clamp-2 min-h-9 text-[11px] leading-[18px] text-zinc-500">
                                                    {skill.description}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {filteredSkills.length === 0 ? (
                                <div className="flex min-h-40 items-center justify-center text-sm text-zinc-600">
                                    没有找到匹配的 Skill
                                </div>
                            ) : null}
                        </div>
                    </section>

                    <section className="min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_80%_0%,rgba(236,72,153,.08),transparent_36%)] p-5 sm:p-6">
                        {selectedSkill ? (
                            <div className="mx-auto max-w-2xl space-y-5">
                                <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent">
                                    <SkillCover
                                        skill={selectedSkill}
                                        active={false}
                                    />
                                    <div className="flex items-start justify-between gap-4 p-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {selectedSkill.kind ===
                                                "style" ? (
                                                    <Palette className="h-5 w-5 shrink-0 text-fuchsia-300" />
                                                ) : (
                                                    <Sparkles className="h-5 w-5 shrink-0 text-violet-300" />
                                                )}
                                                <h3 className="truncate text-lg font-semibold">
                                                    {selectedSkill.name}
                                                </h3>
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-zinc-400">
                                                {selectedSkill.description}
                                            </p>
                                        </div>
                                        <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-right">
                                            <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                                                默认
                                            </div>
                                            <div className="mt-0.5 text-xs text-zinc-300">
                                                {selectedSkill.target ===
                                                "image"
                                                    ? "图片"
                                                    : "视频"}{" "}
                                                ·{" "}
                                                {
                                                    selectedSkill.defaultAspectRatio
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="skill-brief">
                                        你的创作想法
                                    </Label>
                                    <Textarea
                                        id="skill-brief"
                                        value={brief}
                                        onChange={(event) => {
                                            setBrief(event.target.value);
                                            setGeneratedPrompt("");
                                        }}
                                        className="min-h-28 resize-y border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                                        placeholder={
                                            selectedSkill.target === "image"
                                                ? "例如：雨夜的旧餐馆门口，一名厨师捏着一封没有拆开的信"
                                                : "例如：女孩站在海边回头，风吹动头发，镜头缓慢靠近"
                                        }
                                    />
                                </div>

                                <Button
                                    type="button"
                                    className="w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-orange-500 text-white hover:brightness-110"
                                    onClick={ensurePrompt}
                                >
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    生成可用提示词
                                </Button>

                                {generatedPrompt ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="skill-output">
                                                生成结果
                                            </Label>
                                            <span className="text-xs text-zinc-600">
                                                可继续手动修改
                                            </span>
                                        </div>
                                        <Textarea
                                            id="skill-output"
                                            value={generatedPrompt}
                                            onChange={(event) =>
                                                setGeneratedPrompt(
                                                    event.target.value,
                                                )
                                            }
                                            className="min-h-56 resize-y border-white/10 bg-black/30 font-mono text-xs leading-6 text-zinc-200"
                                        />
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 px-5 py-8 text-center text-sm text-zinc-600">
                                        输入想法后点击生成，这里会出现可直接用于节点的提示词。
                                    </div>
                                )}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/10"
                                        onClick={copyPrompt}
                                    >
                                        <Copy className="mr-2 h-4 w-4" />
                                        复制
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!canApply}
                                        className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/10 disabled:text-zinc-600"
                                        onClick={applyToSelected}
                                        title={
                                            canApply
                                                ? "只替换当前节点的提示词，保留模型和比例设置"
                                                : selectedSkill.target ===
                                                    "image"
                                                  ? "请先选中一个文生图/图生图节点"
                                                  : "请先选中一个文生视频/图生视频节点"
                                        }
                                    >
                                        <Wand2 className="mr-2 h-4 w-4" />
                                        应用到选中节点
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={createNode}
                                        className="bg-zinc-100 text-zinc-950 hover:bg-white"
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        新建
                                        {selectedSkill.target === "image"
                                            ? "生图"
                                            : "视频"}
                                        节点
                                    </Button>
                                </div>

                                <p className="text-[11px] leading-5 text-zinc-600">
                                    功能依据公开的 Skill
                                    能力描述筛选，内部提示模板为独立编写；运行时使用画布中已配置的模型和
                                    API，不需要登录第三方平台。
                                </p>
                            </div>
                        ) : null}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
