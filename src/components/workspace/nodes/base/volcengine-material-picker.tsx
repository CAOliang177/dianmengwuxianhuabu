"use client";

import {
    ArrowLeft,
    FileAudio,
    FileVideo,
    FolderOpen,
    Image as ImageIcon,
    LayoutGrid,
    List,
    Loader2,
    Plus,
    RefreshCw,
    UploadCloud,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
    type MaterialKind,
    normalizeVolcengineMaterial,
    parseVolcengineMaterials,
    type VolcengineMaterial,
} from "@/lib/volcengine-material";

export type { VolcengineMaterial } from "@/lib/volcengine-material";
export { parseVolcengineMaterials } from "@/lib/volcengine-material";

type MaterialPickerProps = {
    value?: string;
    onChange: (value: string) => void;
    occupied?: Partial<Record<MaterialKind, number>>;
    limits?: VolcengineMaterialLimits;
    compact?: boolean;
    allowedTypes?: MaterialKind[];
    maxSelected?: number;
};

export type VolcengineMaterialLimits = {
    image: number;
    video: number;
    audio: number;
    total?: number;
};

const SEEDANCE_25_LIMITS: VolcengineMaterialLimits = {
    image: 30,
    video: 10,
    audio: 10,
    total: 50,
};

const SEEDANCE_20_LIMITS: VolcengineMaterialLimits = {
    image: 9,
    video: 3,
    audio: 3,
};

const ALL_ASSETS_SCOPE = "__all_assets__";

export function volcengineMaterialLimitsForModel(
    model?: string,
): VolcengineMaterialLimits {
    const normalized = (model || "").trim().toLowerCase();
    return normalized.includes("2-5") || normalized.includes("2.5")
        ? SEEDANCE_25_LIMITS
        : SEEDANCE_20_LIMITS;
}

type ApiListResponse = {
    items?: unknown[];
    error?: string;
};

type ApiUploadResponse = {
    item?: unknown;
    ready?: boolean;
    message?: string;
    error?: string;
};

function serializeSelected(items: VolcengineMaterial[]): string {
    return items.length ? JSON.stringify(items, null, 0) : "";
}

function previewNeedsRefresh(item: VolcengineMaterial): boolean {
    if (!item.groupId) return false;
    if (!item.url) return true;
    try {
        const url = new URL(item.url);
        const rawDate = url.searchParams.get("X-Tos-Date");
        const rawExpires = url.searchParams.get("X-Tos-Expires");
        if (!rawDate || !rawExpires) return false;
        const match = rawDate.match(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        );
        if (!match) return false;
        const issuedAt = Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6]),
        );
        const expiresAt = issuedAt + Number(rawExpires) * 1000;
        return Date.now() + 5 * 60 * 1000 >= expiresAt;
    } catch {
        return false;
    }
}

export function validateSeedance25Materials(
    items: VolcengineMaterial[],
    occupied: Partial<Record<MaterialKind, number>> = {},
): string | null {
    return validateVolcengineMaterials(items, occupied, SEEDANCE_25_LIMITS);
}

export function validateVolcengineMaterials(
    items: VolcengineMaterial[],
    occupied: Partial<Record<MaterialKind, number>> = {},
    limits: VolcengineMaterialLimits = SEEDANCE_25_LIMITS,
): string | null {
    const counts: Record<MaterialKind, number> = {
        image: occupied.image ?? 0,
        video: occupied.video ?? 0,
        audio: occupied.audio ?? 0,
    };
    for (const item of items) counts[item.type] += 1;
    if (counts.image > limits.image)
        return `当前火山模型最多支持 ${limits.image} 张图片，当前共 ${counts.image} 张`;
    if (counts.video > limits.video)
        return `当前火山模型最多支持 ${limits.video} 个视频，当前共 ${counts.video} 个`;
    if (counts.audio > limits.audio)
        return `当前火山模型最多支持 ${limits.audio} 段音频，当前共 ${counts.audio} 段`;
    const occupiedTotal = Object.values(occupied).reduce(
        (total, count) => total + (count ?? 0),
        0,
    );
    if (limits.total && occupiedTotal + items.length > limits.total)
        return `当前火山模型单次最多支持 ${limits.total} 个参考素材，当前共 ${occupiedTotal + items.length} 个`;
    return null;
}

function iconFor(type: MaterialKind) {
    if (type === "video") return FileVideo;
    if (type === "audio") return FileAudio;
    return ImageIcon;
}

export function materialReferenceLabels(
    items: VolcengineMaterial[],
    offsets: Partial<Record<MaterialKind, number>> = {},
): string[] {
    const counters: Record<MaterialKind, number> = {
        image: offsets.image ?? 0,
        video: offsets.video ?? 0,
        audio: offsets.audio ?? 0,
    };
    return items.map((item) => {
        counters[item.type] += 1;
        const label =
            item.type === "image"
                ? "图片"
                : item.type === "video"
                  ? "视频"
                  : "音频";
        return `@${label}${counters[item.type]}`;
    });
}

export function VolcengineMaterialPicker({
    value,
    onChange,
    occupied = {},
    limits = SEEDANCE_25_LIMITS,
    compact = false,
    allowedTypes,
    maxSelected,
}: MaterialPickerProps) {
    const selected = useMemo(() => parseVolcengineMaterials(value), [value]);
    const selectedLabels = useMemo(
        () => materialReferenceLabels(selected),
        [selected],
    );
    const [manualText, setManualText] = useState("");
    const [open, setOpen] = useState(false);
    const [draftSelected, setDraftSelected] = useState<VolcengineMaterial[]>(
        [],
    );
    const [groups, setGroups] = useState<VolcengineMaterial[]>([]);
    const [assets, setAssets] = useState<VolcengineMaterial[]>([]);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [groupType, setGroupType] = useState("AIGC");
    const [assetKindFilter, setAssetKindFilter] = useState<
        MaterialKind | "all"
    >("all");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">("list");
    const [uploading, setUploading] = useState(false);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const draftSelectionError = validateVolcengineMaterials(
        draftSelected,
        occupied,
        limits,
    );

    useEffect(() => {
        setManualText(
            selected
                .map((item) =>
                    item.type === "image" ? item.id : `${item.type}:${item.id}`,
                )
                .join("\n"),
        );
    }, [selected]);

    useEffect(() => {
        const stale = selected.filter(previewNeedsRefresh);
        const groupIds = [
            ...new Set(
                stale
                    .map((item) => item.groupId)
                    .filter((id): id is string => !!id),
            ),
        ];
        if (groupIds.length === 0) return;
        let cancelled = false;
        void Promise.all(
            groupIds.map(async (nextGroupId) => {
                const groupType =
                    stale.find((item) => item.groupId === nextGroupId)
                        ?.groupType || "AIGC";
                const response = await apiGet<ApiListResponse>(
                    `/api/volcengine/materials?view=assets&groupId=${encodeURIComponent(nextGroupId)}&groupType=${encodeURIComponent(groupType)}`,
                    { showErrorToast: false },
                );
                return (response.items || [])
                    .map((item) =>
                        normalizeVolcengineMaterial(item, nextGroupId),
                    )
                    .filter((item): item is VolcengineMaterial => !!item)
                    .map((item) => ({ ...item, groupType }));
            }),
        )
            .then((groups) => {
                if (cancelled) return;
                const refreshed = new Map(
                    groups.flat().map((item) => [item.id, item]),
                );
                let changed = false;
                const next = selected.map((item) => {
                    const replacement = refreshed.get(item.id);
                    if (!replacement) return item;
                    changed = true;
                    return replacement;
                });
                if (changed) onChange(serializeSelected(next));
            })
            .catch(() => {
                // Keep the selected asset usable by ID if preview refresh fails.
            });
        return () => {
            cancelled = true;
        };
    }, [onChange, selected]);

    const loadGroups = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await apiGet<ApiListResponse>(
                "/api/volcengine/materials?view=groups",
                { showErrorToast: false },
            );
            setGroups(
                (response.items || [])
                    .map((item) => normalizeVolcengineMaterial(item))
                    .filter((item): item is VolcengineMaterial => !!item),
            );
            setGroupId(null);
            setGroupType("AIGC");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "素材库读取失败");
        } finally {
            setLoading(false);
        }
    };

    const loadAssets = async (
        nextGroupId: string,
        nextGroupType = "AIGC",
        nextKindFilter: MaterialKind | "all" = "all",
    ) => {
        setLoading(true);
        setError("");
        try {
            const scopeQuery =
                nextGroupId === ALL_ASSETS_SCOPE
                    ? "scope=all"
                    : `groupId=${encodeURIComponent(nextGroupId)}`;
            const response = await apiGet<ApiListResponse>(
                `/api/volcengine/materials?view=assets&${scopeQuery}&groupType=${encodeURIComponent(nextGroupType)}`,
                { showErrorToast: false },
            );
            setAssets(
                (response.items || [])
                    .map((item) =>
                        normalizeVolcengineMaterial(
                            item,
                            nextGroupId === ALL_ASSETS_SCOPE
                                ? undefined
                                : nextGroupId,
                        ),
                    )
                    .filter((item): item is VolcengineMaterial => !!item)
                    .map((item) => ({
                        ...item,
                        groupType: nextGroupType,
                    })),
            );
            setGroupId(nextGroupId);
            setGroupType(nextGroupType);
            setAssetKindFilter(nextKindFilter);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "素材读取失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && groups.length === 0) void loadGroups();
    }, [open, groups.length]);

    const filteredAssets = assets.filter(
        (asset) =>
            (!allowedTypes || allowedTypes.includes(asset.type)) &&
            (assetKindFilter === "all" || asset.type === assetKindFilter) &&
            `${asset.name || ""} ${asset.id}`
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
    );
    const filteredGroups = groups.filter((group) =>
        `${group.name || ""} ${group.id}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
    );

    const openPicker = () => {
        setDraftSelected(
            selected.filter(
                (item) => !allowedTypes || allowedTypes.includes(item.type),
            ),
        );
        setError("");
        setOpen(true);
    };

    const toggleAsset = (asset: VolcengineMaterial) => {
        const exists = draftSelected.some((item) => item.id === asset.id);
        if (exists) {
            setError("");
            setDraftSelected(
                draftSelected.filter((item) => item.id !== asset.id),
            );
            return;
        }
        const next = [...draftSelected, asset];
        if (maxSelected !== undefined && next.length > maxSelected) {
            setError(`当前模式最多选择 ${maxSelected} 个素材`);
            return;
        }
        const limitError = validateVolcengineMaterials(next, occupied, limits);
        if (limitError) {
            setError(limitError);
            return;
        }
        setError("");
        setDraftSelected(next);
    };

    const uploadAsset = async (file?: File) => {
        if (!file || !groupId || groupId === ALL_ASSETS_SCOPE || uploading)
            return;
        setUploading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("groupId", groupId);
            const response = await fetch("/api/volcengine/materials", {
                method: "POST",
                body: form,
            });
            const data = (await response.json()) as ApiUploadResponse;
            if (!response.ok) {
                throw new Error(
                    data.error || `上传失败（HTTP ${response.status}）`,
                );
            }
            const uploaded = normalizeVolcengineMaterial(data.item, groupId);
            if (uploaded && data.ready) {
                const normalized = { ...uploaded, groupType };
                setAssets((current) => [
                    normalized,
                    ...current.filter((item) => item.id !== normalized.id),
                ]);
            }
            toast.success(data.message || "素材已上传到火山素材库");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "素材上传失败");
        } finally {
            setUploading(false);
            if (uploadInputRef.current) uploadInputRef.current.value = "";
        }
    };

    const removeConfirmed = (asset: VolcengineMaterial) => {
        onChange(
            serializeSelected(selected.filter((item) => item.id !== asset.id)),
        );
    };

    return (
        <div
            className="nodrag space-y-2"
            onPointerDown={(event) => event.stopPropagation()}
        >
            {compact ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="nodrag h-9 shrink-0 gap-1.5 px-2.5"
                    onClick={openPicker}
                    title="选择素材或直接上传到火山素材库"
                >
                    <FolderOpen className="size-4" />
                    火山素材库
                    {selected.length > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                            {selected.length}
                        </span>
                    )}
                </Button>
            ) : (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-muted-foreground">
                            参考素材（可选）
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="nodrag h-8"
                            onClick={openPicker}
                        >
                            <FolderOpen className="size-4" />
                            火山素材库
                        </Button>
                    </div>

                    {selected.length > 0 ? (
                        <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-2">
                            {selected.map((item, index) => {
                                const Icon = iconFor(item.type);
                                return (
                                    <div
                                        key={`${item.id}-${index}`}
                                        className="group relative flex h-16 w-20 items-center justify-center overflow-hidden rounded-md border bg-background"
                                        title={item.name || item.id}
                                    >
                                        {item.url && item.type !== "audio" ? (
                                            item.type === "video" ? (
                                                <video
                                                    src={item.url}
                                                    muted
                                                    preload="metadata"
                                                    className="size-full object-cover"
                                                />
                                            ) : (
                                                <img
                                                    src={item.url}
                                                    alt={item.name || item.id}
                                                    className="size-full object-cover"
                                                />
                                            )
                                        ) : (
                                            <Icon className="size-6 text-muted-foreground" />
                                        )}
                                        <span className="absolute bottom-0 inset-x-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-white">
                                            {selectedLabels[index]?.replace(
                                                "@",
                                                "",
                                            ) || item.id}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="移除素材"
                                            className="nodrag absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 p-0.5 text-white group-hover:block"
                                            onClick={() =>
                                                removeConfirmed(item)
                                            }
                                        >
                                            <X className="size-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                            从火山方舟素材库选择图片、视频或音频；需要在设置里配置素材库
                            AK/SK。
                        </p>
                    )}

                    <Input
                        value={manualText}
                        onChange={(event) => setManualText(event.target.value)}
                        onBlur={() => {
                            const next = parseVolcengineMaterials(manualText);
                            const limitError = validateVolcengineMaterials(
                                next,
                                occupied,
                                limits,
                            );
                            if (limitError) {
                                setError(limitError);
                                return;
                            }
                            setError("");
                            onChange(serializeSelected(next));
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        placeholder="也可手动粘贴 Asset ID（多个可换行；视频用 video:，音频用 audio:）"
                        className="nodrag text-xs"
                    />
                </>
            )}

            <Dialog
                open={open}
                onOpenChange={(nextOpen) => {
                    if (nextOpen) {
                        setDraftSelected(
                            selected.filter(
                                (item) =>
                                    !allowedTypes ||
                                    allowedTypes.includes(item.type),
                            ),
                        );
                        setError("");
                    }
                    setOpen(nextOpen);
                }}
            >
                <DialogContent
                    className="nodrag flex max-h-[90vh] max-w-6xl flex-col overflow-hidden"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <DialogHeader className="shrink-0">
                        <div className="flex items-center gap-2">
                            {groupId && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="nodrag"
                                    onClick={() => {
                                        setGroupId(null);
                                        setGroupType("AIGC");
                                        setAssetKindFilter("all");
                                        setSearch("");
                                    }}
                                >
                                    <ArrowLeft className="size-4" />
                                </Button>
                            )}
                            <div>
                                <DialogTitle>
                                    {groupId === ALL_ASSETS_SCOPE
                                        ? `素材库 · 全部${assetKindFilter === "video" ? "视频" : assetKindFilter === "audio" ? "音频" : assetKindFilter === "image" ? "图片" : "素材"}`
                                        : "火山素材库"}
                                </DialogTitle>
                                <DialogDescription>
                                    选择素材组后可在端内直接上传；选中的素材会作为火山方舟视频模型参考发送。
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept="image/*,video/*,audio/*"
                                className="hidden"
                                onChange={(event) =>
                                    void uploadAsset(event.target.files?.[0])
                                }
                            />
                            <Input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="搜索素材名称或 Asset ID"
                                className="nodrag"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="nodrag shrink-0"
                                onClick={() =>
                                    void (groupId
                                        ? loadAssets(
                                              groupId,
                                              groupType,
                                              assetKindFilter,
                                          )
                                        : loadGroups())
                                }
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="size-4" />
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="nodrag shrink-0"
                                onClick={() =>
                                    window.open(
                                        "https://console.volcengine.com/ark/region:cn-beijing/experience",
                                        "_blank",
                                        "noopener,noreferrer",
                                    )
                                }
                            >
                                <Plus className="size-4" /> 创建素材组
                            </Button>
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="nodrag shrink-0"
                                disabled={uploading}
                                onClick={() => {
                                    if (
                                        !groupId ||
                                        groupId === ALL_ASSETS_SCOPE
                                    ) {
                                        setError(
                                            "请先进入一个素材组，再点击“上传到火山素材库”。",
                                        );
                                        return;
                                    }
                                    uploadInputRef.current?.click();
                                }}
                            >
                                {uploading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <UploadCloud className="size-4" />
                                )}
                                {uploading
                                    ? "上传并入库中"
                                    : "上传到火山素材库"}
                            </Button>
                            <div className="flex shrink-0 rounded-lg border bg-muted/30 p-0.5">
                                <Button
                                    type="button"
                                    variant={
                                        viewMode === "list"
                                            ? "secondary"
                                            : "ghost"
                                    }
                                    size="icon"
                                    className="nodrag size-8"
                                    title="列表显示（完整名称）"
                                    aria-label="列表显示"
                                    onClick={() => setViewMode("list")}
                                >
                                    <List className="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant={
                                        viewMode === "grid"
                                            ? "secondary"
                                            : "ghost"
                                    }
                                    size="icon"
                                    className="nodrag size-8"
                                    title="卡片显示"
                                    aria-label="卡片显示"
                                    onClick={() => setViewMode("grid")}
                                >
                                    <LayoutGrid className="size-4" />
                                </Button>
                            </div>
                        </div>

                        {(error || draftSelectionError) && (
                            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error || draftSelectionError}
                            </p>
                        )}

                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            {!groupId ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {(
                                            [
                                                {
                                                    type: "video" as const,
                                                    label: "全部视频",
                                                    icon: FileVideo,
                                                },
                                                {
                                                    type: "image" as const,
                                                    label: "全部图片",
                                                    icon: ImageIcon,
                                                },
                                                {
                                                    type: "audio" as const,
                                                    label: "全部音频",
                                                    icon: FileAudio,
                                                },
                                            ] as const
                                        )
                                            .filter(
                                                (entry) =>
                                                    !allowedTypes ||
                                                    allowedTypes.includes(
                                                        entry.type,
                                                    ),
                                            )
                                            .map((entry) => {
                                                const Icon = entry.icon;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={entry.type}
                                                        className="nodrag flex items-center gap-3 rounded-xl border bg-primary/5 p-3 text-left transition hover:border-primary hover:bg-primary/10"
                                                        onClick={() =>
                                                            void loadAssets(
                                                                ALL_ASSETS_SCOPE,
                                                                "AIGC",
                                                                entry.type,
                                                            )
                                                        }
                                                    >
                                                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                            <Icon className="size-5" />
                                                        </span>
                                                        <span>
                                                            <span className="block text-sm font-semibold">
                                                                {entry.label}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground">
                                                                跨素材组快速查找
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                    <div
                                        className={cn(
                                            viewMode === "list"
                                                ? "grid grid-cols-1 gap-2 lg:grid-cols-2"
                                                : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
                                        )}
                                    >
                                        {filteredGroups.map((group) => (
                                            <button
                                                type="button"
                                                key={group.id}
                                                className={cn(
                                                    "nodrag border bg-muted/20 text-left transition hover:border-primary hover:bg-muted",
                                                    viewMode === "list"
                                                        ? "flex min-h-20 items-center gap-4 rounded-xl p-3"
                                                        : "min-h-40 rounded-2xl p-4",
                                                )}
                                                title={group.name || group.id}
                                                onClick={() =>
                                                    void loadAssets(
                                                        group.id,
                                                        group.groupType ||
                                                            "AIGC",
                                                    )
                                                }
                                            >
                                                <div
                                                    className={cn(
                                                        "flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
                                                        viewMode === "list"
                                                            ? "size-14"
                                                            : "mb-4 size-16",
                                                    )}
                                                >
                                                    <FolderOpen
                                                        className={
                                                            viewMode === "list"
                                                                ? "size-8"
                                                                : "size-10"
                                                        }
                                                    />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="block whitespace-normal break-words text-sm font-semibold leading-5">
                                                        {group.name || group.id}
                                                    </span>
                                                    <span className="mt-1 block break-all text-[11px] leading-4 text-muted-foreground">
                                                        {group.groupType ===
                                                        "LivenessFace"
                                                            ? "真人人像素材组"
                                                            : "AIGC 素材组"}
                                                        {viewMode === "list"
                                                            ? ` · ${group.id}`
                                                            : ""}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                        {!loading &&
                                            filteredGroups.length === 0 && (
                                                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                                                    {groups.length === 0
                                                        ? "暂无素材组，请检查 AK/SK 或先在火山方舟创建素材组。"
                                                        : "没有匹配的素材组。"}
                                                </p>
                                            )}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={cn(
                                        viewMode === "list"
                                            ? "grid grid-cols-1 gap-2 lg:grid-cols-2"
                                            : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
                                    )}
                                >
                                    {filteredAssets.map((asset) => {
                                        const Icon = iconFor(asset.type);
                                        const isSelected = draftSelected.some(
                                            (item) => item.id === asset.id,
                                        );
                                        return (
                                            <button
                                                type="button"
                                                key={asset.id}
                                                title={asset.name || asset.id}
                                                className={cn(
                                                    "nodrag overflow-hidden border bg-background text-left transition hover:border-primary",
                                                    viewMode === "list"
                                                        ? "flex min-h-20 items-center gap-3 rounded-xl p-2"
                                                        : "rounded-2xl",
                                                    isSelected &&
                                                        "border-primary ring-2 ring-primary/30",
                                                )}
                                                onClick={() =>
                                                    toggleAsset(asset)
                                                }
                                            >
                                                <div
                                                    className={cn(
                                                        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40",
                                                        viewMode === "list"
                                                            ? "size-16"
                                                            : "aspect-video w-full rounded-none",
                                                    )}
                                                >
                                                    {asset.url &&
                                                    asset.type !== "audio" ? (
                                                        asset.type ===
                                                        "video" ? (
                                                            <video
                                                                src={asset.url}
                                                                muted
                                                                preload="metadata"
                                                                className="size-full object-cover"
                                                            />
                                                        ) : (
                                                            <img
                                                                src={asset.url}
                                                                alt={
                                                                    asset.name ||
                                                                    asset.id
                                                                }
                                                                className="size-full object-cover"
                                                            />
                                                        )
                                                    ) : (
                                                        <Icon className="size-10 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div
                                                    className={cn(
                                                        "min-w-0 flex-1",
                                                        viewMode === "grid" &&
                                                            "p-3",
                                                    )}
                                                >
                                                    <span className="block whitespace-normal break-words text-sm font-semibold leading-5">
                                                        {asset.name || asset.id}
                                                    </span>
                                                    <span className="mt-1 block break-all text-[11px] leading-4 text-muted-foreground">
                                                        {isSelected
                                                            ? `已选择 · ${asset.type}`
                                                            : viewMode ===
                                                                "list"
                                                              ? `${asset.type} · ${asset.id}`
                                                              : asset.type}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {!loading &&
                                        filteredAssets.length === 0 && (
                                            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                                                这个素材组里没有匹配的素材。
                                            </p>
                                        )}
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 border-t pt-3 sm:items-center sm:justify-between">
                        <span className="text-sm text-muted-foreground">
                            已选择 {draftSelected.length} 个素材
                        </span>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="button"
                                disabled={loading || !!draftSelectionError}
                                onClick={() => {
                                    const limitError =
                                        validateVolcengineMaterials(
                                            draftSelected,
                                            occupied,
                                            limits,
                                        );
                                    if (limitError) {
                                        setError(limitError);
                                        return;
                                    }
                                    onChange(serializeSelected(draftSelected));
                                    setOpen(false);
                                }}
                            >
                                确认使用
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
