"use client";

import { FileArchive, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export function DiagnosticExportButton({ className }: { className?: string }) {
    const [available, setAvailable] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        setAvailable(Boolean(window.tongflowDesktop?.exportDiagnostics));
    }, []);

    if (!available) return null;

    const run = async () => {
        if (exporting) return;
        setExporting(true);
        setMessage(null);
        try {
            const rendererCanvasStorage: Record<string, string> = {};
            for (
                let index = 0;
                index < window.localStorage.length;
                index += 1
            ) {
                const key = window.localStorage.key(index);
                if (
                    !key ||
                    (!key.startsWith("dianmeng.canvas.") &&
                        key !== "nodes" &&
                        key !== "edges" &&
                        key !== "workflowMeta")
                ) {
                    continue;
                }
                const value = window.localStorage.getItem(key);
                if (value !== null) rendererCanvasStorage[key] = value;
            }
            const result = await window.tongflowDesktop?.exportDiagnostics({
                rendererCanvasStorage,
            });
            if (result?.saved) {
                setMessage(
                    `诊断包已保存${result.skipped.length ? `，跳过 ${result.skipped.length} 个占用中的文件` : ""}`,
                );
                window.setTimeout(() => setMessage(null), 4000);
            }
        } catch (error) {
            setMessage(
                `导出失败：${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="relative">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={exporting}
                        onClick={() => void run()}
                        className={className}
                        aria-label="一键导出诊断包"
                    >
                        {exporting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <FileArchive className="h-5 w-5" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    一键导出诊断包（不含 API Key 和图片）
                </TooltipContent>
            </Tooltip>
            {message ? (
                <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-white/10 bg-[#10182b]/95 px-3 py-2 text-xs leading-5 text-slate-200 shadow-2xl backdrop-blur-xl">
                    {message}
                </div>
            ) : null}
        </div>
    );
}
