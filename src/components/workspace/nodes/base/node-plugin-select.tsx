"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export type NodePluginSelectOption = {
    value: string;
    label: string;
};

type NodePluginSelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    options: NodePluginSelectOption[];
    /** Card label; defaults to the plugin implementation title. */
    title?: string;
    /** Compact toolbar presentation without a card or label. */
    compact?: boolean;
};

/**
 * Shared plugin implementation selector (`plugins/<id>` directory name from registry).
 */
export function NodePluginSelect({
    value,
    onValueChange,
    options,
    title,
    compact = false,
}: NodePluginSelectProps) {
    const t = useTranslations("Workspace.nodes.base");
    const select = (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger
                className={compact ? "h-9 min-w-36 max-w-52 border-0 bg-transparent px-2 shadow-none hover:bg-muted" : "w-full"}
                size="sm"
            >
                <SelectValue placeholder={t("pluginSelectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
                {options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    if (compact) return select;

    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                    {title ?? t("pluginImplementationTitle")}
                </Label>
                {select}
            </div>
        </Card>
    );
}
