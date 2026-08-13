import type { Edge, Node } from "@xyflow/react";
import {
    agentVideoSkillDigest,
    type SeedanceAgentVersion,
    seedanceVersionRules,
} from "@/lib/agent-skill-library";
import { CREATIVE_SKILLS } from "@/lib/creative-skills";

export type CanvasAgentMode = "chat" | "troubleshoot" | "draft";
export type CanvasAgentTarget = "video" | "image";

type CanvasAgentContextOptions = {
    nodes: Node[];
    edges: Edge[];
    selectedNodes: Node[];
    userBrief: string;
    mode: CanvasAgentMode;
    target: CanvasAgentTarget;
    videoVersion: SeedanceAgentVersion;
};

function textValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item) => textValue(item))
            .filter(Boolean)
            .join(" / ");
    }
    return "";
}

function firstNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
        const next = Number(value);
        if (Number.isFinite(next) && next > 0) return next;
    }
    return undefined;
}

function nodeTitle(node: Node): string {
    const data = (node.data ?? {}) as Record<string, unknown>;
    return (
        textValue(data.label) ||
        textValue(data.fileName) ||
        textValue(data.title) ||
        node.type ||
        node.id
    );
}

function nodePrompt(data: Record<string, unknown>): string {
    return (
        textValue(data.text) ||
        textValue(data.query) ||
        textValue((data.prompt as Record<string, unknown> | undefined)?.text) ||
        textValue(
            (data.prompt as Record<string, unknown> | undefined)?.userPrompt,
        )
    );
}

function mediaKind(node: Node): string {
    const type = String(node.type ?? "");
    if (type.toLowerCase().includes("video")) return "video";
    if (type.toLowerCase().includes("audio")) return "audio";
    if (type.toLowerCase().includes("image")) return "image";
    if (type.toLowerCase().includes("text")) return "text";
    return "node";
}

function summarizeNode(node: Node, prefix = "- "): string {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const prompt = nodePrompt(data);
    const fileKeys = Array.isArray(data.fileKeys) ? data.fileKeys.length : 0;
    const texts = Array.isArray(data.texts) ? data.texts.length : 0;
    const duration = firstNumber(data.duration, data.selectedDuration);
    const parts = [
        `${prefix}${nodeTitle(node)} (${node.type ?? "node"}, ${mediaKind(node)})`,
        textValue(data.pluginId) ? `plugin=${textValue(data.pluginId)}` : "",
        textValue(data.pluginModel)
            ? `model=${textValue(data.pluginModel)}`
            : "",
        textValue(data.mode) ? `mode=${textValue(data.mode)}` : "",
        duration ? `duration=${duration}s` : "",
        textValue(data.selectedAspectRatio)
            ? `ratio=${textValue(data.selectedAspectRatio)}`
            : "",
        fileKeys ? `files=${fileKeys}` : "",
        texts ? `texts=${texts}` : "",
        textValue(data.comment) ? `comment=${textValue(data.comment)}` : "",
        prompt ? `prompt="${prompt.slice(0, 1200)}"` : "",
    ].filter(Boolean);
    return parts.join("; ");
}

function connectedReferenceSummary(
    nodes: Node[],
    edges: Edge[],
    selectedNodes: Node[],
): string {
    const selectedVideoIds = new Set(
        selectedNodes
            .filter((node) => mediaKind(node) === "video")
            .map((node) => node.id),
    );
    const incomingIds = new Set<string>();
    for (const edge of edges) {
        if (selectedVideoIds.has(edge.target)) incomingIds.add(edge.source);
    }
    const incoming = nodes.filter((node) => incomingIds.has(node.id));
    if (!selectedVideoIds.size)
        return "未选择视频节点；图片及其他节点不追溯上游参考。";
    if (!incoming.length) return "所选视频节点没有检测到上游参考素材。";
    return [
        "用于生成所选视频节点的上游参考素材：",
        incoming.map((node) => summarizeNode(node)).join("\n"),
    ].join("\n");
}

function skillDigest(target: CanvasAgentTarget): string {
    return CREATIVE_SKILLS.filter((skill) => skill.target === target)
        .map(
            (skill) =>
                `- ${skill.name}: ${skill.description}; tags=${skill.tags
                    .slice(0, 5)
                    .join("/")}`,
        )
        .join("\n");
}

export function buildCanvasAgentInput(options: CanvasAgentContextOptions) {
    const selected = options.selectedNodes;
    return [
        `用户输入：${options.userBrief.trim() || "用户没有补充说明，请仅根据画布上下文判断。"}`,
        `目标模型：${options.target === "video" ? `Seedance ${options.videoVersion}` : "图片生成"}`,
        "",
        "当前选中节点：",
        selected.map((node) => summarizeNode(node)).join("\n") ||
            "无选中节点。",
        "",
        "连接关系（只追溯所选视频节点的入站参考素材）：",
        connectedReferenceSummary(
            options.nodes,
            options.edges,
            options.selectedNodes,
        ),
    ].join("\n");
}

export function buildCanvasAgentInstruction({
    mode,
    target,
    videoVersion,
}: {
    mode: CanvasAgentMode;
    target: CanvasAgentTarget;
    videoVersion: SeedanceAgentVersion;
}) {
    const targetLabel =
        target === "video" ? `Seedance ${videoVersion} 视频` : "图片生成";
    const taskLine =
        mode === "chat"
            ? `任务：直接回答用户关于${targetLabel}创作、提示词写法、参数、工作流或生成问题的询问；不要求用户选择画布节点。`
            : mode === "troubleshoot"
              ? `任务：根据用户遇到的生成问题和画布节点上下文，诊断失败原因，并重写一版更稳的${targetLabel}提示词。`
              : `任务：根据用户提供的想法、选中节点和参考素材摘要，从零撰写一版可直接提交的${targetLabel}提示词。`;
    const outputRule =
        mode === "chat"
            ? "输出结构：直接、具体地回答问题；如果用户要求提示词，再提供【可直接使用的提示词】，不要强行套用固定格式。"
            : mode === "troubleshoot"
              ? "输出结构：先用 3-5 条短句说明具体问题和改法，然后给出【可直接使用的提示词】。"
              : "输出结构：只给出【可直接使用的提示词】，必要时在末尾加一行【参考素材使用说明】。";

    return [
        "你是 dianmeng 无限画布里的 AIGC Agent 助手，负责帮助用户把节点、参考素材和失败反馈转成可执行的提示词。",
        taskLine,
        "",
        "内置完整创作 Skill 库：",
        skillDigest(target),
        target === "video" ? "" : null,
        target === "video" ? `Seedance ${videoVersion} 专项 Skill：` : null,
        target === "video" ? agentVideoSkillDigest(videoVersion) : null,
        target === "video" ? "" : null,
        target === "video" ? `Seedance ${videoVersion} 版本规则：` : null,
        ...(target === "video"
            ? seedanceVersionRules(videoVersion).map((rule) => `- ${rule}`)
            : []),
        "",
        "工作要求：",
        "- 必须具体分析当前上下文，不要套用通用模板。",
        "- 如果请求中包含视觉附件，必须先观察图片原图或视频开头/中段/结尾关键帧，再结合节点文字分析；要区分实际观察与用户描述。",
        "- 如果视觉附件读取失败或接口不支持视觉输入，必须明确说明没有看懂画面，绝不能假装看过图片或视频。",
        "- 视频提示词要明确主体、动作起点-过程-结果、场景、镜头、光线、声音和连续性约束。",
        "- 图片提示词要明确主体、构图、材质/风格、光线、文字约束、参考图保留项和禁止项。",
        "- 遇到版权、人物/IP、违规、比例/时长参数、素材不满足 4-30 秒等问题，要给出可执行的替代写法。",
        outputRule,
    ]
        .filter((line): line is string => line !== null)
        .join("\n");
}
