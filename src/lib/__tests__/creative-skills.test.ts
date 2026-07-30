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
        expect(CREATIVE_SKILLS).toHaveLength(48);
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
        expect(getCreativeSkill("missing")).toBeUndefined();
    });
});
