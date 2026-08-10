import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
    clampVideoDuration,
    VIDEO_DURATION_MAX,
    VIDEO_DURATION_MIN,
} from "@/constants/media-options";

export interface VideoDurationSliderProps {
    value: number;
    onChange: (duration: number) => void;
    min?: number;
    max?: number;
}

export function VideoDurationSlider({
    value,
    onChange,
    min = VIDEO_DURATION_MIN,
    max = VIDEO_DURATION_MAX,
}: VideoDurationSliderProps) {
    const t = useTranslations("Workspace.nodes");
    const clamped = clampVideoDuration(value, min, max);

    useEffect(() => {
        if (clamped !== value) onChange(clamped);
    }, [clamped, value, onChange]);

    return (
        <Card className="p-3">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {t("common.duration")}
                    </Label>
                    <span className="text-xs font-medium">{clamped}s</span>
                </div>
                <Slider
                    value={[clamped]}
                    onValueChange={([v]) =>
                        onChange(clampVideoDuration(v, min, max))
                    }
                    min={min}
                    max={max}
                    step={1}
                    className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{min}s</span>
                    <span>{max}s</span>
                </div>
            </div>
        </Card>
    );
}
