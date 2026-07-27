import { describe, expect, it } from "vitest";
import { buildCinematicPrompt } from "@/lib/cinematic-prompt";

describe("buildCinematicPrompt", () => {
    it("keeps the supplied scene and selected ratio", () => {
        const result = buildCinematicPrompt({
            brief: "雨夜里，一名快递员在便利店门口停下",
            storyMoment: "interrupted",
            camera: "observer",
            lighting: "night",
            aspectRatio: "21:9",
        });

        expect(result.prompt).toContain("雨夜里");
        expect(result.prompt).toContain("21:9");
        expect(result.interpretation).toContain("日常动作被突然打断");
        expect(result.avoid).toContain("poster layout");
    });

    it("uses reference ratio wording for auto", () => {
        const result = buildCinematicPrompt({
            brief: "an empty railway platform at dawn",
            storyMoment: "after",
            camera: "environment",
            lighting: "dawn",
            aspectRatio: "auto",
        });

        expect(result.prompt).toContain("connected reference image");
    });
});

