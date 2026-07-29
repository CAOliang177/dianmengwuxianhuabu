import type { CreativeSkill } from "@/lib/creative-skills";

type SkillSeed = Omit<CreativeSkill, "buildPrompt"> & {
    direction: string;
    camera: string;
    finish: string;
    constraints: string;
};

const clean = (brief: string) => brief.trim().replace(/\s+/g, " ");

function imageSkill(seed: SkillSeed): CreativeSkill {
    return {
        ...seed,
        buildPrompt: (brief) =>
            [
                `创作目标：${clean(brief)}。`,
                `美术方向：${seed.direction}。`,
                `构图与镜头：${seed.camera}。`,
                `光线、材质与完成度：${seed.finish}。`,
                `必须遵守：${seed.constraints}。`,
            ].join("\n"),
    };
}

function videoSkill(seed: SkillSeed): CreativeSkill {
    return {
        ...seed,
        buildPrompt: (brief) =>
            [
                `视频主题：${clean(brief)}。`,
                `导演方向：${seed.direction}。`,
                `动作与摄影机：${seed.camera}。`,
                `节奏与收尾：${seed.finish}。`,
                `连续性约束：${seed.constraints}。`,
            ].join("\n"),
    };
}

/**
 * Additional original implementations based on public capability categories
 * commonly found in visual-creation Skill marketplaces.
 */
export const EXTENDED_CREATIVE_SKILLS: CreativeSkill[] = [
    imageSkill({
        id: "casting-director",
        name: "角色选角导演",
        shortName: "智能选角",
        target: "image",
        kind: "optimizer",
        description: "根据故事、年龄和气质生成统一可复用的角色候选设定。",
        tags: ["选角", "角色", "设定"],
        defaultAspectRatio: "3:2",
        sourceInspiration: "/casting-director",
        direction:
            "先提取角色年龄、职业、生活经历、性格矛盾和地域线索，再设计三位差异明确但都符合剧本的原创候选角色",
        camera: "中性背景角色板，正面半身与自然全身并列，镜头高度一致，五官、体态和服装可清楚比较",
        finish: "柔和中性光、自然肤质和真实衣料，不做明星写真式磨皮；每位候选保持独立辨识点",
        constraints:
            "不复刻现实演员或现有影视角色；候选之间不得换脸或共用服装，禁止文字、水印和多余肢体",
    }),
    imageSkill({
        id: "reference-style-extractor",
        name: "参考图风格提取",
        shortName: "风格提取",
        target: "image",
        kind: "optimizer",
        description: "把参考图拆成配色、笔触、光线、材质和构图规则，方便迁移。",
        tags: ["参考图", "风格", "迁移"],
        defaultAspectRatio: "1:1",
        sourceInspiration: "/acong-style-extractor",
        direction:
            "保留用户主题，只迁移参考图的色彩结构、边缘处理、笔触密度、材质语言、光比和空间层次，不复制具体人物或场景",
        camera: "沿用参考风格的构图节奏，但根据新主题重新安排主体位置和视线，不机械套用原画内容",
        finish: "明确主色、辅色、高光色和表面纹理；统一锐度、颗粒、对比度与景深逻辑",
        constraints:
            "身份、姿势和物体来自新主题；只迁移抽象视觉属性，不复刻水印、文字、商标或受保护角色",
    }),
    imageSkill({
        id: "character-concept-board",
        name: "概念角色设计板",
        shortName: "角色设计",
        target: "image",
        kind: "optimizer",
        description: "从一句角色想法生成造型、道具、材质和三视图设计板。",
        tags: ["角色", "三视图", "概念"],
        defaultAspectRatio: "3:2",
        sourceInspiration: "/conceptual-character-creator",
        direction:
            "围绕角色身份、能力、弱点和生活痕迹建立原创造型，轮廓一眼可辨，服装结构适合真实穿着或动画制作",
        camera: "同一角色正面、侧面、背面三视图，加一张自然动作小稿和关键道具特写，比例统一",
        finish: "中性棚光，真实材质说明，颜色不超过一个主色加两个辅助色，保留使用磨损",
        constraints:
            "所有视角必须保持同一张脸、发型、服装和道具；不模仿现有 IP，不生成文字和水印",
    }),
    imageSkill({
        id: "manga-asset-pack",
        name: "漫剧角色场景资产包",
        shortName: "漫剧资产",
        target: "image",
        kind: "optimizer",
        description: "为短漫剧整理统一角色、场景和关键道具资产。",
        tags: ["漫剧", "角色", "场景"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/manga-shot-planner",
        direction:
            "先确定统一世界观、线稿粗细、上色方法和角色比例，再生成主角、配角、核心场景和关键道具",
        camera: "资产板式构图，角色与场景分区清楚；场景提供正向建立镜头和可重复使用的反向角度",
        finish: "统一色板、轮廓线和阴影层数，细节服务于后续连续分镜，不做单张插画式过度渲染",
        constraints:
            "所有资产必须共享同一画风与尺度；角色脸、服装、发色固定，不出现随机文字、边框或水印",
    }),
    imageSkill({
        id: "beauty-editorial",
        name: "高级美妆编辑大片",
        shortName: "美妆大片",
        target: "image",
        kind: "style",
        description: "自然皮肤质感、精确妆面和高级杂志光线。",
        tags: ["美妆", "人像", "杂志"],
        defaultAspectRatio: "4:5",
        sourceInspiration: "/realistic-beauty-product-review",
        direction:
            "以妆容质地和人物真实神态为核心，视觉精致但不过度磨皮，造型与产品色彩形成明确呼应",
        camera: "85mm 近景或半身编辑人像，眼神方向自然，留出产品或版面呼吸空间但不生成文字",
        finish: "大面积柔光配小范围高光，保留毛孔、唇纹、眼影颗粒和真实发丝，色彩克制",
        constraints:
            "不改变人物身份和五官，不生成塑料皮肤、错误手指、品牌文字、水印或廉价闪粉特效",
    }),
    imageSkill({
        id: "fashion-accessory-key-visual",
        name: "高机能时尚配饰视觉",
        shortName: "机能时尚",
        target: "image",
        kind: "style",
        description: "眼镜、手表、鞋包等配饰的高能量时尚主视觉。",
        tags: ["时尚", "配饰", "广告"],
        defaultAspectRatio: "4:5",
        sourceInspiration: "/wander-high-energy-fashion-ad",
        direction:
            "配饰结构和材质必须准确，人物造型具有都市机能感，画面传达速度、张力与高级品牌秩序",
        camera: "低机位近景、倾斜构图或局部微距组合，配饰始终清晰可辨，动态不遮挡核心卖点",
        finish: "硬柔结合的轮廓光、金属和玻璃高光准确，黑灰基底配一个高饱和强调色",
        constraints:
            "不改变商品外形、颜色和数量，不生成商标文字、错误佩戴关系、漂浮配件或水印",
    }),
    imageSkill({
        id: "skincare-product-hero",
        name: "高端护肤品主视觉",
        shortName: "护肤主视觉",
        target: "image",
        kind: "style",
        description: "洁净水感、科学质地与高级护肤品广告构图。",
        tags: ["护肤", "产品", "水感"],
        defaultAspectRatio: "4:5",
        sourceInspiration: "/skincare-tvc-producer",
        direction:
            "产品是唯一主角，用水、玻璃、植物或实验室材质表达功效，整体高级、安静、可信",
        camera: "微距与标准静物镜头结合，瓶身标签区域保留但不生成新文字，构图稳定有呼吸感",
        finish: "清透柔光、受控焦散、真实液滴和细腻表面高光，白、银、浅蓝或植物色为主",
        constraints:
            "不修改包装结构和颜色，不生成虚假文字、过量水花、廉价光晕、漂浮物或水印",
    }),
    imageSkill({
        id: "automotive-key-visual",
        name: "汽车电影广告主视觉",
        shortName: "汽车视觉",
        target: "image",
        kind: "style",
        description: "准确车身结构、速度氛围和电影级道路光影。",
        tags: ["汽车", "TVC", "速度"],
        defaultAspectRatio: "21:9",
        sourceInspiration: "/high-impact-car-tvc",
        direction:
            "保持车型比例和车身特征准确，通过道路、天气和光线表达性能与品牌气质",
        camera: "低角度三分之四车身、侧向追拍或远景道路镜头，车轮接地，透视和运动方向可信",
        finish: "车漆反射遵循环境，金属、玻璃、轮胎材质真实；可使用雨夜、黎明或隧道动机光",
        constraints:
            "不改变车型、不增加车轮和车灯、不让车辆漂浮，不生成品牌文字、错误反射、过度速度线或水印",
    }),
    imageSkill({
        id: "food-commercial",
        name: "食物商业摄影",
        shortName: "美食广告",
        target: "image",
        kind: "style",
        description: "真实可口的食物质地、热气和餐桌氛围。",
        tags: ["美食", "商业", "摄影"],
        defaultAspectRatio: "4:5",
        sourceInspiration: "/product-short-drama-generator",
        direction:
            "突出一道食物最诱人的温度、层次和新鲜度，道具与背景只负责解释食用场景",
        camera: "45 度餐桌视角、平视英雄镜头或局部微距，主体完整，关键食材纹理清楚",
        finish: "柔和侧逆光、真实油脂与水分高光、自然热气和浅景深，颜色可口但不过饱和",
        constraints:
            "食物结构必须合理，不生成塑料质感、漂浮食材、过量酱汁、错误餐具、文字或水印",
    }),
    imageSkill({
        id: "cozy-handdrawn-fantasy",
        name: "温暖手绘幻想",
        shortName: "手绘幻想",
        target: "image",
        kind: "style",
        description: "温柔手绘线条、自然生活细节和诗意幻想空间。",
        tags: ["手绘", "治愈", "幻想"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/ghibli-aesthetic-animator",
        direction:
            "原创温暖手绘动画美术，幻想元素融入普通生活，人物表演自然，环境细节富有生命力",
        camera: "清楚的二维景深分层和易读剪影，构图像动画电影关键帧而不是角色海报",
        finish: "水彩或赛璐璐上色、柔和天空光、自然绿色和温暖室内光，保留手绘边缘",
        constraints:
            "不复刻现有动画角色、场景或工作室设计；避免 3D 塑料感、过度发光、文字和水印",
    }),
    imageSkill({
        id: "painterly-3d-character",
        name: "绘画质感 3D 角色",
        shortName: "绘画 3D",
        target: "image",
        kind: "style",
        description: "手绘笔触与三维体积结合的原创角色概念图。",
        tags: ["3D", "绘画", "角色"],
        defaultAspectRatio: "4:5",
        sourceInspiration: "/arcane-character-animator",
        direction:
            "原创成熟动画角色，三维结构扎实但表面保留可见笔触、色块切面和手绘阴影",
        camera: "人物半身或全身英雄构图，姿态有重心和故事信息，背景简洁但说明世界观",
        finish: "方向性电影光、冷暖色块分明，皮肤、布料和金属用绘画化材质统一处理",
        constraints:
            "不复制现有动画角色和服装；避免光滑游戏建模感、换脸、错误肢体、文字或水印",
    }),
    imageSkill({
        id: "comic-multiverse",
        name: "多维漫画宇宙",
        shortName: "漫画宇宙",
        target: "image",
        kind: "style",
        description: "网点、错版色、速度构图和多层漫画空间。",
        tags: ["漫画", "网点", "动感"],
        defaultAspectRatio: "16:9",
        sourceInspiration: "/multiverse-anime-3d-style",
        direction:
            "原创多维漫画视觉，把真实体积、粗线稿、印刷网点和错版色结合，动作夸张但空间可读",
        camera: "强透视动作构图，前中后景由漫画框线、速度形和景深分开，主体轮廓始终清晰",
        finish: "高对比有限色盘、纸张颗粒、半调网点和局部色彩错位，保持面部稳定",
        constraints:
            "不复刻现有超级英雄或漫画 IP；避免乱码对白框、过量故障效果、肢体变形和水印",
    }),
    videoSkill({
        id: "short-drama-director",
        name: "精品短剧导演",
        shortName: "精品短剧",
        target: "video",
        kind: "optimizer",
        description: "把故事梗概整理成有冲突、反应和钩子的短剧镜头。",
        tags: ["短剧", "剧情", "反转"],
        defaultAspectRatio: "9:16",
        defaultDuration: 15,
        sourceInspiration: "/xingrannvpin",
        direction:
            "用最少人物建立清楚关系和冲突，每个镜头都推动信息，结尾留下可继续观看的反转或疑问",
        camera: "建立镜头交代空间，中近景捕捉对话反应，关键道具用短促特写；人物视线与正反打轴线一致",
        finish: "0–4 秒建立、4–11 秒升级、11–15 秒反转或悬念落点，结尾停留半秒",
        constraints:
            "人物身份、服装、道具和场景方向连续；避免同时多人抢动作、机械表演、突然换景、字幕、水印和闪烁",
    }),
    videoSkill({
        id: "product-short-drama",
        name: "带货剧情短片",
        shortName: "带货短剧",
        target: "video",
        kind: "optimizer",
        description: "用三段小剧情自然呈现商品问题、使用过程和结果。",
        tags: ["带货", "商品", "短剧"],
        defaultAspectRatio: "9:16",
        defaultDuration: 15,
        sourceInspiration: "/product-short-drama-generator",
        direction:
            "商品自然进入人物行动，不做硬塞镜头；先展示真实痛点，再通过使用动作解决，最后呈现可信结果",
        camera: "人物中景、商品操作近景、结果反应近景三段清楚衔接，商品形态始终准确",
        finish: "前 3 秒快速建立问题，中段完整展示使用动作，最后用人物真实反应和商品清晰画面收尾",
        constraints:
            "不生成虚假文字和价格，不改变商品结构、颜色或数量；保持手部接触正确，避免漂浮、穿模和水印",
    }),
    videoSkill({
        id: "narrative-tvc",
        name: "剧情化品牌 TVC",
        shortName: "剧情 TVC",
        target: "video",
        kind: "optimizer",
        description: "用人物小故事表达商品或品牌价值，而不是简单产品轮播。",
        tags: ["TVC", "剧情", "品牌"],
        defaultAspectRatio: "16:9",
        defaultDuration: 15,
        sourceInspiration: "/narrative-tvc-creator",
        direction:
            "把品牌价值转化成一个具体人物选择和可见结果，产品只在关键动作中出现",
        camera: "三镜头结构：环境建立、人物行动、情绪与产品落点；运镜克制，构图保持广告级秩序",
        finish: "情绪由安静到明确，结尾停在可用于品牌版面的稳定画面，但不自动生成文字",
        constraints:
            "产品形态、人物身份和场景连续；避免空洞口号、随机粒子、过度慢动作、文字和水印",
    }),
    videoSkill({
        id: "luxury-tvc",
        name: "高奢质感 TVC",
        shortName: "高奢 TVC",
        target: "video",
        kind: "style",
        description: "克制、精确、材质驱动的国际化高级品牌短片。",
        tags: ["奢侈品", "TVC", "高级"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        sourceInspiration: "/luxury-brand-tvc-creator",
        direction:
            "以材质、形体、节奏和留白传达价值，动作少而准确，不依赖廉价视觉特效",
        camera: "微距滑轨、极慢推近和稳定几何构图，镜头之间用材质或动作匹配转场",
        finish: "前半段建立神秘感，中段展示工艺，结尾用完整产品或人物姿态收束",
        constraints:
            "保持商品结构与品牌色准确；避免随机商标、文字、闪烁、过饱和、快速乱切和水印",
    }),
    videoSkill({
        id: "skincare-tvc",
        name: "护肤品水感 TVC",
        shortName: "护肤 TVC",
        target: "video",
        kind: "style",
        description: "产品微距、水感材质与自然模特肤质结合的护肤短片。",
        tags: ["护肤", "水感", "模特"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        sourceInspiration: "/skincare-tvc-producer",
        direction:
            "在产品、质地和自然肌肤之间建立清楚因果，水和植物元素只服务于功效表达",
        camera: "瓶身微距、质地流动特写、模特轻触肌肤中近景，使用柔和滑轨和受控慢动作",
        finish: "清透开场、质地展示、自然使用、产品落点四拍完成，尾帧干净稳定",
        constraints:
            "不改变包装和人物身份，不生成文字、夸张功效、错误手指、液体穿模、塑料皮肤或水印",
    }),
    videoSkill({
        id: "car-impact-tvc",
        name: "爽感汽车 TVC",
        shortName: "汽车 TVC",
        target: "video",
        kind: "style",
        description: "道路追拍、速度变化和精准车身展示的汽车广告。",
        tags: ["汽车", "追拍", "速度"],
        defaultAspectRatio: "21:9",
        defaultDuration: 12,
        sourceInspiration: "/high-impact-car-tvc",
        direction:
            "用道路环境、加速、过弯和光线变化表达性能，每一镜都保持车型特征清晰",
        camera: "低机位侧向追拍、轮胎与路面特写、远景穿越地形，运镜速度与车辆运动一致",
        finish: "由静到动再到稳定英雄落点，剪辑跟随引擎节奏但保留车身可读性",
        constraints:
            "车辆必须接地且结构稳定；避免车轮增生、车灯漂移、无物理急转、随机文字、品牌变形和水印",
    }),
    videoSkill({
        id: "fashion-accessory-tvc",
        name: "高机能配饰广告",
        shortName: "配饰 TVC",
        target: "video",
        kind: "style",
        description: "眼镜、手表和鞋包的高能量时尚动作广告。",
        tags: ["时尚", "配饰", "卡点"],
        defaultAspectRatio: "9:16",
        defaultDuration: 10,
        sourceInspiration: "/wander-high-energy-fashion-ad",
        direction:
            "把佩戴动作、材质微距和人物移动组成节奏鲜明的时尚段落，商品始终是视觉核心",
        camera: "手部操作特写、低机位人物动作和商品微距快速匹配，转场由动作遮挡或形状相似完成",
        finish: "前两秒建立强视觉钩子，中段三次节奏变化，结尾停在完整商品与人物姿态",
        constraints:
            "商品结构和佩戴方式准确；避免丢失配饰、错误手指、漂浮、乱序切镜、文字和水印",
    }),
    videoSkill({
        id: "cinematic-travel-vlog",
        name: "电影感旅拍短片",
        shortName: "旅拍大师",
        target: "video",
        kind: "style",
        description: "地点、人物和自然动作结合的电影感旅行短片。",
        tags: ["旅行", "Vlog", "电影"],
        defaultAspectRatio: "16:9",
        defaultDuration: 15,
        sourceInspiration: "/cinematic-travel-vlog-maker",
        direction:
            "让人物真实探索地点，通过环境声音、天气和小动作体现旅行体验，不做景点幻灯片",
        camera: "广角环境建立、跟随行走、人物观察近景和地点细节特写，运镜平滑且方向连续",
        finish: "以抵达、回望或环境变化收尾，节奏有呼吸，保留自然停顿和稳定尾帧",
        constraints:
            "地点地貌、人物服装和时间连续；避免瞬移、重复路人、过度航拍、滤镜堆叠、文字和水印",
    }),
    videoSkill({
        id: "beauty-review-video",
        name: "真人感美妆测评",
        shortName: "美妆测评",
        target: "video",
        kind: "optimizer",
        description: "自然口播、真实使用动作和产品细节结合的测评视频。",
        tags: ["测评", "美妆", "口播"],
        defaultAspectRatio: "9:16",
        defaultDuration: 15,
        sourceInspiration: "/realistic-beauty-product-review",
        direction:
            "像真实创作者在熟悉环境中分享体验，表情、停顿和手部动作自然，信息通过可见使用过程传达",
        camera: "固定中近景口播为主，穿插产品微距和上脸动作特写，镜头高度与视线稳定",
        finish: "开场一句结论钩子，中段展示质地和使用，结尾给出克制真实的感受",
        constraints:
            "不生成夸张功效和虚假字幕；保持人物、产品和手部连续，避免磨皮、换脸、漂浮和水印",
    }),
    videoSkill({
        id: "model-talkshow",
        name: "AI 模特脱口秀",
        shortName: "模特脱口秀",
        target: "video",
        kind: "optimizer",
        description: "模特、场景、段子节奏和镜头反应完整的轻喜剧短片。",
        tags: ["脱口秀", "模特", "口播"],
        defaultAspectRatio: "9:16",
        defaultDuration: 15,
        sourceInspiration: "/ai-model-talkshow-producer",
        direction:
            "角色以自然口语讲一个明确笑点，台词有铺垫和落点，表演不过度挤眉弄眼",
        camera: "稳定中景为主，笑点前轻微推近，插入一次观众或环境反应，但不频繁切镜",
        finish: "前半段建立预期，后半段反转，笑点后留半秒反应和稳定尾帧",
        constraints:
            "口型、表情和手势同步，人物身份和服装固定；避免字幕乱码、脸部抖动、肢体穿模和水印",
    }),
    videoSkill({
        id: "rhythmic-mv",
        name: "节奏唱跳 MV",
        shortName: "唱跳 MV",
        target: "video",
        kind: "style",
        description: "舞蹈动作、节拍、灯光和多机位连续的音乐短片。",
        tags: ["MV", "舞蹈", "卡点"],
        defaultAspectRatio: "16:9",
        defaultDuration: 15,
        sourceInspiration: "/rhythmic-lip-sync-mv",
        direction:
            "编排一个主舞蹈动作和两个辅助变化，服装、舞台和灯光围绕歌曲情绪统一",
        camera: "全身主机位保证动作可读，副机位做中近景和横向移动，切换严格落在节拍重音",
        finish: "动作从准备、爆发到定格，最后一拍形成清晰团体或个人姿态",
        constraints:
            "人物数量、脸、服装和队形连续；避免肢体增生、舞者相互穿透、无节拍乱切、字幕和水印",
    }),
    videoSkill({
        id: "absurd-comedy",
        name: "荒诞无厘头喜剧",
        shortName: "荒诞喜剧",
        target: "video",
        kind: "style",
        description: "逻辑自洽的荒诞设定、认真表演和清楚笑点。",
        tags: ["喜剧", "荒诞", "反转"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        sourceInspiration: "/absurdist-comedy-maker",
        direction:
            "世界规则荒诞但人物完全认真，笑点来自因果错位、身份反差或道具用途反转",
        camera: "先用稳定镜头让观众理解规则，再用反应近景和一次精准推近放大笑点",
        finish: "铺垫简短、反转清楚、笑点后留出人物尴尬或环境继续运转的余韵",
        constraints:
            "荒诞不等于随机；保持人物、道具和空间连续，避免表情失控、肢体变形、乱码字幕和水印",
    }),
    videoSkill({
        id: "classical-wuxia-director",
        name: "古典武侠导演",
        shortName: "古典武侠",
        target: "video",
        kind: "style",
        description: "山水空间、克制招式、人物站位和传统武侠节奏。",
        tags: ["武侠", "古风", "动作"],
        defaultAspectRatio: "21:9",
        defaultDuration: 15,
        sourceInspiration: "/hujinquanwuxia",
        direction:
            "以人物气度、空间调度和一招一式的因果为核心，风、竹、屋檐或庭院参与叙事",
        camera: "远景先交代双方站位，中景展示完整招式，关键接触用短促近景；保持轴线与落脚点清楚",
        finish: "先静后动，动作爆发短而准确，结尾回到安静姿态和环境余韵",
        constraints:
            "服装、武器数量和人物方位连续；避免飞行失重、肢体穿模、现代道具、光效堆砌、文字和水印",
    }),
    videoSkill({
        id: "cinematic-vfx-action",
        name: "影视动作特效",
        shortName: "动作特效",
        target: "video",
        kind: "style",
        description: "动作因果、能量特效和环境反馈一致的影视特效镜头。",
        tags: ["VFX", "动作", "特效"],
        defaultAspectRatio: "21:9",
        defaultDuration: 8,
        sourceInspiration: "/cinematic-vfx-creator",
        direction:
            "特效必须由人物动作或道具触发，并对光线、烟尘、碎屑和周围表面产生一致反馈",
        camera: "先锁定动作接触点，再沿能量方向短促跟随；冲击后迅速恢复稳定，保持主体可读",
        finish: "蓄力、释放、环境反馈、余波四拍完整，最后留下烟尘或光线衰减而不是突然消失",
        constraints:
            "遵守重力、惯性和遮挡；避免无来源粒子、特效穿过身体、曝光闪烁、角色变形、文字和水印",
    }),
    videoSkill({
        id: "painterly-3d-animation",
        name: "绘画质感 3D 动画",
        shortName: "绘画动画",
        target: "video",
        kind: "style",
        description: "三维表演结合手绘材质、色块阴影和电影级动作。",
        tags: ["3D", "绘画", "动画"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        sourceInspiration: "/arcane-character-animator",
        direction:
            "角色动作有重量和情绪，三维结构稳定，表面笔触与色块随光线变化但不在帧间游动",
        camera: "中景表演配一次缓慢推近或横移，动作关键点保持在安全构图区域",
        finish: "动作从克制准备到明确情绪落点，色彩和光线随情绪轻微变化",
        constraints:
            "保持原创角色、脸、服装和材质连续；避免笔触闪烁、模型融化、肢体穿模、文字和水印",
    }),
    videoSkill({
        id: "retro-chinese-animation",
        name: "复古东方美术动画",
        shortName: "复古国漫",
        target: "video",
        kind: "style",
        description: "传统线描、平涂、水墨和手工动画节奏。",
        tags: ["国漫", "复古", "手绘"],
        defaultAspectRatio: "4:3",
        defaultDuration: 15,
        sourceInspiration: "/retro-chinese-animation-creator",
        direction:
            "原创传统美术动画，动作讲究停顿和韵律，水墨、线描、剪纸或工笔语言保持统一",
        camera: "二维横向调度、散点透视和景别切换结合，避免现代三维镜头乱转",
        finish: "有限帧手绘节奏，关键姿态清楚，墨色或纸张纹理稳定，结尾留白",
        constraints:
            "不复刻具体影片和角色；避免线条闪烁、颜色跳变、3D 塑料感、乱码文字和水印",
    }),
    videoSkill({
        id: "handdrawn-anime-short",
        name: "二次元手绘短片",
        shortName: "手绘动漫",
        target: "video",
        kind: "style",
        description: "夸张但可读的手绘动作、清晰关键帧和背景节奏。",
        tags: ["动漫", "手绘", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        sourceInspiration: "/yuasa-style-anime-creator",
        direction:
            "原创手绘动画，允许形体在动作中弹性夸张，但关键姿态和角色身份始终清楚",
        camera: "使用二维构图、横向运动和少量透视推进，背景线条配合速度但不遮挡人物",
        finish: "动作以强关键帧组织，中间帧有节奏，结尾落到清楚表情或姿态",
        constraints:
            "角色脸、发型和服装稳定；避免随机风格切换、线条沸腾、肢体增生、文字和水印",
    }),
    videoSkill({
        id: "nextgen-ancient-cg",
        name: "古风次世代 CG 短片",
        shortName: "古风 CG",
        target: "video",
        kind: "style",
        description: "写实古风角色、真实布料和次世代电影光影。",
        tags: ["古风", "CG", "写实"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        sourceInspiration: "/next-gen-ancient-style",
        direction:
            "原创古代幻想角色，服装结构、发饰和建筑基于可信工艺，表演克制有重量",
        camera: "中远景交代空间，近景捕捉表情和衣料运动，运镜像真实摄影机而非游戏自由镜头",
        finish: "电影级动机光、真实皮肤和布料模拟，动作结束保留环境风和尘埃余韵",
        constraints:
            "保持人物身份、服装层级和道具数量；避免游戏 UI、塑料皮肤、失重飘带、穿模、文字和水印",
    }),
    videoSkill({
        id: "multiverse-comic-animation",
        name: "多维漫画动画",
        shortName: "漫画动画",
        target: "video",
        kind: "style",
        description: "漫画网点、错版色和三维动作结合的高能短片。",
        tags: ["漫画", "3D", "动感"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        sourceInspiration: "/multiverse-anime-3d-style",
        direction:
            "三维角色动作稳定，二维线条、网点和色块作为可控图层随动作变化，形成原创漫画宇宙",
        camera: "强透视跟随主动作，关键冲击处使用短暂停格、构图切面或漫画框转场",
        finish: "节奏快速但每个动作有准备和落点，最后定格成完整漫画关键帧",
        constraints:
            "不复刻现有漫画 IP；避免面部漂移、网点闪烁、乱码气泡、肢体穿模、文字和水印",
    }),
];
