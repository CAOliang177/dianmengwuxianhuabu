import { EXTENDED_CREATIVE_SKILLS } from "@/lib/creative-skill-extensions";
import { CREATIVE_SKILL_PACK_30 } from "@/lib/creative-skill-pack-30";
import { CREATIVE_SKILL_PACK_50 } from "@/lib/creative-skill-pack-50";
import { CREATIVE_SKILL_PACK_72 } from "@/lib/creative-skill-pack-72";

export type CreativeSkillTarget = "image" | "video";
export type CreativeSkillKind = "optimizer" | "style";

export interface CreativeSkill {
    id: string;
    name: string;
    shortName: string;
    target: CreativeSkillTarget;
    kind: CreativeSkillKind;
    description: string;
    tags: string[];
    defaultAspectRatio: string;
    defaultDuration?: number;
    sourceInspiration?: string;
    buildPrompt: (brief: string) => string;
}

const cleanBrief = (brief: string) => brief.trim().replace(/\s+/g, " ");

const imagePrompt = (
    brief: string,
    direction: string,
    composition: string,
    lighting: string,
    texture: string,
    constraints: string,
) =>
    [
        `画面主题：${cleanBrief(brief)}。`,
        `视觉方向：${direction}。`,
        `构图与镜头：${composition}。`,
        `光线与色彩：${lighting}。`,
        `材质与细节：${texture}。`,
        `生成约束：${constraints}。`,
    ].join("\n");

const videoPrompt = (
    brief: string,
    opening: string,
    action: string,
    camera: string,
    ending: string,
    constraints: string,
) =>
    [
        `视频主题：${cleanBrief(brief)}。`,
        `开场：${opening}。`,
        `主体动作与环境变化：${action}。`,
        `镜头设计：${camera}。`,
        `结尾：${ending}。`,
        `连续性约束：${constraints}。`,
    ].join("\n");

/**
 * Curated, independently written creative helpers inspired by the public
 * capability descriptions of popular visual-creation Skills. No third-party
 * Skill prompt body is copied or required at runtime.
 */
export const CREATIVE_SKILLS: CreativeSkill[] = [
    {
        id: "image-prompt-director",
        name: "图片提示词导演",
        shortName: "图片导演",
        target: "image",
        kind: "optimizer",
        description:
            "把一句大白话整理成主体、环境、镜头、光线和材质完整的生图提示词。",
        tags: ["通用", "文生图", "提示词优化"],
        defaultAspectRatio: "1:1",
        sourceInspiration: "/image-prompt-builder",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "先明确唯一视觉主体、正在发生的动作、人物情绪与场景关系，保持信息层级清楚",
                "选择与叙事相符的景别和焦段，建立前景、中景、背景，避免主体机械居中",
                "使用有明确来源的主光、环境光和反射光，控制高光不过曝、阴影仍有细节",
                "保留真实材质响应、细小磨损和自然纹理，细节丰富但不过度锐化",
                "不添加文字、水印、边框、重复肢体、漂浮物体或无关装饰；主体身份和数量必须稳定",
            ),
    },
    {
        id: "cinematic-image",
        name: "电影感画面专业生成",
        shortName: "电影感",
        target: "image",
        kind: "optimizer",
        description:
            "把普通描述转换为像电影截图一样自然、克制、有故事余韵的画面。",
        tags: ["电影", "写实", "氛围"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/cinematic-image-transformer",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "捕捉事件发生前后最有悬念的一瞬，人物动作没有摆拍感，情绪通过细微反应呈现",
                "真实可到达的观察机位，35–65mm 镜头感，略微偏心构图，空间关系和视线方向可信",
                "现场动机光，明暗过渡柔和，肤色自然，色彩克制，允许轻微混合色温",
                "真实皮肤、织物、玻璃和金属反应，轻微胶片颗粒与自然景深",
                "避免商业海报构图、英雄式站姿、塑料皮肤、过强轮廓光、青橙滤镜、假虚化、文字和水印",
            ),
    },
    {
        id: "visual-asset-builder",
        name: "美术资产提示词生成",
        shortName: "资产设定",
        target: "image",
        kind: "optimizer",
        description: "把人物、场景或道具整理成可复用的统一设定图提示词。",
        tags: ["角色", "场景", "道具"],
        defaultAspectRatio: "3:2",
        sourceInspiration: "/visual-asset-prompt-builder",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "以制作可复用美术资产为目标，明确造型轮廓、年代、材质、主色、功能和辨识点",
                "干净中性背景，统一视平线与比例；主体完整可见，必要时呈现正面、侧面、背面和关键细节",
                "柔和棚拍式中性光，不用戏剧化滤镜，确保颜色和材质可准确读取",
                "结构清晰、比例一致、边缘干净，细节服务于角色或物件身份而非随机堆叠",
                "不同视角必须保持同一身份、服装、纹理和尺寸关系；无文字、无水印、无多余主体",
            ),
    },
    {
        id: "product-commercial-image",
        name: "高质感商品广告图",
        shortName: "商品广告",
        target: "image",
        kind: "optimizer",
        description: "围绕商品卖点生成干净、真实、可用于商业视觉的广告画面。",
        tags: ["商品", "广告", "电商"],
        defaultAspectRatio: "4:5",
        sourceInspiration: "/luxury-brand-tvc-creator",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "商品是唯一核心，准确保持外形、材质、颜色和品牌结构，用一个明确场景隐喻表达卖点",
                "高级静物摄影构图，留出合理呼吸空间，使用真实焦段和受控景深",
                "大面积柔光塑造轮廓，局部高光解释材质，背景色与商品形成克制对比",
                "表面干净但保留真实微纹理，玻璃、金属、织物和液体遵守真实物理反射",
                "不擅自生成文字或商标，不改变商品结构，不堆叠廉价粒子、光效和无关道具",
            ),
    },
    {
        id: "video-prompt-director",
        name: "视频提示词全风格引擎",
        shortName: "视频导演",
        target: "video",
        kind: "optimizer",
        description:
            "将模糊想法整理成主体动作、运镜、节奏、声音和连续性明确的视频提示词。",
        tags: ["通用", "视频", "运镜"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        sourceInspiration: "/video-prompt-builder",
        buildPrompt: (brief) =>
            videoPrompt(
                brief,
                "用一个清楚的建立镜头交代人物、地点、时间和当前状态，不从无意义空镜开始",
                "动作按因果顺序推进，每一拍只安排一个主要变化，同时描述衣物、头发、烟尘或水面的自然次级运动",
                "使用一条可执行的摄影机路径，先稳定观察，再在关键动作处缓慢推进或跟随，速度平滑",
                "以动作完成后的短暂停顿或明确视觉落点收束，给剪辑留下可用尾帧",
                "保持人物身份、服装、物体数量、空间方向和光线连续；避免瞬移、变形、闪烁、穿模、突然换景和无理由镜头抖动",
            ),
    },
    {
        id: "image-to-video-director",
        name: "图生视频导演",
        shortName: "图生视频",
        target: "video",
        kind: "optimizer",
        description:
            "把参考图当作首帧锚点，只增加合理动作和镜头运动，减少变形与漂移。",
        tags: ["图生视频", "首帧", "稳定"],
        defaultAspectRatio: "16:9",
        defaultDuration: 6,
        sourceInspiration: "/image-to-video-prompt",
        buildPrompt: (brief) =>
            videoPrompt(
                brief,
                "严格从参考图现有构图开始，人物身份、姿势、服装、道具、背景布局和光线保持一致",
                "先让主体做幅度小且可逆的自然动作，再推进一个清晰主动作；环境只产生与风、重力和接触关系一致的运动",
                "镜头从锁定或极慢推进开始，避免突然旋转和大幅变焦；主体运动方向与画面空间一致",
                "停在稳定、清晰、可继续衔接的画面，不新增人物或关键物体",
                "不重绘脸部、不更换服装、不改变物体数量与背景结构；避免肢体增生、局部融化、纹理游动、曝光闪烁和帧间跳变",
            ),
    },
    {
        id: "storyboard-video",
        name: "专业分镜视频提示词",
        shortName: "分镜规划",
        target: "video",
        kind: "optimizer",
        description: "把一段故事拆成可直接生成的三镜头短片结构。",
        tags: ["分镜", "叙事", "短片"],
        defaultAspectRatio: "16:9",
        defaultDuration: 15,
        sourceInspiration: "/storyboard-prompt-generator",
        buildPrompt: (brief) =>
            [
                `故事目标：${cleanBrief(brief)}。`,
                "镜头1（0–4秒，建立）：交代人物、地点、时间和冲突前状态；使用稳定广角或中景，给出清楚空间方向。",
                "镜头2（4–10秒，发展）：人物执行一个可见动作并触发环境或另一人物的反应；镜头跟随动作但不越轴。",
                "镜头3（10–15秒，落点）：用近景或更克制的构图呈现结果和情绪余韵，结尾保留稳定尾帧。",
                "每个镜头都写清主体动作、摄影机运动、环境运动和光线；镜头之间保持身份、服装、道具、方位和色彩连续。",
                "避免抽象形容词堆砌、同时发生过多动作、突然换景、人物变形、闪烁、穿模、字幕和水印。",
            ].join("\n"),
    },
    {
        id: "action-video",
        name: "动作戏视频提示词",
        shortName: "动作戏",
        target: "video",
        kind: "optimizer",
        description:
            "强化动作因果、重心、接触点和镜头安全区，减少打斗混乱与穿模。",
        tags: ["动作", "打斗", "节奏"],
        defaultAspectRatio: "21:9",
        defaultDuration: 10,
        sourceInspiration: "/action-scene-prompt-builder",
        buildPrompt: (brief) =>
            videoPrompt(
                brief,
                "先用中远景明确双方位置、距离、地面和可互动障碍物",
                "动作按“准备—发力—接触—受力—恢复重心”展开，每次只突出一个关键攻防；衣物和碎屑遵循惯性与重力",
                "摄影机保持可读性，横向跟随主动作，冲击瞬间短促加速后立即稳定，不绕轴、不遮挡关键接触点",
                "双方回到清楚的落脚位置，以一个可辨识姿态结束",
                "保持人物身份、左右方位、武器数量和受伤状态连续；避免肢体增生、身体穿透、无接触受力、漂浮和无意义慢动作",
            ),
    },
    {
        id: "retro-film-ad",
        name: "复古胶片广告",
        shortName: "复古广告",
        target: "video",
        kind: "style",
        description: "80–90 年代电视广告气质，带真实胶片和模拟录像质感。",
        tags: ["复古", "广告", "胶片"],
        defaultAspectRatio: "4:3",
        defaultDuration: 12,
        sourceInspiration: "/retro-film-ad-director",
        buildPrompt: (brief) =>
            videoPrompt(
                brief,
                "以老电视广告式直接视觉钩子开场，商品或人物立刻可辨识",
                "表演略带年代感但不夸张，使用实拍道具和简单机械转场，节奏轻快",
                "4:3 取景，固定机位、推拉摇移和少量手持混合，模拟真实老镜头呼吸而非数字滤镜抖动",
                "停在清楚的商品或人物动作落点，不自动生成品牌文字",
                "暖色胶片偏色、柔和高光、轻微颗粒和模拟录像边缘；保持主体结构稳定，避免现代霓虹、过度锐化、随机字幕和水印",
            ),
    },
    {
        id: "symmetry-whimsy",
        name: "对称糖果电影美学",
        shortName: "对称美学",
        target: "image",
        kind: "style",
        description: "精确对称、柔和糖果配色、舞台化空间和克制幽默感。",
        tags: ["对称", "糖果色", "电影"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/wes-anderson-aesthetics",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "舞台化但仍可信的奇趣世界，人物表情克制，日常细节带轻微冷幽默",
                "正面轴线、精确几何对称、层次平直，使用广角但控制透视畸变",
                "低对比柔光，粉彩、芥末黄、湖蓝与酒红组成有限色盘，颜色块清楚",
                "手工布景、旧木、织物、纸张和搪瓷质感，细节整齐但保留真实磨损",
                "避免仿制具体电影角色或场景，不使用品牌、文字、水印、过度饱和、强烈景深和随机科幻元素",
            ),
    },
    {
        id: "brutalist-sci-fi",
        name: "粗野主义科幻",
        shortName: "粗野科幻",
        target: "image",
        kind: "style",
        description: "纪念碑式混凝土、巨大尺度和冷峻工业秩序。",
        tags: ["建筑", "科幻", "冷峻"],
        defaultAspectRatio: "21:9",
        sourceInspiration: "/cuyezhuyi",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "冷峻、压迫、纪念碑式的近未来现实主义，强调人与巨型结构的尺度对比",
                "低机位超广角或远距离长焦，几何体块占据主要画面，人物作为尺度参照",
                "阴天漫射光、冷灰水泥与氧化金属色，少量安全灯作为局部暖色",
                "粗糙混凝土、模板孔、雨痕、锈蚀、管线和真实施工接缝清晰可见",
                "遵守结构受力和空间透视，避免悬浮建筑、霓虹赛博朋克堆砌、塑料表面、文字和水印",
            ),
    },
    {
        id: "stylized-3d-animation",
        name: "电影级 3D 动画",
        shortName: "3D 动画",
        target: "image",
        kind: "style",
        description: "亲和的角色造型、清晰剪影、电影级灯光和可动画的三维材质。",
        tags: ["3D", "动画", "角色"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/3d-stylized-animation-director",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "原创高品质三维动画电影美术，形体简化但情绪真实，角色轮廓和表情清楚",
                "适合动画表演的中景或全身构图，角色重心可信，场景道具服务于故事",
                "柔和大面积主光、温暖轮廓分离和可读阴影，综合色彩统一",
                "皮肤、布料、毛发和道具采用风格化 PBR 材质，边缘圆润但不过分玩具化",
                "保持原创设计，不模仿具体工作室角色；避免塑料质感、过度大眼、僵硬姿势、重复肢体、文字和水印",
            ),
    },
    {
        id: "chinese-art-animation",
        name: "东方传统美术动画",
        shortName: "东方美术",
        target: "image",
        kind: "style",
        description: "水墨、剪纸和工笔质感融合的东方传统动画画面。",
        tags: ["水墨", "剪纸", "东方"],
        defaultAspectRatio: "4:3",
        sourceInspiration: "/shanghai-art-animation-generator",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "东方传统美术动画气质，以水墨留白、工笔线条和剪纸色块组织原创画面",
                "散点透视与平面化层次结合，动作轮廓简洁有韵律，留白参与叙事",
                "宣纸底色、墨色浓淡和矿物色点缀，光影转化为笔墨层次而非写实摄影棚光",
                "可见纸纤维、干湿笔触、手工套色轻微错位，保持画面清晰",
                "尊重传统视觉逻辑但不复刻具体影片或角色；避免现代 3D 塑料感、照片写实、文字、水印和杂乱纹样",
            ),
    },
    {
        id: "retro-space-opera",
        name: "复古太空歌剧插画",
        shortName: "太空歌剧",
        target: "image",
        kind: "style",
        description: "60–80 年代科幻封面感，手绘喷绘、宏大尺度与浪漫太空想象。",
        tags: ["科幻", "复古", "插画"],
        defaultAspectRatio: "3:2",
        sourceInspiration: "/fugugejudaoyan",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "原创复古太空歌剧世界，宏大探索感与人类尺度并存，设计语言来自模拟时代而非现代电竞审美",
                "经典科幻书封式三角构图，巨大星体、飞船和人物形成明确尺度层级",
                "深靛蓝、橙红与金色的有限色盘，戏剧化逆光像手绘喷绘而非数字光污染",
                "丙烯喷绘、纸张颗粒、手绘边缘和轻微印刷套色感，机械结构完整可信",
                "不复刻现有科幻 IP、飞船或角色；避免现代 UI、霓虹赛博朋克、随机文字、商标和水印",
            ),
    },
    {
        id: "apocalyptic-realism",
        name: "冷峻末日写实",
        shortName: "末日写实",
        target: "image",
        kind: "style",
        description: "克制冷色、真实损坏和安静压迫感，不依赖廉价恐怖滤镜。",
        tags: ["末日", "写实", "氛围"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/grim-apocalyptic-realism",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "现实世界长期失序后的安静压迫感，灾难痕迹由环境事实表达，不依赖怪物或血腥",
                "观察式广角构图，人物较小，废弃空间、天气和行动路线共同讲故事",
                "冷色阴天或低角度冬日光，低饱和、深阴影可读，空气中有真实湿度和尘埃",
                "剥落墙面、积水、锈蚀、旧布料和自然侵蚀遵循时间逻辑，人物装备实用且有磨损",
                "避免滤镜式恐怖、过量雾气、随机火焰、末日文字、僵尸堆叠、CG 塑料感和水印",
            ),
    },
    {
        id: "oriental-fantasy",
        name: "东方仙侠幻想",
        shortName: "东方仙侠",
        target: "image",
        kind: "style",
        description: "传统山水空间、克制超自然元素与有重量感的衣袍动作。",
        tags: ["仙侠", "古风", "幻想"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/oriental-fantasy-short-animator",
        buildPrompt: (brief) =>
            imagePrompt(
                brief,
                "东方山水与原创幻想设定融合，人物有明确身份和行动目标，超自然元素克制且有规则",
                "山水长卷式纵深结合电影景别，前景松石、中景人物、远景云山形成层次",
                "清晨或暮色自然光，青绿、墨蓝、赭石和少量金色，体积雾服从地形",
                "丝麻衣袍、石壁、木构与水汽真实，衣摆和发丝受重力与风向影响",
                "不复制现有仙侠 IP、服装或角色；避免廉价游戏 UI、无重力飘带、光效堆砌、文字和水印",
            ),
    },
    {
        id: "documentary-video",
        name: "纪录片真实短片",
        shortName: "纪录片",
        target: "video",
        kind: "style",
        description: "观察式摄影、自然行动和真实环境声逻辑的纪录片提示词。",
        tags: ["纪录片", "写实", "人物"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        sourceInspiration: "/documentary-short-film-maker",
        buildPrompt: (brief) =>
            videoPrompt(
                brief,
                "从真实环境中的日常动作开始，不让人物正对镜头表演，先交代空间和正在进行的工作",
                "人物按真实节奏完成动作，允许停顿、呼吸和小失误；环境中同时存在细微但合理的生活运动",
                "肩扛或稳定手持观察，35–50mm 自然视角，在不打扰主体的位置缓慢跟随，偶尔轻微重新构图",
                "以一个自然动作或环境声音的余韵结束，不强行制造戏剧高潮",
                "使用现场光和环境声逻辑，保持时间、服装、人物位置连续；避免广告摆拍、磨皮、夸张慢动作、穿模、闪烁、字幕和水印",
            ),
    },
    ...EXTENDED_CREATIVE_SKILLS,
    ...CREATIVE_SKILL_PACK_50,
    ...CREATIVE_SKILL_PACK_30,
    ...CREATIVE_SKILL_PACK_72,
];

export function getCreativeSkill(skillId: string): CreativeSkill | undefined {
    return CREATIVE_SKILLS.find((skill) => skill.id === skillId);
}

export function buildCreativeSkillPrompt(
    skillId: string,
    brief: string,
): string {
    const skill = getCreativeSkill(skillId);
    if (!skill) throw new Error(`Unknown creative skill: ${skillId}`);
    if (!brief.trim()) return "";
    return skill.buildPrompt(brief);
}
