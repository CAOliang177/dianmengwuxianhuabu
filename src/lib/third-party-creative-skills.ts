import styleLibrary from "@/lib/awesome-gpt-image-2-style-library.json";
import type { CreativeSkill } from "@/lib/creative-skills";
import multiSourceAtlas from "@/lib/multi-source-skill-atlas.json";

type StyleTemplate = (typeof styleLibrary.templates)[number];

const cleanBrief = (brief: string) => brief.trim().replace(/\s+/g, " ");

const categoryRatios: Record<string, string> = {
    "UI & Interfaces": "9:16",
    "Charts & Infographics": "3:4",
    "Posters & Typography": "4:5",
    "Products & E-commerce": "4:5",
    "Brand & Logos": "1:1",
    "Architecture & Spaces": "16:9",
    "Photography & Realism": "3:2",
    "Illustration & Art": "4:5",
    "Characters & People": "3:2",
    "Scenes & Storytelling": "16:9",
    "History & Classical Themes": "16:9",
    "Documents & Publishing": "3:4",
    "Other Use Cases": "3:2",
};

function coverPath(path: string) {
    const filename = path.split("/").at(-1);
    return filename
        ? `/skill-covers/awesome-gpt-image-2/${filename}`
        : undefined;
}

function templateKind(template: StyleTemplate): CreativeSkill["kind"] {
    const styleTags = new Set([
        "Art",
        "Classical",
        "Illustration",
        "Photography",
        "Realistic",
        "Style",
    ]);
    return [...template.styles, ...template.tags].some((tag) =>
        styleTags.has(tag),
    )
        ? "style"
        : "optimizer";
}

function templatePrompt(template: StyleTemplate, brief: string) {
    return [
        `创作需求：${cleanBrief(brief)}。`,
        `采用模板：${template.title.zh}。`,
        `适用方向：${template.useWhen.zh}`,
        "执行要求：",
        ...template.guidance.zh.map((item) => `- ${item}`),
        "避坑约束：",
        ...template.pitfalls.zh.map((item) => `- ${item}`),
        "输出一份可以直接用于图片生成的完整提示词；保留用户指定的主体、文字、比例和参考图约束。",
    ].join("\n");
}

const AWESOME_GPT_IMAGE_2_TEMPLATES: CreativeSkill[] =
    styleLibrary.templates.map((template) => ({
        id: `oss-gpt-image2-${template.id}`,
        name: template.title.zh,
        shortName: template.title.zh,
        target: "image",
        kind: templateKind(template),
        description: template.description.zh,
        tags: [...template.tags, "开源模板"],
        defaultAspectRatio: categoryRatios[template.category] ?? "1:1",
        coverImage: coverPath(template.cover),
        sourceInspiration: `awesome-gpt-image-2:${template.id}`,
        buildPrompt: (brief) => templatePrompt(template, brief),
    }));

const GPT_IMAGE_2_REFERENCE_ATLAS: CreativeSkill = {
    id: "oss-gpt-image2-reference-atlas",
    name: "GPT Image 2 图像导演",
    shortName: "图像导演",
    target: "image",
    kind: "optimizer",
    description:
        "根据需求选择生成、编辑、局部重绘或多参考图模式，再按版式、文字、镜头和材质整理提示词。",
    tags: ["图片", "编辑", "多参考图", "提示优化"],
    defaultAspectRatio: "1:1",
    coverImage: "/skill-covers/awesome-gpt-image-2/case346.jpg",
    sourceInspiration: "wuyoscar/gpt_image_2_skill:gpt-image",
    buildPrompt: (brief) =>
        [
            `用户需求：${cleanBrief(brief)}。`,
            "先判断任务属于 generate、edit、inpaint 或 multi-reference，并保留用户给出的精确文字、比例、参考图和安全约束。",
            "先写画布尺寸、宽高比和版式结构，再写主体；所有必须显示的文字用引号包裹并要求清晰可读、不得乱码。",
            "把主体、构图与布局、视觉风格与材质、光线与色彩、文字与标签、输出格式、负面约束分别写清楚。",
            "多面板画面必须明确网格数量、每格职责以及跨面板的人物身份、服装、色板和镜头连续性。",
            "编辑或多参考图任务必须列出需要保持不变的身份、构图、产品结构、文字和背景元素。",
            "最终只输出一份可以直接提交给图片模型的完整提示词。",
        ].join("\n"),
};

const DEERFLOW_VIDEO_GENERATION: CreativeSkill = {
    id: "oss-deerflow-video-generation",
    name: "DeerFlow 结构化视频生成",
    shortName: "结构化视频",
    target: "video",
    kind: "optimizer",
    description:
        "把视频想法整理成主体、场景、摄影机、动作、对白和声音明确的结构化生成提示词。",
    tags: ["视频", "结构化", "运镜", "参考图"],
    defaultAspectRatio: "16:9",
    defaultDuration: 8,
    coverImage: "/skill-covers/cinematic-director.png",
    sourceInspiration: "bytedance/deer-flow:video-generation",
    buildPrompt: (brief) =>
        [
            `Video request: ${cleanBrief(brief)}`,
            "Create a production-ready English video prompt in structured JSON.",
            "Identify the subject/content, visual style, mood, color palette, aspect ratio, composition, lighting, and how any reference image is used.",
            'Use these top-level fields when applicable: "title", "background", "characters", "camera", "action", "dialogue", "audio", "continuity", and "negative_constraints".',
            "Camera must specify shot type, movement, angle, focus, and timing. Action must be physically ordered and executable.",
            "Keep character identity, wardrobe, object count, screen direction, lighting, and spatial relationships continuous.",
            "Return only the final structured JSON prompt.",
        ].join("\n"),
};

const MULTI_SOURCE_CREATIVE_SKILLS: CreativeSkill[] =
    multiSourceAtlas.entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        shortName: entry.name,
        target: entry.target as CreativeSkill["target"],
        kind: entry.kind as CreativeSkill["kind"],
        description: entry.description,
        tags: entry.tags,
        defaultAspectRatio: entry.defaultAspectRatio,
        defaultDuration:
            "defaultDuration" in entry
                ? (entry.defaultDuration as number)
                : undefined,
        coverImage: entry.cover,
        sourceInspiration: entry.source,
        buildPrompt: (brief) =>
            [
                `当前创作需求：${cleanBrief(brief)}。`,
                "下面是经过开源作者验证的原始 Skill 指令或提示词模板。请保留它的结构、镜头、版式和约束，把示例主题或占位变量替换为当前创作需求。",
                "",
                entry.promptTemplate,
                "",
                "只输出替换完成、可以直接提交给生成模型的最终提示词，不解释模板来源，不保留未填写的占位符。",
            ].join("\n"),
    }));

export const THIRD_PARTY_CREATIVE_SKILLS: CreativeSkill[] = [
    GPT_IMAGE_2_REFERENCE_ATLAS,
    ...AWESOME_GPT_IMAGE_2_TEMPLATES,
    DEERFLOW_VIDEO_GENERATION,
    ...MULTI_SOURCE_CREATIVE_SKILLS,
];
