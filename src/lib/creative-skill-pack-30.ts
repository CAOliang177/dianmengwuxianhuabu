import type {
    CreativeSkill,
    CreativeSkillKind,
    CreativeSkillTarget,
} from "@/lib/creative-skills";

interface SkillDefinition {
    id: string;
    name: string;
    shortName: string;
    target: CreativeSkillTarget;
    kind: CreativeSkillKind;
    description: string;
    tags: string[];
    defaultAspectRatio: string;
    defaultDuration?: number;
    direction: string;
    camera: string;
    finish: string;
    constraints: string;
}

const clean = (brief: string) => brief.trim().replace(/\s+/g, " ");

function buildSkill(definition: SkillDefinition): CreativeSkill {
    const video = definition.target === "video";
    return {
        ...definition,
        sourceInspiration: "原创模板 · 公开视觉提示指南",
        buildPrompt: (brief) =>
            [
                `${video ? "视频主题" : "创作目标"}：${clean(brief)}。`,
                `${video ? "导演与动作设计" : "视觉与美术方向"}：${definition.direction}。`,
                `${video ? "镜头与时间推进" : "构图与镜头"}：${definition.camera}。`,
                `${video ? "节奏、光线与收尾" : "光线、材质与完成度"}：${definition.finish}。`,
                `必须遵守：${definition.constraints}。`,
            ].join("\n"),
    };
}

const DEFINITIONS: SkillDefinition[] = [
    {
        id: "cinematic-color-script",
        name: "电影色彩脚本",
        shortName: "色彩脚本",
        target: "image",
        kind: "optimizer",
        description: "把故事情绪变化整理为连续、可执行的色彩与光线方案。",
        tags: ["色彩", "电影", "分镜"],
        defaultAspectRatio: "16:9",
        direction:
            "根据故事起点、转折、高潮和结尾设计四个连续色彩阶段，明确主色、辅助色、饱和度、明暗与情绪作用",
        camera: "使用四至六格等宽电影画幅缩略图，保持角色和地点线索连续，每格只表达一个核心情绪",
        finish: "光源方向、天气和时间随剧情合理变化，颜色具有继承关系而不是随机换色",
        constraints:
            "不得改变角色身份和世界设定，避免每格风格不同、色彩过饱和、伪字幕、Logo和水印",
    },
    {
        id: "shot-continuity-board",
        name: "镜头连续性分镜",
        shortName: "连续分镜",
        target: "image",
        kind: "optimizer",
        description: "把一个动作拆成保持轴线、方向和角色一致的连续分镜。",
        tags: ["分镜", "连续性", "镜头"],
        defaultAspectRatio: "16:9",
        direction:
            "把事件拆成建立、准备、执行、反应和结果五个镜头，记录人物位置、视线、动作方向和道具状态",
        camera: "景别逐步变化但不跨越动作轴，屏幕方向持续一致，每格构图都能单独读懂",
        finish: "统一角色造型、场景光线和色调，用姿态与环境变化清楚连接前后镜头",
        constraints:
            "禁止换脸换装、左右翻转、道具消失、背景重建、重复镜头、文字说明和水印",
    },
    {
        id: "creature-anatomy-design",
        name: "原创生物结构设计",
        shortName: "生物设计",
        target: "image",
        kind: "optimizer",
        description: "依据栖息地、运动和进食方式设计可信的原创生物。",
        tags: ["生物", "概念", "结构"],
        defaultAspectRatio: "3:2",
        direction:
            "从栖息地、体温、运动方式、感官和食性推导骨架、肌肉、表皮、四肢和防御结构",
        camera: "主视图、侧视图、运动姿态和局部结构并排，提供人物或环境尺度参照",
        finish: "皮肤、甲壳、羽毛或毛发的生长方向真实，关节与承重结构能够完成设定动作",
        constraints:
            "不拼贴现有影视怪物，不出现无功能器官、关节错位、多余肢体、文字和水印",
    },
    {
        id: "fantasy-map-illustration",
        name: "幻想世界地图",
        shortName: "幻想地图",
        target: "image",
        kind: "style",
        description: "根据地理、水系、聚落与路线生成有逻辑的世界地图。",
        tags: ["地图", "世界观", "插画"],
        defaultAspectRatio: "3:2",
        direction:
            "先建立山脉、水系、海岸、气候和资源，再据此安排城市、道路、边界与危险区域",
        camera: "正交俯视地图，地形层级清楚，重要区域以原创图标和装饰边框强调",
        finish: "羊皮纸、墨线、有限色彩和手工晕染自然，山川符号保持统一比例与画法",
        constraints:
            "不生成不可读地名和随机文字，河流不得逆地势分叉，避免现代卫星感、现成IP地图和水印",
    },
    {
        id: "packaging-visual-mockup",
        name: "包装视觉样机",
        shortName: "包装样机",
        target: "image",
        kind: "optimizer",
        description: "将包装结构、材质和图形系统放进真实陈列环境。",
        tags: ["包装", "品牌", "产品"],
        defaultAspectRatio: "4:3",
        direction:
            "保持包装刀模和开合结构，设计主图形、色块、信息层级和系列识别，不依赖大段伪文字",
        camera: "三分之四英雄角度配正面与开盒状态，透视一致，包装接触桌面并有真实尺度",
        finish: "纸张、覆膜、压纹、烫金和透明窗口反射可信，灯光突出结构而不遮挡主视觉",
        constraints:
            "禁止盒体变形、结构无法闭合、随机品牌、不可读密集文案、漂浮包装和水印",
    },
    {
        id: "ecommerce-clean-product",
        name: "电商白底商品图",
        shortName: "电商白底",
        target: "image",
        kind: "optimizer",
        description: "生成轮廓准确、颜色真实、可直接陈列的白底商品图。",
        tags: ["电商", "产品", "白底"],
        defaultAspectRatio: "1:1",
        direction:
            "完整保留商品形状、比例、颜色和配件，只优化摆放角度、清洁度和视觉重心",
        camera: "中长焦三分之四角度，商品居中且完整入画，底部保留自然接触阴影",
        finish: "纯净浅色背景、柔和双侧棚拍光、边缘清楚、材质反射受控且色彩准确",
        constraints:
            "不得修改商品结构和标签、添加配件、裁切边缘、过度镜面化、生成文字和水印",
    },
    {
        id: "technology-exploded-view",
        name: "科技产品爆炸视图",
        shortName: "产品爆炸图",
        target: "image",
        kind: "optimizer",
        description: "按真实装配关系展示科技产品的外壳、模组与内部结构。",
        tags: ["科技", "结构", "产品"],
        defaultAspectRatio: "3:2",
        direction:
            "沿单一装配轴拆分外壳、结构件、功能模组和紧固件，保持部件顺序与相对尺度",
        camera: "等距或三分之四工程视角，部件间距均匀，完整产品轮廓仍可从排列中识别",
        finish: "金属、塑料、电路和玻璃材质明确，边缘洁净，使用克制轮廓光表现层次",
        constraints:
            "禁止凭空增加零件、错乱装配顺序、悬浮方向不一致、伪技术文字、品牌标识和水印",
    },
    {
        id: "perfume-still-life",
        name: "香水静物广告",
        shortName: "香水静物",
        target: "image",
        kind: "style",
        description: "以气味联想、玻璃折射和精致布景呈现香水产品。",
        tags: ["香水", "静物", "广告"],
        defaultAspectRatio: "4:5",
        direction:
            "把香调转换为少量植物、矿物、织物或天气意象，让产品瓶型始终是唯一主角",
        camera: "三分之四近景，瓶体垂直稳定，前景只做轻微层次，背景留出干净负空间",
        finish: "玻璃折射、液体颜色、金属瓶盖和凝露真实，侧逆光勾勒轮廓并控制高光",
        constraints:
            "不得改变瓶型、液位和标签布局，避免过量花瓣、漂浮液体、伪文字、Logo重绘和水印",
    },
    {
        id: "beverage-splash-control",
        name: "饮品飞溅广告",
        shortName: "饮品飞溅",
        target: "image",
        kind: "optimizer",
        description: "用符合流体运动的飞溅、冰块和凝露强化清爽感。",
        tags: ["饮品", "液体", "广告"],
        defaultAspectRatio: "4:5",
        direction:
            "围绕容器和饮品颜色设计一条主要液体运动轨迹，配料只作为风味提示",
        camera: "高速摄影近景，容器完整入画，飞溅形成清楚弧线而不遮挡产品识别区域",
        finish: "液体透明度、气泡、冰块折射和凝露真实，硬边高光与柔和背景光平衡",
        constraints:
            "液体不得反重力、无限复制或穿过容器，避免瓶体变形、随机水果、伪文字和水印",
    },
    {
        id: "twilight-real-estate",
        name: "建筑暮光摄影",
        shortName: "建筑暮光",
        target: "image",
        kind: "style",
        description: "平衡蓝调天空、室内暖光和建筑结构的地产主视觉。",
        tags: ["建筑", "暮光", "摄影"],
        defaultAspectRatio: "16:9",
        direction:
            "在日落后蓝调时刻呈现建筑入口、立面和景观层次，让室内灯光表达真实使用状态",
        camera: "两点透视或轻微移轴，垂直线稳定，建筑完整且有道路、人物或植被提供尺度",
        finish: "天空冷蓝与室内暖光平衡，玻璃反射不过曝，景观灯与路面材质真实",
        constraints:
            "禁止扭曲立面、所有窗户同亮、虚假灯带、镜面天空、重复人物、文字和水印",
    },
    {
        id: "landscape-matte-painting",
        name: "史诗环境接景",
        shortName: "环境接景",
        target: "image",
        kind: "style",
        description: "构建尺度宏大但地理、光线和空气透视可信的环境。",
        tags: ["环境", "接景", "电影"],
        defaultAspectRatio: "21:9",
        direction:
            "从真实地貌和气候出发加入有限幻想元素，建立明确路径、尺度参照和叙事目的地",
        camera: "超宽幅建立镜头，前景框景、中景行动线、远景地标形成三层纵深",
        finish: "统一太阳方向、云层、雾气和反射，远景对比度自然降低，细节密度随距离递减",
        constraints:
            "避免地形拼贴、多个太阳、无尺度建筑、满屏雾气、过度锐化、伪文字和水印",
    },
    {
        id: "minimal-ink-landscape",
        name: "极简水墨意境",
        shortName: "极简水墨",
        target: "image",
        kind: "style",
        description: "以留白、墨色层次和少量设色表达克制东方意境。",
        tags: ["水墨", "留白", "东方"],
        defaultAspectRatio: "3:2",
        direction:
            "把主题提炼为少数山石、树木、人物或建筑，以虚实、疏密和留白建立气韵",
        camera: "长卷式横向层次或单点偏置构图，主体较小，视线沿墨色浓淡自然移动",
        finish: "焦墨、淡墨、飞白和纸张渗化真实，只用一处低饱和颜色作为视觉焦点",
        constraints:
            "不模仿具体在世艺术家，不堆砌古风符号，避免数字渐变、随机书法、印章和水印",
    },
    {
        id: "pixel-art-environment",
        name: "像素场景设计",
        shortName: "像素场景",
        target: "image",
        kind: "style",
        description: "以受控分辨率、有限色板和清晰轮廓构建像素世界。",
        tags: ["像素", "游戏", "场景"],
        defaultAspectRatio: "16:9",
        direction:
            "选择明确像素尺寸和有限色板，用大形、明暗块和少量关键像素表现人物与环境",
        camera: "侧视、等距或俯视中的一种，透视规则统一，交互区域和路径清楚",
        finish: "边缘保持硬像素，无平滑抗锯齿，光影和材质通过有节奏的像素簇表达",
        constraints:
            "禁止混合不同像素密度、照片纹理、模糊边缘、随机界面文字、现有游戏角色和水印",
    },
    {
        id: "embroidered-textile-art",
        name: "刺绣织物插画",
        shortName: "刺绣织物",
        target: "image",
        kind: "style",
        description: "用真实针法、线材方向和布面起伏表现手工刺绣。",
        tags: ["刺绣", "织物", "手工"],
        defaultAspectRatio: "1:1",
        direction:
            "将主题拆为适合平针、缎面针、链式针和结粒绣的封闭区域，针法方向顺应形体",
        camera: "正面或轻微斜俯微距，图案完整，边缘可见布料与绣绷尺度",
        finish: "棉线或丝线的纤维、反光、线头和布面压痕自然，色彩数量受控",
        constraints:
            "不得出现液态线条、无限细节、印刷照片感、文字、商标和无法缝制的悬浮结构",
    },
    {
        id: "ceramic-glaze-art",
        name: "陶瓷釉彩艺术",
        shortName: "陶瓷釉彩",
        target: "image",
        kind: "style",
        description: "以手工器形、釉色流动和窑变细节表现陶瓷美感。",
        tags: ["陶瓷", "釉彩", "手工"],
        defaultAspectRatio: "4:5",
        direction:
            "让主题适配真实可烧制的陶瓷器形，装饰与器物曲面、口沿、足部和使用功能协调",
        camera: "三分之四静物角度，器物完整并显示口沿厚度和底部接触，背景简洁",
        finish: "釉面开片、流釉、色差和细小气泡克制真实，棚拍高光揭示曲面",
        constraints:
            "避免玻璃塑料感、器形融化、无支撑结构、过量裂纹、随机文字、Logo和水印",
    },
    {
        id: "dance-choreography-video",
        name: "舞蹈动作编排",
        shortName: "舞蹈编排",
        target: "video",
        kind: "optimizer",
        description: "把节拍、队形、身体重心和镜头关系转成可读舞蹈段落。",
        tags: ["舞蹈", "编排", "节奏"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "按起势、主题动作、方向变化、高潮姿势和收势设计舞段，动作由核心重心带动并匹配节拍",
        camera: "以完整全身中景为主，沿舞者移动方向平稳侧跟，队形变化时适度后拉",
        finish: "衣物与头发跟随速度和停顿，脚部接地清楚，结尾停在稳定且有轮廓的姿势",
        constraints:
            "禁止脚底滑行、肢体增减、多人融合、动作无节拍循环、镜头乱转、换装和背景闪烁",
    },
    {
        id: "parkour-route-video",
        name: "跑酷路线设计",
        shortName: "跑酷路线",
        target: "video",
        kind: "optimizer",
        description: "用真实障碍、助跑距离和落点组织连续跑酷动作。",
        tags: ["跑酷", "动作", "路线"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "明确起点、障碍顺序、抓握点、跨越方式和安全落点，每个动作都由前一个速度自然进入",
        camera: "侧向广角跟随并提前展示下一个障碍，关键起跳和落地保持人物全身入画",
        finish: "身体重心、手脚接触、衣物与环境反馈符合物理，结尾完成稳定落地",
        constraints:
            "避免超人式跳跃、悬空停顿、瞬移、穿墙、肢体变形、镜头穿越障碍和危险教学细节",
    },
    {
        id: "vehicle-tracking-shot",
        name: "车辆动态跟拍",
        shortName: "车辆跟拍",
        target: "video",
        kind: "optimizer",
        description: "保持车辆结构一致，并用道路、悬挂和环境体现真实速度。",
        tags: ["汽车", "跟拍", "运动"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "车辆沿明确道路轨迹稳定行驶，转向、悬挂、轮胎和车身姿态符合速度与弯道",
        camera: "低机位平行跟拍或三分之四前侧跟拍，镜头速度与车辆匹配，背景产生自然运动视差",
        finish: "车漆反射、轮胎转动、道路尘水和灯光连续，最后车辆进入清楚英雄构图",
        constraints:
            "不得改变车型、车灯、轮毂和车标，避免椭圆车轮、道路融化、漂移失控、随机车辆和文字",
    },
    {
        id: "aerial-establishing-shot",
        name: "航拍建立镜头",
        shortName: "航拍建立",
        target: "video",
        kind: "optimizer",
        description: "用单一清楚航线揭示地理、人物位置和故事目的地。",
        tags: ["航拍", "建立镜头", "场景"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "先确定地点、主体和最终揭示目标，让航拍运动解释空间关系而非只展示风景",
        camera: "采用缓慢前推、上升后拉或侧向掠过中的一种，地平线稳定，运动起止平滑",
        finish: "天气、云影、水面和植被运动连续，最后停在可读地标或人物位置",
        constraints:
            "避免无故旋转俯冲、速度突变、地形融化、建筑复制、多个航线叠加、文字和水印",
    },
    {
        id: "macro-material-transformation",
        name: "材质微距变化",
        shortName: "微距变化",
        target: "video",
        kind: "style",
        description: "在微距尺度下呈现结晶、融化、凝结或表面生长。",
        tags: ["微距", "材质", "变化"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "选择一种明确材质和单一变化机制，从初始纹理、变化前沿到稳定结果连续推进",
        camera: "微距锁定或极慢侧移，焦平面跟随变化前沿，尺度参照和景深保持一致",
        finish: "晶体、液体、颗粒或纤维遵守物理，光线揭示表面细节，变化速度平滑",
        constraints:
            "禁止随机材质互换、无限生长、画面整体融化、对焦跳动、无来源粒子、文字和水印",
    },
    {
        id: "renovation-before-after",
        name: "空间改造前后",
        shortName: "改造对比",
        target: "video",
        kind: "optimizer",
        description: "在固定机位下清楚展示空间从旧状态到完成状态的合理变化。",
        tags: ["改造", "室内", "变化"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "保留房间结构和窗门位置，按清理、施工、安装和软装四阶段推进，最终功能明确",
        camera: "同一机位、焦段和构图贯穿全片，必要时用遮挡或时间流逝连接阶段",
        finish: "光线随真实时间变化但空间几何稳定，家具和材料按施工顺序出现",
        constraints:
            "不得移动承重结构、改变门窗、物体瞬间乱跳、透视漂移、人物复制、伪字幕和水印",
    },
    {
        id: "product-unboxing-video",
        name: "商品开箱演示",
        shortName: "商品开箱",
        target: "video",
        kind: "optimizer",
        description: "以真实手部动作展示包装开启、配件层级和产品首次亮相。",
        tags: ["开箱", "商品", "演示"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "按展示封套、解除固定、打开盒盖、取出配件和举起产品的顺序演示",
        camera: "稳定俯拍或三分之四桌面近景，双手与包装完整入画，焦点落在当前操作区域",
        finish: "纸盒、塑封、磁吸和内衬反馈真实，动作节奏从容，最后产品与配件整齐陈列",
        constraints:
            "禁止手指异常、包装结构变化、配件凭空出现、标签旋转、粗暴撕裂、随机文字和水印",
    },
    {
        id: "hand-tutorial-demo",
        name: "手部教程演示",
        shortName: "手部教程",
        target: "video",
        kind: "optimizer",
        description: "把手工、组装或操作过程拆成清楚可跟随的步骤。",
        tags: ["教程", "手部", "演示"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        direction:
            "每次只完成一个操作步骤，工具、材料、起始状态和完成状态都清楚可见",
        camera: "锁定俯拍或肩后近景，双手不遮挡关键接触点，步骤转换时保持物体方向一致",
        finish: "动作速度适中，材质反馈真实，关键完成瞬间短暂停留供观察",
        constraints:
            "禁止多余手指、工具变形、步骤跳跃、材料凭空出现、左右翻转、危险操作和伪字幕",
    },
    {
        id: "cooking-process-video",
        name: "料理过程短片",
        shortName: "料理过程",
        target: "video",
        kind: "optimizer",
        description: "按真实烹饪顺序展示备料、受热、翻炒与装盘。",
        tags: ["料理", "食品", "过程"],
        defaultAspectRatio: "9:16",
        defaultDuration: 12,
        direction:
            "选择关键步骤而非全程记录，动作顺序符合食材熟化、调味和器具使用逻辑",
        camera: "俯拍备料、侧近景受热、三分之四角度装盘，镜头转换保持食材和器皿连续",
        finish: "油、水、蒸汽、火焰和食材颜色变化真实，声音与动作节点一致，成品稳定收尾",
        constraints:
            "禁止生熟状态倒退、食材凭空增减、刀具变形、火焰失控、手指异常、无限拉丝和文字水印",
    },
    {
        id: "weather-transition-video",
        name: "天气渐变场景",
        shortName: "天气渐变",
        target: "video",
        kind: "optimizer",
        description: "保持地点和机位不变，连续呈现天气到来的过程。",
        tags: ["天气", "变化", "场景"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "定义初始天气、云层变化、风力响应、降水开始和最终状态，变化由远及近",
        camera: "稳定建立镜头或极慢推进，以树木、旗帜、水面和地面作为连续参照",
        finish: "天空亮度、阴影、风、雨雪和地面湿润程度同步变化，最终状态稳定可读",
        constraints:
            "禁止瞬间换天、局部天气冲突、建筑和地形改变、雨雪穿过室内、闪烁和夸张灾难效果",
    },
    {
        id: "slow-burn-horror",
        name: "渐进式惊悚氛围",
        shortName: "渐进惊悚",
        target: "video",
        kind: "style",
        description: "通过空间异常、声音线索和延迟揭示营造非血腥惊悚。",
        tags: ["惊悚", "氛围", "悬疑"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "从正常日常状态开始，只加入一个逐渐明显的环境异常，让人物先察觉声音再寻找来源",
        camera: "稳定长镜头或缓慢推近，利用门框、镜面和背景深处制造有限信息",
        finish: "低照度仍保留细节，环境声逐步减少或偏移，结尾停在一个克制但明确的发现",
        constraints:
            "避免突然贴脸、血腥、怪物堆砌、频繁闪烁、全黑、无意义镜头抖动、人物变形和故障滤镜",
    },
    {
        id: "romantic-encounter-scene",
        name: "浪漫相遇场景",
        shortName: "浪漫相遇",
        target: "video",
        kind: "style",
        description: "用视线、距离、环境动作和克制停顿表现人物关系建立。",
        tags: ["爱情", "人物", "叙事"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "两人因一个自然事件产生注意，先分别行动，再通过眼神、让路或共同反应建立连接",
        camera: "先以双人空间镜头交代距离，再缓慢靠近或侧移，保持视线轴和人物方向",
        finish: "自然光、环境声和细小动作承载情绪，结尾落在含蓄微笑、回望或短暂停顿",
        constraints:
            "避免强行拥抱、夸张慢动作、换脸、视线错位、背景人群复制、滤镜过度和字幕水印",
    },
    {
        id: "comedy-reaction-timing",
        name: "喜剧反应节奏",
        shortName: "喜剧反应",
        target: "video",
        kind: "optimizer",
        description: "用铺垫、信息差、停顿和反应镜头形成自然笑点。",
        tags: ["喜剧", "表演", "节奏"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "先建立角色预期，再让一个具体结果违背预期，保留短暂停顿后给出克制反应",
        camera: "稳定中景展示事件全貌，只在笑点后轻微推近反应，不提前泄露结果",
        finish: "表演依靠眼神、呼吸和身体僵住而非夸张扮丑，收尾给观众足够理解时间",
        constraints:
            "避免随机摔倒、表情变形、重复笑点、镜头乱切、无关音效、人物换脸和文字提示",
    },
    {
        id: "sports-highlight-sequence",
        name: "体育高光时刻",
        shortName: "体育高光",
        target: "video",
        kind: "optimizer",
        description: "用规则正确的动作、球体轨迹和观众反应呈现竞技高潮。",
        tags: ["体育", "高光", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "明确运动项目、比赛阶段、选手位置和得分目标，动作由准备、执行、结果和反应组成",
        camera: "先用中广景交代场地与对手，跟随球或运动员移动，得分瞬间保持规则线和关键接触可见",
        finish: "身体动力、球体轨迹、器材反馈和观众反应有先后，结束于清楚庆祝或比分结果动作",
        constraints:
            "不得违反运动规则、球体瞬移、选手融合、肢体变形、场地线变化、Logo重绘和过度慢动作",
    },
    {
        id: "fantasy-spell-vfx",
        name: "幻想法术特效",
        shortName: "法术特效",
        target: "video",
        kind: "style",
        description: "让能量来源、施法动作、环境反馈和消散过程遵守统一规则。",
        tags: ["奇幻", "特效", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "定义法术来源、颜色、形态、运动路径和作用对象，先蓄积、再释放、产生反馈并自然消散",
        camera: "中景保持施法者全身和目标同时可见，沿能量方向轻微跟移，冲击后稳定观察结果",
        finish: "光照真实影响皮肤、衣物和环境，粒子数量克制，烟尘与物体反应符合能量方向",
        constraints:
            "不复制现有IP法术，不允许无限光效、全屏遮挡、无来源粒子、人物变形、环境无反馈和随机符号",
    },
];

export const CREATIVE_SKILL_PACK_30: CreativeSkill[] =
    DEFINITIONS.map(buildSkill);
