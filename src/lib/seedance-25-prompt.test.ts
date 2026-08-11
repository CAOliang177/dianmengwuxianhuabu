import { describe, expect, it } from "vitest";
import {
    buildSeedancePromptModelInstruction,
    optimizeSeedance25Prompt,
} from "./seedance-25-prompt";

describe("Seedance 2.5 prompt optimizer", () => {
    it("keeps the original idea and adds production sections", () => {
        const result = optimizeSeedance25Prompt("女孩在雨夜街头奔跑", {
            duration: 20,
            referenceLabels: ["@图片1", "@视频1"],
        });
        expect(result).toContain("主体与事件：女孩在雨夜街头奔跑");
        expect(result).toContain("镜头与剪辑：");
        expect(result).toContain("参考素材：@图片1、@视频1");
        expect(result).toContain("长叙事连续性：");
    });

    it("does not expand an already structured prompt twice", () => {
        const once = optimizeSeedance25Prompt("固定镜头拍摄咖啡杯");
        expect(optimizeSeedance25Prompt(once)).toBe(once);
    });

    it("returns an empty string for an empty prompt", () => {
        expect(optimizeSeedance25Prompt("   ")).toBe("");
    });

    it("gives the model edit-specific constraints and exact references", () => {
        const instruction = buildSeedancePromptModelInstruction({
            operation: "edit",
            referenceLabels: ["@视频1"],
        });
        expect(instruction).toContain("Seedance 2.5 视频编辑");
        expect(instruction).toContain("比例与时长跟随源视频");
        expect(instruction).toContain("@视频1");
        expect(instruction).toContain("只输出最终提示词");
    });
});
