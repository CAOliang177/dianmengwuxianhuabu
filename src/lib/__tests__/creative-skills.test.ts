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
        expect(
            getCreativeSkill("oss-gpt-image2-conceptual-typography-poster")
                ?.name,
        ).toBe("概念字体海报");
        expect(getCreativeSkill("oss-deerflow-video-generation")?.target).toBe(
            "video",
        );
        expect(getCreativeSkill("missing")).toBeUndefined();
    });

    it("keeps source-backed covers and prompt guidance", () => {
        const skill = getCreativeSkill("oss-gpt-image2-infographic-engine");
        expect(skill?.coverImage).toContain("case334.png");
        expect(skill?.buildPrompt("城市交通系统")).toContain("避坑约束");
    });

    it("includes a genuinely multi-source catalog", () => {
        const sources = CREATIVE_SKILLS.map(
            (skill) => skill.sourceInspiration?.split(":")[0],
        ).filter(Boolean);
        expect(new Set(sources).size).toBeGreaterThanOrEqual(8);
        expect(
            CREATIVE_SKILLS.filter((skill) => skill.target === "video").length,
        ).toBeGreaterThanOrEqual(40);
    });
});
