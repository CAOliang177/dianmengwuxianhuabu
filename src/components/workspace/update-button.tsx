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
import { createPortal } from "react-dom";
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

    const progressOverlay =
        (downloading || status === "downloaded") &&
        typeof document !== "undefined"
            ? createPortal(
                  <div className="fixed right-6 top-6 z-[250] w-80 rounded-2xl border border-border/80 bg-background/95 p-4 text-foreground shadow-2xl backdrop-blur-xl">
                      <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                              {downloading ? (
                                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-500" />
                              ) : (
                                  <CircleArrowUp className="h-5 w-5 shrink-0 text-green-500" />
                              )}
                              <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">
                                      {downloading
                                          ? "正在下载应用更新"
                                          : "应用更新已下载完成"}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                      v{state.currentVersion} → v
                                      {state.latestVersion ?? "最新版本"}
                                  </div>
                              </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">
                              {downloading
                                  ? `${Math.round(state.percent ?? 0)}%`
                                  : "100%"}
                          </span>
                      </div>
                      <Progress
                          value={downloading ? (state.percent ?? 0) : 100}
                          className="h-2"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                          {downloading
                              ? "正在下载完整安装包，请保持应用打开。"
                              : "点击下方按钮重启并安装新版本。"}
                      </p>
                      {status === "downloaded" ? (
                          <Button
                              type="button"
                              size="sm"
                              className="mt-3 w-full"
                              onClick={() =>
                                  void window.tongflowDesktop?.installUpdate()
                              }
                          >
                              {t("restart")}
                          </Button>
                      ) : null}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={`relative ${className ?? ""} ${
                                hasUpdate
                                    ? "border-red-400/70 bg-red-500/20 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,.2),0_0_22px_rgba(239,68,68,.28)] hover:border-red-300 hover:bg-red-500/30 hover:text-white"
                                    : ""
                            }`}
                            aria-label={
                                hasUpdate
                                    ? `发现新版本 ${state.latestVersion ?? ""}`
                                    : t("title")
                            }
                        >
                            <CircleArrowUp className="h-5 w-5" />
                            {hasUpdate ? (
                                <span className="absolute -right-2 -top-2 flex min-w-6 items-center justify-center rounded-full border-2 border-[#060914] bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-lg shadow-red-500/40">
                                    新
                                </span>
                            ) : null}
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    {hasUpdate
                        ? `发现新版本 v${state.latestVersion ?? ""}`
                        : t("title")}
                </TooltipContent>
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
        {progressOverlay}
        </>
    );
}
