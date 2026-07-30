import { describe, expect, it } from "vitest";
import {
    buildCreativeSkillPrompt,
    CREATIVE_SKILLS,
    getCreativeSkill,
} from "@/lib/creative-skills";

describe("creative skills", () => {
    it("keeps every skill id unique", () => {
        const ids = CREATIVE_SKILLS.map((skill) => skill.id);
        const names = CREATIVE_SKILLS.map((skill) => skill.name);
        expect(CREATIVE_SKILLS).toHaveLength(200);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(names).size).toBe(names.length);
    });

    it("includes dedicated image, style, video and action prompt packs", () => {
        expect(getCreativeSkill("identity-consistency-sheet")?.target).toBe(
            "image",
        );
        expect(getCreativeSkill("risograph-print")?.kind).toBe("style");
        expect(getCreativeSkill("close-quarters-fight")?.target).toBe("video");
        expect(getCreativeSkill("trailer-beat-structure")?.target).toBe(
            "video",
        );
        expect(getCreativeSkill("cinematic-color-script")?.target).toBe(
            "image",
        );
        expect(getCreativeSkill("fantasy-spell-vfx")?.target).toBe("video");
        expect(getCreativeSkill("golden-age-still-life")?.kind).toBe("style");
        expect(getCreativeSkill("storyboard-animatic-motion")?.target).toBe(
            "video",
        );
        expect(getCreativeSkill("boxing-exchange-director")?.tags).toContain(
            "打戏",
        );
        expect(getCreativeSkill("improvised-weapon-fight-director")?.kind).toBe(
            "optimizer",
        );
    });

    it("contains both image and video helpers", () => {
        expect(CREATIVE_SKILLS.some((skill) => skill.target === "image")).toBe(
            true,
        );
        expect(CREATIVE_SKILLS.some((skill) => skill.target === "video")).toBe(
            true,
        );
        expect(
            CREATIVE_SKILLS.some((skill) => skill.kind === "optimizer"),
        ).toBe(true);
        expect(CREATIVE_SKILLS.some((skill) => skill.kind === "style")).toBe(
            true,
        );
    });

    it("builds a directly usable prompt from a short idea", () => {
        const result = buildCreativeSkillPrompt(
            "image-to-video-director",
            "女孩在海边回头看向镜头",
        );
        expect(result).toContain("女孩在海边回头看向镜头");
        expect(result).toContain("连续性约束");
        expect(result.length).toBeGreaterThan(100);
    });

    it("returns the selected catalog item", () => {
        expect(getCreativeSkill("cinematic-image")?.target).toBe("image");
        expect(getCreativeSkill("missing")).toBeUndefined();
    });
});
