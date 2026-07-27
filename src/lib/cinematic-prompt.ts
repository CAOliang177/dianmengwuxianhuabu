export interface CinematicPromptOptions {
    brief: string;
    storyMoment: string;
    camera: string;
    lighting: string;
    aspectRatio: string;
    extraAvoid?: string;
}

export interface CinematicPromptResult {
    interpretation: string;
    prompt: string;
    avoid: string;
}

const STORY_MOMENTS: Record<string, { zh: string; en: string }> = {
    unfolding: {
        zh: "事件正在发生，人物动作尚未完成",
        en: "the action is caught mid-gesture, with the outcome still unresolved",
    },
    before: {
        zh: "关键事件发生前一刻，画面保留悬念",
        en: "the frame holds the quiet instant just before the decisive event",
    },
    after: {
        zh: "事件刚结束，环境和人物仍留有余波",
        en: "the decisive event has just passed, leaving visible physical and emotional aftermath",
    },
    interrupted: {
        zh: "日常动作被突然打断，人物自然反应",
        en: "an ordinary action has just been interrupted, prompting an unpolished human reaction",
    },
};

const CAMERAS: Record<string, { zh: string; en: string }> = {
    observer: {
        zh: "自然观察机位",
        en: "an eye-level 40mm observational camera placed where a real witness could stand",
    },
    environment: {
        zh: "带环境的广角镜头",
        en: "a restrained 28mm wide shot from a physically accessible corner, preserving the surrounding space",
    },
    intimate: {
        zh: "克制的近景",
        en: "a close 65mm camera at the subject's eye line, intimate without becoming a portrait advertisement",
    },
    distant: {
        zh: "远距离长焦观察",
        en: "a distant 100mm camera observing through layered foreground objects with natural compression",
    },
    low: {
        zh: "轻微低机位",
        en: "a modest low-angle 35mm camera, grounded near waist height rather than heroically exaggerated",
    },
};

const LIGHTING: Record<string, { zh: string; en: string }> = {
    available: {
        zh: "现场自然光",
        en: "available light motivated by the visible location, with uneven exposure and believable falloff",
    },
    window: {
        zh: "柔和窗光",
        en: "soft directional window light as the clear key, balanced by dim ambient room spill",
    },
    overcast: {
        zh: "阴天漫射光",
        en: "cool overcast daylight with broad soft shadows and restrained contrast",
    },
    night: {
        zh: "夜间实景灯光",
        en: "practical street and interior lamps shaping the faces, with mixed color temperatures and deep but readable shadows",
    },
    dawn: {
        zh: "清晨低角度光",
        en: "low early-morning light grazing real surfaces, supported by cool residual skylight",
    },
};

const BASE_AVOID = [
    "commercial advertising composition",
    "poster layout",
    "centered hero pose",
    "perfect symmetry",
    "beauty retouching",
    "plastic skin",
    "over-clean wardrobe",
    "glossy CGI surfaces",
    "fantasy glow",
    "unmotivated rim light",
    "excessive teal-orange grading",
    "crushed blacks",
    "over-sharpening",
    "fake depth of field",
    "floating props",
    "text or watermark",
];

export function buildCinematicPrompt(
    options: CinematicPromptOptions,
): CinematicPromptResult {
    const brief = options.brief.trim();
    const moment = STORY_MOMENTS[options.storyMoment] ?? STORY_MOMENTS.unfolding;
    const camera = CAMERAS[options.camera] ?? CAMERAS.observer;
    const light = LIGHTING[options.lighting] ?? LIGHTING.available;
    const ratio =
        options.aspectRatio === "auto"
            ? "the aspect ratio should follow the connected reference image"
            : `compose for a ${options.aspectRatio} frame`;
    const extraAvoid = options.extraAvoid
        ?.split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const avoid = [...BASE_AVOID, ...(extraAvoid ?? [])].join(", ");

    return {
        interpretation: `以“${brief}”为画面事实，选择${moment.zh}；采用${camera.zh}，由${light.zh}完成照明。画面强调真实空间、动作余韵和可解释的光线，不做海报式摆拍。`,
        prompt: [
            "A restrained, physically believable live-action cinematic still.",
            `Scene facts supplied by the creator: ${brief}.`,
            `Capture the exact story beat where ${moment.en}.`,
            "Show one concrete action and a subtle reaction; include environmental traces that imply what happened immediately before and what may happen next.",
            `Use ${camera.en}.`,
            "Build clear foreground, midground, and background depth with slightly off-center, observational composition and plausible object placement.",
            `Light the scene with ${light.en}.`,
            "Preserve real material response, natural facial detail, small imperfections, restrained color, gentle highlight roll-off, subtle film grain, and realistic atmospheric depth.",
            `${ratio}.`,
        ].join(" "),
        avoid,
    };
}

export const CINEMATIC_STORY_MOMENTS = STORY_MOMENTS;
export const CINEMATIC_CAMERAS = CAMERAS;
export const CINEMATIC_LIGHTING = LIGHTING;

