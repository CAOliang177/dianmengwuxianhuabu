import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { ResolutionTier } from "@/constants/media-options";
import { cn } from "@/lib/utils";

interface ResolutionPickerProps {
    tiers: ResolutionTier[];
    value: string;
    onChange: (tier: ResolutionTier) => void;
    compact?: boolean;
}

export function ResolutionPicker({
    tiers,
    value,
    onChange,
    compact = false,
}: ResolutionPickerProps) {
    const t = useTranslations("Workspace.nodes");

    return (
        <Card className={compact ? "p-2" : "p-3"}>
            <div
                className={cn(
                    compact ? "flex items-center gap-3" : "space-y-2",
                )}
            >
                <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Maximize2 className="h-4 w-4" />
                    {t("common.resolution")}
                </Label>
                <div
                    className={cn(
                        "grid grid-cols-3 gap-2",
                        compact && "min-w-0 flex-1 gap-1.5",
                    )}
                >
                    {tiers.map((tier) => {
                        const isSelected = value === tier.value;
                        return (
                            <Button
                                key={tier.value}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => onChange(tier)}
                                className={cn(
                                    "h-auto px-1 text-xs transition-all",
                                    compact ? "py-1.5" : "py-2",
                                    isSelected
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "hover:bg-accent hover:text-accent-foreground",
                                )}
                            >
                                {tier.label}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
