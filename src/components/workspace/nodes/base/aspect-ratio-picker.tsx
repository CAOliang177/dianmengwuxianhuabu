import { RectangleHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    getAspectRatioIconSize,
} from "@/constants/media-options";
import { cn } from "@/lib/utils";

interface AspectRatioPickerProps {
    ratios: AspectRatio[];
    value: AspectRatio;
    onChange: (ratio: AspectRatio) => void;
    showSize?: boolean;
    autoOption?: {
        active: boolean;
        disabled?: boolean;
        onSelect: () => void;
    };
}

export function AspectRatioPicker({
    ratios,
    value,
    onChange,
    showSize = true,
    autoOption,
}: AspectRatioPickerProps) {
    const t = useTranslations("Workspace.nodes");

    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <RectangleHorizontal className="h-4 w-4" />
                    {t("common.aspectRatio")}
                </Label>
                <div className="grid grid-cols-5 gap-2">
                    {autoOption ? (
                        <Button
                            type="button"
                            variant={autoOption.active ? "default" : "outline"}
                            size="sm"
                            disabled={autoOption.disabled}
                            onClick={autoOption.onSelect}
                            className={cn(
                                "h-auto min-w-0 flex-col gap-1 px-1 py-2 text-xs transition-all",
                                autoOption.active
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "hover:bg-accent hover:text-accent-foreground",
                            )}
                            title={
                                autoOption.disabled
                                    ? "连接参考图后可使用自适应比例"
                                    : "跟随第一张参考图的比例"
                            }
                        >
                            <div
                                className={cn(
                                    "h-4 w-5 rounded border border-dashed",
                                    autoOption.active
                                        ? "border-primary-foreground bg-primary-foreground/20"
                                        : "border-muted-foreground/50",
                                )}
                            />
                            <span>自适应</span>
                        </Button>
                    ) : null}
                    {ratios.map((ratio) => {
                        const isSelected =
                            !autoOption?.active && value.value === ratio.value;
                        const iconSize = getAspectRatioIconSize(ratio.value);
                        return (
                            <Button
                                key={ratio.value}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => onChange(ratio)}
                                className={cn(
                                    "h-auto min-w-0 py-2 px-1 flex flex-col items-center gap-1 text-xs whitespace-normal transition-all",
                                    isSelected
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "hover:bg-accent hover:text-accent-foreground",
                                )}
                            >
                                <div
                                    className={cn(
                                        "border rounded transition-colors flex-shrink-0",
                                        isSelected
                                            ? "border-primary-foreground bg-primary-foreground/20"
                                            : "border-muted-foreground/30 bg-muted/30",
                                    )}
                                    style={iconSize}
                                />
                                <span className="text-xs font-medium leading-tight">
                                    {ratio.value}
                                </span>
                            </Button>
                        );
                    })}
                </div>
                {showSize && (
                    <div className="text-xs text-muted-foreground text-center">
                        {t("common.currentSize")} {value.width} × {value.height}
                    </div>
                )}
            </div>
        </Card>
    );
}
