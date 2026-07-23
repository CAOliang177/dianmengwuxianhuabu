"use client";

/**
 * App-update button, desktop app only. The Electron preload exposes
 * `window.tongflowDesktop`; in a plain browser it is absent and this component
 * renders nothing. State (version info, download progress) is pushed from the
 * Electron main process — see desktop/src/updater.ts.
 */

import { CircleArrowUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

/** Mirror of UpdateState in desktop/src/updater.ts (separate TS projects). */
interface DesktopUpdateState {
    status:
        | "idle"
        | "checking"
        | "up-to-date"
        | "available"
        | "downloading"
        | "downloaded"
        | "error";
    /** Kept for contract compatibility; both platforms auto-update today. */
    mode: "auto" | "manual";
    currentVersion: string;
    latestVersion: string | null;
    percent: number | null;
    error: string | null;
}

interface TongflowDesktopBridge {
    getUpdateState: () => Promise<DesktopUpdateState>;
    checkForUpdates: () => Promise<void>;
    installUpdate: () => Promise<void>;
    onUpdateState: (
        callback: (state: DesktopUpdateState) => void,
    ) => () => void;
}

declare global {
    interface Window {
        tongflowDesktop?: TongflowDesktopBridge;
    }
}

export function UpdateButton({ className }: { className?: string }) {
    const t = useTranslations("Updater");
    const [state, setState] = useState<DesktopUpdateState | null>(null);

    useEffect(() => {
        const bridge = window.tongflowDesktop;
        if (!bridge) return;
        let cancelled = false;
        void bridge.getUpdateState().then((s) => {
            if (!cancelled) setState(s);
        });
        const unsubscribe = bridge.onUpdateState((s) => setState(s));
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    // Not running inside the desktop app (or bridge not ready yet).
    if (!state) return null;

    const { status } = state;
    // The download starts right after "available", so render that transient
    // state as a 0% download.
    const downloading = status === "downloading" || status === "available";
    const hasUpdate =
        status === "available" || downloading || status === "downloaded";

    const statusText = (() => {
        if (status === "checking") return t("checking");
        if (downloading)
            return state.latestVersion
                ? t("available", { version: state.latestVersion })
                : t("downloading");
        if (status === "downloaded") return t("downloaded");
        if (status === "error") return t("error");
        if (status === "up-to-date") return t("upToDate");
        return null;
    })();

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={`relative ${className ?? ""}`}
                            aria-label={t("title")}
                        >
                            <CircleArrowUp className="h-5 w-5" />
                            {hasUpdate ? (
                                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
                            ) : null}
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("title")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-medium">dianmeng无限画布</span>
                    <span className="text-xs text-muted-foreground">
                        {t("currentVersion")} v{state.currentVersion}
                    </span>
                </div>
                {statusText ? (
                    <p className="mb-2 text-xs text-muted-foreground">
                        {statusText}
                    </p>
                ) : null}
                {state.error ? (
                    <p className="mb-2 break-all text-xs text-red-500">
                        {state.error}
                    </p>
                ) : null}
                {downloading ? (
                    <div className="mb-2 flex items-center gap-2">
                        <Progress
                            value={state.percent ?? 0}
                            className="h-1.5"
                        />
                        <span className="w-9 text-right text-xs text-muted-foreground">
                            {Math.round(state.percent ?? 0)}%
                        </span>
                    </div>
                ) : null}
                {status === "downloaded" ? (
                    <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={() =>
                            void window.tongflowDesktop?.installUpdate()
                        }
                    >
                        {t("restart")}
                    </Button>
                ) : status === "checking" || downloading ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        disabled
                    >
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        {status === "checking"
                            ? t("checking")
                            : t("downloading")}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() =>
                            void window.tongflowDesktop?.checkForUpdates()
                        }
                    >
                        {t("checkNow")}
                    </Button>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
