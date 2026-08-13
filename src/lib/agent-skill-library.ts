export type SeedanceAgentVersion = "2.0" | "2.5";

type AgentSkill = {
    name: string;
    description: string;
    versions?: SeedanceAgentVersion[];
};

/**
 * Agent-only specialist routing derived from public/community Seedance craft
 * patterns. These capabilities are not rendered as recommendation cards.
 */
const AGENT_VIDEO_SKILLS: AgentSkill[] = [
    {
        name: "Seedance 提示词导演",
        description:
            "把想法整理成主体、动作因果、镜头、光线、声音与约束完整的可执行提示词。",
    },
    {
        name: "失败诊断与单变量返修",
        description:
            "区分参数错误、素材限制、内容拦截、动作过载、身份漂移与接口失败，并只修改主要故障变量。",
    },
    {
        name: "多模态参考导演",
        description:
            "为每张图、每段视频和每段音频指定唯一主用途，明确必须保留与禁止迁移的内容。",
    },
    {
        name: "摄影机与镜头语言",
        description:
            "选择可执行景别、焦段感、机位和单一主运镜，让镜头服务动作而不是堆术语。",
    },
    {
        name: "动作与物理连续性",
        description:
            "按初始状态、触发、变化、反应、跟随和落点组织动作，保持重心、接触和惯性可信。",
    },
    {
        name: "角色一致性锁定",
        description:
            "锁定身份、五官、发型、服装、道具归属、人物数量、左右站位和情绪变化。",
    },
    {
        name: "光线与氛围设计",
        description:
            "使用有来源的主光、环境光和天气光，保持时空连续并避免无动机滤镜。",
    },
    {
        name: "声音、对白与口型",
        description:
            "规划对白、音色、口型、环境声、音效、音乐节拍和画面事件的时间对应。",
    },
    {
        name: "视频续写与尾帧衔接",
        description:
            "从已接受片段的实际结束状态继续，不重播已完成动作，保留运动与声音尾巴。",
    },
    {
        name: "视频精准编辑",
        description:
            "分别写清保留项、替换项、删除项、新增项、时间范围和绝不能改变的镜头/动作。",
    },
    {
        name: "长故事分段与连续性",
        description:
            "把长故事拆成状态明确的连续片段，维护人物、空间、道具、光线和剧情进度。",
    },
    {
        name: "VFX 与环境反馈",
        description:
            "让烟、火、水、碎屑、能量和破坏效果具有触发源、传播路径、受力反馈与消散过程。",
    },
    {
        name: "反空话精简",
        description:
            "删除电影级、震撼、高质量等空泛词，改成可见动作、具体材质、光源和镜头行为。",
    },
    {
        name: "版权与人物安全改写",
        description:
            "识别角色、IP、名人、品牌、音乐和真实人脸风险，改成保留创意意图的原创替代。",
    },
    {
        name: "内容过滤安全改写",
        description:
            "定位可能触发审核的词和画面要求，用合规、可执行的表现替代。",
    },
    {
        name: "视觉风格工程",
        description:
            "把风格拆为年代、媒介、材质、轮廓、配色、光线和运动规律，避免只写作品名。",
    },
    {
        name: "商业广告与类型片配方",
        description:
            "按商品广告、短剧、旅拍、纪录片、动作片、动画和音乐视频选择结构与节奏。",
    },
    {
        name: "中文镜头词汇与压缩",
        description:
            "用清楚的中文制作语言表达镜头、动作、灯光、声音和限制，保持提示词紧凑。",
    },
    {
        name: "2.0 全能参考编排",
        versions: ["2.0"],
        description:
            "用 @素材名 指定图片、视频、音频的角色、镜头、动作、节奏或声音用途，并控制总素材数量。",
    },
    {
        name: "2.0 延长与编辑时间线",
        versions: ["2.0"],
        description:
            "用分秒时间线写原片保留段、续写/编辑段、情绪、动作落点、配乐和连贯性。",
    },
    {
        name: "2.5 专用编辑参数检查",
        versions: ["2.5"],
        description:
            "识别视频编辑任务，强制使用 adaptive 比例与 -1 时长，并检查源视频 4–30 秒要求。",
    },
    {
        name: "2.5 局部编辑合同",
        versions: ["2.5"],
        description:
            "写清局部修改对象与时间范围，同时锁定原视频构图、运镜、动作节奏和无需改变的区域。",
    },
];

export function agentVideoSkillDigest(version: SeedanceAgentVersion): string {
    return AGENT_VIDEO_SKILLS.filter(
        (skill) => !skill.versions || skill.versions.includes(version),
    )
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join("\n");
}

export function seedanceVersionRules(version: SeedanceAgentVersion): string[] {
    if (version === "2.0") {
        return [
            "当前目标明确为 Seedance 2.0，不得套用 2.5 的专用编辑参数。",
            "2.0 支持文本、图片、视频、音频多模态组合；图片最多 9 张且单个小于 30MB。",
            "2.0 参考视频最多 3 个，总时长 2-15 秒，单个文件小于 50MB；音频最多 3 个，总时长不超过 15 秒且单个小于 15MB。",
            "混合输入总上限 12 个文件；输出时长可选 4-15 秒。",
            "仅首帧或首尾帧需求可用首尾帧入口；图/视频/音频组合必须按全能参考编排。",
            "提示词必须用 @素材名 明确每个素材的用途，例如角色身份、首帧、动作、镜头语言、特效、配乐或节奏，不允许只罗列附件。",
            "编辑、延长和复杂多参任务优先写分秒时间线、主体编号、情绪变化、动作因果、配乐与原片保留项。",
            "即梦入口当前会拦截包含清晰写实真人脸的图片或视频参考素材，遇到此类需求要提前提示。",
        ];
    }
    return [
        "当前目标明确为 Seedance 2.5，不得套用 2.0 的 4-15 秒输出与 12 个文件限制。",
        "先判断是普通生成/参考生成还是 Seedance 2.5 专用视频编辑，不能混用请求参数。",
        "2.5 视频编辑任务的输出比例必须为 adaptive，duration 必须为 -1，输出比例和时长跟随模型选中的输入视频。",
        "2.5 编辑模式选中的源视频必须满足 4-30 秒；不满足时先指出素材问题，不要只改提示词。",
        "编辑提示词要明确：保留什么、修改什么、修改发生在哪个时间段、哪些人物/动作/运镜/背景绝不能改变。",
        "普通生成或参考生成不要误用 duration=-1；只在模型识别为视频编辑任务时使用专用参数。",
    ];
}
