"use client";

import {
    ArrowRight,
    Clock3,
    Layers3,
    Pencil,
    Plus,
    Sparkles,
    WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { UpdateButton } from "@/components/workspace/update-button";
import {
    type CanvasHistoryItem,
    createCanvas,
    getCanvasHistory,
    hydrateCanvasHistoryFromDisk,
    renameCanvas,
    setActiveCanvasId,
} from "@/lib/canvas-history";
import { getFileUrl } from "@/lib/file/url";

const LETTER_COLORS = [
    "#72a7ff",
    "#9d8cff",
    "#63e6be",
    "#ffd38a",
    "#ff8fb3",
    "#89ddff",
];
const RELEASE_VERSION = "0.1.35";
const RELEASE_NOTICE_KEY = `dianmeng-release-notice:${RELEASE_VERSION}`;

function InteractiveTitle({ text }: { text: string }) {
    return (
        <span>
            <span className="sr-only">{text}</span>
            {Array.from(text).map((letter, index) => (
                <span
                    key={`${letter}-${index}`}
                    aria-hidden="true"
                    className="home-title-letter"
                    style={
                        {
                            "--letter-color":
                                LETTER_COLORS[index % LETTER_COLORS.length],
                        } as CSSProperties
                    }
                >
                    {letter}
                </span>
            ))}
        </span>
    );
}

export default function Home() {
    const router = useRouter();
    const [history, setHistory] = useState<CanvasHistoryItem[]>([]);
    const [renameTarget, setRenameTarget] = useState<CanvasHistoryItem | null>(
        null,
    );
    const [renameValue, setRenameValue] = useState("");
    const [releaseNoticeOpen, setReleaseNoticeOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setHistory(getCanvasHistory());
        const refreshHistory = async () => {
            for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
                const items = await hydrateCanvasHistoryFromDisk();
                if (cancelled) return;
                if (items.length > 0 || attempt === 3) {
                    setHistory(items);
                    return;
                }
                await new Promise((resolve) =>
                    window.setTimeout(resolve, 500 * (attempt + 1)),
                );
            }
        };
        const handleFocus = () => void refreshHistory();
        void refreshHistory();
        window.addEventListener("focus", handleFocus);
        return () => {
            cancelled = true;
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    useEffect(() => {
        if (window.localStorage.getItem(RELEASE_NOTICE_KEY) !== "seen") {
            setReleaseNoticeOpen(true);
        }
    }, []);

    const closeReleaseNotice = () => {
        window.localStorage.setItem(RELEASE_NOTICE_KEY, "seen");
        setReleaseNoticeOpen(false);
    };

    const openCanvas = (id: string) => {
        setActiveCanvasId(id);
        router.push(`/workspace?canvas=${encodeURIComponent(id)}`);
    };

    const newCanvas = () => openCanvas(createCanvas());

    const beginRenameCanvas = (
        event: React.MouseEvent,
        canvas: CanvasHistoryItem,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        setRenameTarget(canvas);
        setRenameValue(canvas.name);
    };

    const submitRenameCanvas = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (renameTarget && renameCanvas(renameTarget.id, renameValue)) {
            setHistory(getCanvasHistory());
            setRenameTarget(null);
        }
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-[#060914] text-white">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(68,98,222,.22),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(255,184,91,.12),transparent_27%),radial-gradient(circle_at_55%_80%,rgba(92,61,185,.1),transparent_35%),linear-gradient(180deg,#0a1020_0%,#060914_62%,#080b14_100%)]" />
            <div className="pointer-events-none fixed inset-0 opacity-[.22] [background-image:linear-gradient(rgba(148,163,184,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.07)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
            <div className="home-orb pointer-events-none fixed left-[8%] top-[18%] h-52 w-52 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="home-orb home-orb-delay pointer-events-none fixed right-[8%] top-[10%] h-44 w-44 rounded-full bg-amber-300/10 blur-3xl" />

            <div className="relative mx-auto max-w-[1380px] px-5 pb-12 pt-5 sm:px-8 lg:px-10">
                <header className="flex items-center justify-between rounded-2xl border border-white/[.08] bg-white/[.035] px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,.18)] backdrop-blur-xl sm:px-5">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute -inset-2 rounded-2xl bg-blue-500/20 blur-xl" />
                            <img
                                src="/dianmeng-brand.png"
                                alt="dianmeng"
                                className="relative h-11 w-11 rounded-xl border border-white/10 object-cover"
                            />
                        </div>
                        <div className="leading-tight">
                            <div className="text-base font-semibold tracking-[.08em] sm:text-lg">
                                <span className="bg-gradient-to-r from-white via-blue-100 to-amber-100 bg-clip-text text-transparent">
                                    dianmeng
                                </span>
                                <span className="ml-1 text-white/90">
                                    无限画布
                                </span>
                            </div>
                            <div className="mt-1 text-[11px] tracking-[.26em] text-slate-500">
                                AI CREATIVE CANVAS
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <UpdateButton className="h-10 w-10 rounded-xl border border-white/10 bg-white/[.07] text-slate-200 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-300/30 hover:bg-white/[.12] hover:text-white" />
                        <button
                            type="button"
                            onClick={newCanvas}
                            className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.07] px-4 py-2.5 text-sm font-medium text-white/90 transition duration-300 hover:-translate-y-0.5 hover:border-blue-300/30 hover:bg-white/[.12]"
                        >
                            <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />{" "}
                            新建画布
                        </button>
                    </div>
                </header>

                <section className="grid min-h-[520px] items-center gap-8 py-10 lg:grid-cols-[1.12fr_.72fr] lg:gap-14 lg:py-12">
                    <div className="max-w-[760px]">
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-400/[.08] px-3 py-1.5 text-sm text-blue-100 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
                            <Sparkles className="h-4 w-4 text-amber-200" />{" "}
                            灵感、模型与画布，在这里自然连接
                        </div>
                        <p className="mb-3 text-sm font-medium uppercase tracking-[.32em] text-slate-500">
                            Create beyond the frame
                        </p>
                        <h1 className="text-[clamp(3rem,5.2vw,5.3rem)] font-semibold leading-[.98] tracking-[-.055em]">
                            <span className="block text-white/95">
                                <InteractiveTitle text="让灵感在" />
                            </span>
                            <span className="mt-2 block bg-gradient-to-r from-[#76a5ff] via-[#b8b9ff] to-[#ffd08b] bg-clip-text text-transparent">
                                <InteractiveTitle text="无限画布中生长" />
                            </span>
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                            从一句提示词到一组视觉叙事，把文生图、参考图与节点连接放进同一片创作空间。
                            <span className="text-slate-500">
                                {" "}
                                不打断灵感，也不限制边界。
                            </span>
                        </p>

                        <div className="mt-7 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={newCanvas}
                                className="home-primary-button group flex items-center gap-3 rounded-2xl px-6 py-3.5 text-base font-semibold"
                            >
                                <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
                                新建空白画布
                                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                            </button>
                            <div className="flex items-center gap-2 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-sm text-slate-400">
                                <Layers3 className="h-4 w-4 text-blue-300" />{" "}
                                节点连接
                                <span className="h-3 w-px bg-white/10" />
                                <WandSparkles className="h-4 w-4 text-amber-200" />{" "}
                                多模型生成
                            </div>
                        </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-[410px]">
                        <div className="absolute inset-[12%] rounded-full bg-gradient-to-br from-blue-500/25 via-violet-500/10 to-amber-300/15 blur-3xl" />
                        <div className="home-visual-card relative aspect-[.94] overflow-hidden rounded-[36px] border border-white/10 bg-white/[.035] p-5 shadow-[0_35px_90px_rgba(0,0,0,.42)] backdrop-blur-xl">
                            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-200/60 to-transparent" />
                            <div className="relative h-full overflow-hidden rounded-[28px] border border-white/[.08] bg-[#090f20]/85 p-7">
                                <img
                                    src="/dianmeng-brand.png"
                                    alt="dianmeng AI 无限画布"
                                    className="h-full w-full rounded-2xl object-cover opacity-95 transition duration-700 hover:scale-[1.025]"
                                />
                                <div className="absolute left-3 top-1/4 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-[0_0_0_6px_rgba(59,130,246,.18)]" />
                                <div className="absolute right-3 top-[58%] h-3 w-3 rounded-full border-2 border-white bg-amber-400 shadow-[0_0_0_6px_rgba(245,158,11,.18)]" />
                            </div>
                            <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />{" "}
                                创意引擎已就绪
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-[28px] border border-white/[.07] bg-white/[.025] p-5 shadow-[0_28px_70px_rgba(0,0,0,.2)] backdrop-blur-sm sm:p-6">
                    <div className="mb-5 flex items-end justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-400/10 text-blue-200">
                                    <Clock3 className="h-4 w-4" />
                                </span>
                                继续你的创作
                            </div>
                            <p className="mt-2 text-sm text-slate-500">
                                历史画布会自动保存，点击卡片即可从上次的位置继续
                            </p>
                        </div>
                        <span className="rounded-full border border-white/[.07] bg-white/[.035] px-3 py-1 text-xs text-slate-500">
                            {history.length} 个画布
                        </span>
                    </div>

                    {history.length === 0 ? (
                        <button
                            type="button"
                            onClick={newCanvas}
                            className="home-shine group flex min-h-44 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[.02] text-slate-400 transition hover:border-blue-400/40 hover:bg-blue-400/[.04]"
                        >
                            <Plus className="mb-3 h-8 w-8 text-blue-300 transition duration-300 group-hover:rotate-90 group-hover:scale-110" />
                            <span className="font-medium text-slate-200">
                                创建你的第一个画布
                            </span>
                            <span className="mt-1 text-sm">
                                从空白开始，连接属于你的灵感网络
                            </span>
                        </button>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {history.map((canvas) => (
                                <div
                                    key={canvas.id}
                                    className="home-shine group relative overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.035] text-left transition duration-300 hover:-translate-y-1 hover:border-blue-300/30 hover:bg-white/[.065] hover:shadow-[0_22px_55px_rgba(0,0,0,.3)]"
                                >
                                    <button
                                        type="button"
                                        onClick={() => openCanvas(canvas.id)}
                                        className="w-full text-left"
                                    >
                                        <div className="relative h-32 overflow-hidden bg-[radial-gradient(circle_at_25%_30%,rgba(92,128,255,.32),transparent_26%),linear-gradient(135deg,#111a34,#0b1020)]">
                                            <div className="absolute left-[16%] top-[25%] h-12 w-24 rounded-xl border border-blue-300/25 bg-blue-300/10 transition duration-500 group-hover:-translate-y-1" />
                                            <div className="absolute right-[14%] top-[43%] h-12 w-24 rounded-xl border border-amber-200/20 bg-amber-200/10 transition duration-500 group-hover:translate-y-1" />
                                            <svg
                                                className="absolute inset-0 h-full w-full"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    d="M120 58 C172 58, 188 78, 238 78"
                                                    fill="none"
                                                    stroke="rgba(171,188,255,.55)"
                                                    strokeWidth="2"
                                                    strokeDasharray="5 5"
                                                />
                                            </svg>
                                            {canvas.coverFileKey ? (
                                                <>
                                                    <img
                                                        src={getFileUrl(
                                                            canvas.coverFileKey.replace(
                                                                /\\/g,
                                                                "/",
                                                            ),
                                                        )}
                                                        alt={`${canvas.name || "未命名画布"}封面`}
                                                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                                                        onError={(event) => {
                                                            event.currentTarget.style.display =
                                                                "none";
                                                        }}
                                                    />
                                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
                                                </>
                                            ) : null}
                                            <div className="absolute bottom-3 right-3 rounded-full bg-black/40 px-2.5 py-1 text-xs text-slate-300 backdrop-blur">
                                                {canvas.nodeCount} 个节点
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <div className="truncate font-medium text-slate-100 transition group-hover:text-blue-200">
                                                {canvas.name || "未命名画布"}
                                            </div>
                                            <div className="mt-2 text-xs text-slate-500">
                                                最后编辑{" "}
                                                {new Date(
                                                    canvas.updatedAt,
                                                ).toLocaleString("zh-CN")}
                                            </div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        title="重命名画布"
                                        aria-label={`重命名 ${canvas.name || "未命名画布"}`}
                                        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/45 text-slate-200 opacity-0 shadow-lg backdrop-blur transition hover:bg-blue-500 hover:text-white group-hover:opacity-100 focus:opacity-100"
                                        onClick={(event) =>
                                            beginRenameCanvas(event, canvas)
                                        }
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <Dialog
                open={releaseNoticeOpen}
                onOpenChange={(open) => {
                    if (!open) closeReleaseNotice();
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto border-white/15 bg-[#0c1325] p-0 text-white sm:max-w-2xl">
                    <div className="relative border-b border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,.28),transparent_40%),radial-gradient(circle_at_88%_10%,rgba(245,158,11,.15),transparent_36%)] px-7 pb-6 pt-7">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-100">
                            <Sparkles className="h-3.5 w-3.5" />
                            dianmeng 无限画布 v{RELEASE_VERSION}
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-semibold text-white">
                                创作 Skill 市场上线，图片生成控制更准确
                            </DialogTitle>
                            <DialogDescription className="mt-2 text-sm leading-6 text-slate-300">
                                0.1.35 新增 48 个图片与视频创作
                                Skill，并修复文生图、图生图比例及模型选择问题。
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="space-y-3 px-7 py-6 text-sm text-slate-200">
                        <div className="rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-500/10 via-blue-500/5 to-amber-400/10 p-4">
                            <div className="flex items-center gap-2 font-semibold text-white">
                                <WandSparkles className="h-4 w-4 text-violet-300" />
                                新功能：创作 Skill 市场
                            </div>
                            <p className="mt-2 leading-6 text-slate-300">
                                打开画布后，点击底部工具栏的“创作
                                Skill”，输入一句简单想法，即可得到结构完整的专业提示词。
                                生成后可直接应用到当前节点、新建生图/视频节点，或复制提示词使用。
                            </p>
                        </div>
                        {[
                            "48 个 Skill 分为图片、视频、提示优化和风格化四类，支持搜索与筛选，并配有直观封面。",
                            "提示词优化会自动补全主体、动作、镜头、构图、光线、材质和生成约束，让简单描述更容易稳定出图。",
                            "内置电影感画面、商品广告、角色与场景设定、图生视频、专业分镜、动作戏、运镜与连续性等实用导演工具。",
                            "提供复古胶片、东方美术、粗野主义科幻、3D 动画、末日写实、高奢 TVC 等多种风格方案。",
                            "使用 Skill 新建节点时会带入建议比例；视频类还会带入建议时长，也可以在节点中继续修改。",
                            "修复文生图和图生图比例：节点参数优先传给接口，并补齐新渠道 Gemini 中转专用比例协议，不再固定生成 1:1。",
                            "模型改为横向选择；img-relay 已彻底移除独立模型 gpt-image-2，仅保留 gpt-image-2-1k、2k、4k。",
                        ].map((item, index) => (
                            <div
                                key={item}
                                className="flex gap-3 rounded-xl border border-white/[.07] bg-white/[.035] px-4 py-3"
                            >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-semibold text-blue-200">
                                    {index + 1}
                                </span>
                                <span className="leading-6">{item}</span>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={closeReleaseNotice}
                            className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3 font-medium text-white shadow-lg shadow-blue-950/30 transition hover:brightness-110"
                        >
                            我知道了，开始创作
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={renameTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setRenameTarget(null);
                }}
            >
                <DialogContent className="border-white/15 bg-[#11182a] text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>重命名画布</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            输入新的画布名称，保存后会同步到历史画布。
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitRenameCanvas}>
                        <input
                            autoFocus
                            maxLength={80}
                            value={renameValue}
                            onChange={(event) =>
                                setRenameValue(event.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white outline-none transition focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20"
                            placeholder="请输入画布名称"
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setRenameTarget(null)}
                                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={!renameValue.trim()}
                                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                保存
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </main>
    );
}
