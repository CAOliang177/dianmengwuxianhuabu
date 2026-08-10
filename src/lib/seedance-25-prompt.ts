/**
 * A local, deterministic Seedance 2.5 prompt formatter.
 *
 * It follows the official ordering (subject/action, scene, visual style,
 * camera/editing, sound) without sending the user's prompt or API key to a
 * second service. The original wording stays intact as the first section so
 * the helper is safe to use on existing prompts.
 */

export type SeedancePromptOptions = {
    assetCount?: number;
    referenceLabels?: string[];
    duration?: number;
};

const STRUCTURED_PREFIXES = [
    "主体与动作：",
    "主体与事件：",
    "场景与环境：",
    "视觉风格：",
    "镜头与剪辑：",
    "声音设计：",
    "生成约束：",
];

function hasPrefix(prompt: string, prefix: string): boolean {
    return prompt.includes(prefix);
}

function hasAny(prompt: string, terms: string[]): boolean {
    return terms.some((term) => prompt.includes(term));
}

function referenceLine(assetCount: number, referenceLabels?: string[]): string {
    if (assetCount <= 0 && !referenceLabels?.length) return "";
    const refs = (
        referenceLabels?.length
            ? referenceLabels
            : Array.from(
                  { length: Math.min(assetCount, 50) },
                  (_, index) => `@图片${index + 1}`,
              )
    ).join("、");
    return `参考素材：${refs}；按提示词中写明的职责使用素材，只保留指定的主体、动作、风格或声音信息，不要把不同素材的职责混用。`;
}

/** Format a short prompt into a production-oriented Seedance 2.5 brief. */
export function optimizeSeedance25Prompt(
    rawPrompt: string,
    options: SeedancePromptOptions = {},
): string {
    const prompt = rawPrompt.trim();
    if (!prompt) return "";

    // Do not repeatedly expand a prompt when the button is clicked twice.
    if (STRUCTURED_PREFIXES.some((prefix) => hasPrefix(prompt, prefix))) {
        return prompt;
    }

    const sections: string[] = [`主体与事件：${prompt}`];
    sections.push(
        "动作执行：明确动作的起始状态、过程和结束状态，人物、道具与空间关系连续，运动符合真实物理反馈。",
    );
    sections.push(
        "场景与环境：保持原提示中的时间、地点、天气和环境关系，前后镜头空间连续，不凭空添加会改变叙事的元素。",
    );
    sections.push(
        "视觉风格：延续原提示中指定的风格、色彩、材质和光线；细节自然、层次清楚，避免塑料感、过度锐化和过度磨皮。",
    );
    sections.push(
        "镜头与剪辑：镜头运动服务主体动作，构图和焦点稳定；景别变化、推拉摇移和切换有明确动机，避免无目的抖动、突兀跳切和主体出画。",
    );

    if (
        hasAny(prompt, [
            "声音",
            "音乐",
            "音效",
            "台词",
            "对白",
            "说：",
            "说：“",
        ])
    ) {
        sections.push(
            "声音设计：环境声与动作同步；音乐用（音乐内容）标注，音效用<音效内容>标注，台词用{角色：台词}标注，字幕用【字幕内容】标注。",
        );
    }

    const refs = referenceLine(
        options.assetCount ?? 0,
        options.referenceLabels,
    );
    if (refs) sections.push(refs);

    const duration = Math.round(options.duration ?? 0);
    if (duration >= 15) {
        sections.push(
            "长叙事连续性：保持角色外观、服装、道具、光线和空间位置一致，动作按时间自然推进，结尾留出完整收束。",
        );
    }
    sections.push(
        "生成约束：主体身份和数量保持稳定，避免形变、闪烁、漂移、重复肢体、随机文字和水印。",
    );
    return sections.join("\n");
}
