"use client";

import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Eye,
    EyeOff,
    FolderOpen,
    Loader2,
    Plus,
    Settings,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiGet, apiPut } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type {
    PluginEnvDecl,
    PluginEnvVar,
} from "@/lib/plugins/plugin-env-manifest-schema";
import { pluginDisplayName } from "./nodes/base/node-plugin-id-select";

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

interface EnvResponse {
    env: Record<string, string>;
    pluginEnv?: PluginEnvDecl[];
}

interface Row {
    key: string;
    value: string;
}

/** A declared var as rendered inside a card; shared vars carry `usedBy`. */
interface GroupVar extends PluginEnvVar {
    /** Display names of the plugins declaring this key (shared card only). */
    usedBy?: string[];
}

interface EnvCardGroup {
    id: string;
    title: string;
    vars: GroupVar[];
}

function isSecretEnvKey(key: string): boolean {
    return /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(key);
}

function isConnectionEnvVar(v: PluginEnvVar): boolean {
    return /(?:BASE_URL|ENDPOINT|MODEL)$/.test(v.key);
}

/**
 * Splits declarations into one "shared" group (keys declared by >=2 installed
 * plugins — e.g. MODAL_TOKEN_ID or HF_TOKEN) plus one group per plugin with
 * its remaining own keys. Merge rule for shared keys: required if any
 * declarer says so; description/default kept only when every declarer agrees
 * (a plugin-specific hint would mislead on a shared row); url from the first
 * declarer.
 */
function buildEnvCardGroups(
    decls: PluginEnvDecl[],
    sharedTitle: string,
): EnvCardGroup[] {
    const usage = new Map<string, { v: GroupVar; plugins: string[] }>();
    for (const decl of decls) {
        for (const v of decl.env) {
            const seen = usage.get(v.key);
            if (seen) {
                seen.plugins.push(decl.pluginId);
                if (v.required) seen.v = { ...seen.v, required: true };
                if (seen.v.description !== v.description) {
                    seen.v = { ...seen.v, description: undefined };
                }
                if (seen.v.default !== v.default) {
                    seen.v = { ...seen.v, default: undefined };
                }
            } else {
                usage.set(v.key, { v: { ...v }, plugins: [decl.pluginId] });
            }
        }
    }

    const sharedKeys = new Set<string>();
    const sharedVars: GroupVar[] = [];
    for (const { v, plugins } of usage.values()) {
        if (plugins.length < 2) continue;
        sharedKeys.add(v.key);
        sharedVars.push({ ...v, usedBy: plugins.map(pluginDisplayName) });
    }

    const groups: EnvCardGroup[] = [];
    if (sharedVars.length > 0) {
        groups.push({ id: "shared", title: sharedTitle, vars: sharedVars });
    }
    for (const decl of decls) {
        const vars = decl.env.filter((v) => !sharedKeys.has(v.key));
        if (vars.length > 0) {
            groups.push({
                id: decl.pluginId,
                title: pluginDisplayName(decl.pluginId),
                vars,
            });
        }
    }
    return groups;
}

function DeclaredVarRow({
    v,
    value,
    revealed,
    onChange,
    onToggleReveal,
}: {
    v: GroupVar;
    value: string;
    revealed: boolean;
    onChange: (value: string) => void;
    onToggleReveal: () => void;
}) {
    const t = useTranslations("Settings");
    const secret = isSecretEnvKey(v.key);
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">
                    {v.key}
                    {v.required ? (
                        <span
                            className="ml-0.5 text-red-500"
                            title={t("requiredHint")}
                        >
                            *
                        </span>
                    ) : null}
                </span>
                {v.url ? (
                    <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("getKey")}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                ) : null}
            </div>
            <div className="flex items-center gap-2">
                <Input
                    value={value}
                    placeholder={v.default ?? t("valuePlaceholder")}
                    type={!secret || revealed ? "text" : "password"}
                    spellCheck={false}
                    autoComplete="off"
                    className="flex-1 font-mono text-xs"
                    onChange={(e) => onChange(e.target.value)}
                />
                {secret ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground"
                        aria-label={t("toggleReveal")}
                        onClick={onToggleReveal}
                    >
                        {revealed ? (
                            <EyeOff className="h-4 w-4" />
                        ) : (
                            <Eye className="h-4 w-4" />
                        )}
                    </Button>
                ) : null}
            </div>
            {v.description ? (
                <p className="text-xs text-muted-foreground">{v.description}</p>
            ) : null}
            {v.usedBy ? (
                <p className="text-xs text-muted-foreground/70">
                    {v.usedBy.join(", ")}
                </p>
            ) : null}
        </div>
    );
}

function PluginEnvCard({
    group,
    values,
    revealed,
    onChangeValue,
    onToggleReveal,
}: {
    group: EnvCardGroup;
    values: Record<string, string>;
    revealed: Record<string, boolean>;
    onChangeValue: (key: string, value: string) => void;
    onToggleReveal: (key: string) => void;
}) {
    const t = useTranslations("Settings");
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const requiredVars = group.vars.filter((v) => v.required);
    const optionalVars = group.vars.filter((v) => !v.required);
    const connectionVars = optionalVars.filter(isConnectionEnvVar);
    const advancedVars = optionalVars.filter((v) => !isConnectionEnvVar(v));
    const setCount = requiredVars.filter((v) =>
        (values[v.key] ?? "").trim(),
    ).length;
    const allSet = setCount === requiredVars.length;

    return (
        <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{group.title}</span>
                {requiredVars.length > 0 ? (
                    <Badge variant={allSet ? "secondary" : "outline"}>
                        {t("setBadge", {
                            set: setCount,
                            total: requiredVars.length,
                        })}
                    </Badge>
                ) : null}
            </div>

            {requiredVars.map((v) => (
                <DeclaredVarRow
                    key={v.key}
                    v={v}
                    value={values[v.key] ?? ""}
                    revealed={Boolean(revealed[v.key])}
                    onChange={(value) => onChangeValue(v.key, value)}
                    onToggleReveal={() => onToggleReveal(v.key)}
                />
            ))}

            {connectionVars.map((v) => (
                <DeclaredVarRow
                    key={v.key}
                    v={v}
                    value={values[v.key] ?? ""}
                    revealed={Boolean(revealed[v.key])}
                    onChange={(value) => onChangeValue(v.key, value)}
                    onToggleReveal={() => onToggleReveal(v.key)}
                />
            ))}

            {advancedVars.length > 0 ? (
                <>
                    <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setAdvancedOpen((open) => !open)}
                    >
                        {advancedOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        {t("advanced", { count: advancedVars.length })}
                    </button>
                    {advancedOpen
                        ? advancedVars.map((v) => (
                              <DeclaredVarRow
                                  key={v.key}
                                  v={v}
                                  value={values[v.key] ?? ""}
                                  revealed={Boolean(revealed[v.key])}
                                  onChange={(value) =>
                                      onChangeValue(v.key, value)
                                  }
                                  onToggleReveal={() => onToggleReveal(v.key)}
                              />
                          ))
                        : null}
                </>
            ) : null}
        </div>
    );
}

export function SettingsDialog() {
    const t = useTranslations("Settings");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [decls, setDecls] = useState<PluginEnvDecl[]>([]);
    // Values of declared keys — one flat map, so a key shared by several
    // plugins is edited once and stays in sync everywhere.
    const [values, setValues] = useState<Record<string, string>>({});
    // Free-form rows for keys no installed plugin declares.
    const [customRows, setCustomRows] = useState<Row[]>([]);
    // Keyed by env key for declared rows, `custom:${index}` for custom rows.
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const [downloadDirectory, setDownloadDirectory] = useState<string | null>(
        null,
    );
    const [choosingDirectory, setChoosingDirectory] = useState(false);
    const [desktopAvailable, setDesktopAvailable] = useState(false);

    const groups = useMemo(
        () => buildEnvCardGroups(decls, t("sharedSectionTitle")),
        [decls, t],
    );

    const applyEnv = useCallback(
        (env: Record<string, string>, nextDecls: PluginEnvDecl[]) => {
            const claimed = new Set(
                nextDecls.flatMap((d) => d.env.map((v) => v.key)),
            );
            const nextValues: Record<string, string> = {};
            const nextCustom: Row[] = [];
            for (const [key, value] of Object.entries(env)) {
                if (claimed.has(key)) nextValues[key] = value;
                else nextCustom.push({ key, value });
            }
            setDecls(nextDecls);
            setValues(nextValues);
            setCustomRows(nextCustom);
            setRevealed({});
        },
        [],
    );

    const fetchEnv = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiGet<EnvResponse>("/api/settings/env");
            applyEnv(data.env ?? {}, data.pluginEnv ?? []);
        } catch (error) {
            logger.error("Failed to load settings:", error);
        } finally {
            setLoading(false);
        }
    }, [applyEnv]);

    useEffect(() => {
        setDesktopAvailable(Boolean(window.tongflowDesktop));
    }, []);

    useEffect(() => {
        if (!open) return;
        void fetchEnv();
        void window.tongflowDesktop
            ?.getDownloadDirectory()
            .then(setDownloadDirectory);
    }, [open, fetchEnv]);

    const chooseDownloadDirectory = useCallback(async () => {
        const bridge = window.tongflowDesktop;
        if (!bridge) return;
        setChoosingDirectory(true);
        try {
            const directory = await bridge.chooseDownloadDirectory();
            if (directory) {
                setDownloadDirectory(directory);
                toast.success("默认图片保存位置已设置");
            }
        } finally {
            setChoosingDirectory(false);
        }
    }, []);

    const clearDownloadDirectory = useCallback(async () => {
        await window.tongflowDesktop?.setDownloadDirectory(null);
        setDownloadDirectory(null);
        toast.success("已恢复为下载时选择保存位置");
    }, []);

    const updateCustomRow = (index: number, patch: Partial<Row>) => {
        setCustomRows((prev) =>
            prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
        );
    };

    const addCustomRow = () =>
        setCustomRows((prev) => [...prev, { key: "", value: "" }]);

    const removeCustomRow = (index: number) => {
        setCustomRows((prev) => prev.filter((_, i) => i !== index));
    };

    const save = useCallback(async () => {
        // Collapse everything into one flat map; last non-empty key wins,
        // blank keys dropped. Declared values merge last so cards win over a
        // duplicate custom row; empty declared values are not persisted (a
        // stored "" would shadow a shell-exported key via withStoredEnv).
        const env: Record<string, string> = {};
        for (const { key, value } of customRows) {
            const k = key.trim();
            if (k) env[k] = value;
        }
        for (const [key, value] of Object.entries(values)) {
            if (value.trim()) env[key] = value;
            else delete env[key];
        }
        setSaving(true);
        try {
            const data = await apiPut<EnvResponse>("/api/settings/env", {
                env,
            });
            applyEnv(data.env ?? {}, decls);
            toast.success(t("saved"));
        } catch (error) {
            logger.error("Failed to save settings:", error);
        } finally {
            setSaving(false);
        }
    }, [customRows, values, decls, applyEnv, t]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={navBtnClass}
                            aria-label={t("title")}
                        >
                            <Settings className="h-5 w-5" />
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("title")}</TooltipContent>
            </Tooltip>

            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                        {desktopAvailable ? (
                            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                                <div>
                                    <h3 className="text-sm font-medium">
                                        图片默认保存位置
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        设置后，画布和历史记录下载的图片会直接保存到这个文件夹。
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground"
                                        title={downloadDirectory ?? undefined}
                                    >
                                        {downloadDirectory ??
                                            "未设置，下载时会询问保存位置"}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={choosingDirectory}
                                        onClick={() =>
                                            void chooseDownloadDirectory()
                                        }
                                    >
                                        {choosingDirectory ? (
                                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                        ) : (
                                            <FolderOpen className="mr-1.5 h-4 w-4" />
                                        )}
                                        选择文件夹
                                    </Button>
                                    {downloadDirectory ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() =>
                                                void clearDownloadDirectory()
                                            }
                                        >
                                            清除
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                        {groups.map((group) => (
                            <PluginEnvCard
                                key={group.id}
                                group={group}
                                values={values}
                                revealed={revealed}
                                onChangeValue={(key, value) =>
                                    setValues((prev) => ({
                                        ...prev,
                                        [key]: value,
                                    }))
                                }
                                onToggleReveal={(key) =>
                                    setRevealed((prev) => ({
                                        ...prev,
                                        [key]: !prev[key],
                                    }))
                                }
                            />
                        ))}

                        <div className="space-y-2">
                            {groups.length > 0 ? (
                                <div>
                                    <h3 className="text-sm font-medium">
                                        {t("customSectionTitle")}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t("customSectionHint")}
                                    </p>
                                </div>
                            ) : null}
                            {customRows.map((row, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-2"
                                >
                                    <Input
                                        value={row.key}
                                        placeholder={t("keyPlaceholder")}
                                        spellCheck={false}
                                        autoComplete="off"
                                        className="flex-1 font-mono text-xs"
                                        onChange={(e) =>
                                            updateCustomRow(index, {
                                                key: e.target.value,
                                            })
                                        }
                                    />
                                    <Input
                                        value={row.value}
                                        placeholder={t("valuePlaceholder")}
                                        type={
                                            revealed[`custom:${index}`]
                                                ? "text"
                                                : "password"
                                        }
                                        spellCheck={false}
                                        autoComplete="off"
                                        className="flex-1 font-mono text-xs"
                                        onChange={(e) =>
                                            updateCustomRow(index, {
                                                value: e.target.value,
                                            })
                                        }
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 text-muted-foreground"
                                        aria-label={t("toggleReveal")}
                                        onClick={() =>
                                            setRevealed((prev) => ({
                                                ...prev,
                                                [`custom:${index}`]:
                                                    !prev[`custom:${index}`],
                                            }))
                                        }
                                    >
                                        {revealed[`custom:${index}`] ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600"
                                        aria-label={t("removeRow")}
                                        onClick={() => removeCustomRow(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={addCustomRow}
                            >
                                <Plus className="mr-1 h-4 w-4" />
                                {t("addRow")}
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        disabled={saving || loading}
                        onClick={save}
                    >
                        {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {t("save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
