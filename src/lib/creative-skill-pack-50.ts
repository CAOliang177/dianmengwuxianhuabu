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
    const isVideo = definition.target === "video";
    return {
        ...definition,
        sourceInspiration: "原创模板 · 公开视觉提示指南",
        buildPrompt: (brief) =>
            [
                `${isVideo ? "视频主题" : "创作目标"}：${clean(brief)}。`,
                `${isVideo ? "导演与动作设计" : "视觉与美术方向"}：${definition.direction}。`,
                `${isVideo ? "镜头与时间推进" : "构图与镜头"}：${definition.camera}。`,
                `${isVideo ? "节奏、光线与收尾" : "光线、材质与完成度"}：${definition.finish}。`,
                `必须遵守：${definition.constraints}。`,
            ].join("\n"),
    };
}

const DEFINITIONS: SkillDefinition[] = [
    {
        id: "identity-consistency-sheet",
        name: "角色一致性设定表",
        shortName: "角色一致性",
        target: "image",
        kind: "optimizer",
        description:
            "锁定人物面部、体型、发型与服装，让后续多张图保持同一角色。",
        tags: ["角色", "一致性", "设定"],
        defaultAspectRatio: "3:2",
        direction:
            "把人物拆成不可变身份特征与可变表情动作，明确年龄、面部比例、发型轮廓、体态、服装层次和识别物",
        camera: "同一人物正面、四分之三侧面、侧面与全身并排，机位高度、焦段和中性背景统一",
        finish: "柔和中性棚拍光，真实皮肤与布料纹理，每个视角保持相同五官距离、发际线、身材和配色",
        constraints:
            "不得换脸、改变年龄和体型，不增减配饰，不出现文字、水印、重复人物或多余肢体",
    },
    {
        id: "multi-character-blocking",
        name: "多人物关系构图",
        shortName: "多人构图",
        target: "image",
        kind: "optimizer",
        description: "梳理多人站位、视线和主次，避免角色堆叠与关系混乱。",
        tags: ["多人", "构图", "叙事"],
        defaultAspectRatio: "16:9",
        direction:
            "先定义每个人物的身份、关系、情绪目标和视觉权重，再用距离、朝向和遮挡讲清人物关系",
        camera: "采用三角或纵深调度，主角占据第一视觉落点，配角形成可读的视线链和负空间",
        finish: "统一环境光方向和透视尺度，人物脚底落地，肤色与服装有区分但属于同一色彩系统",
        constraints:
            "人物不可融合、穿插或比例失真，避免所有人正对镜头、平均排队、肢体重复和背景抢戏",
    },
    {
        id: "facial-expression-board",
        name: "角色表情设定板",
        shortName: "表情设定",
        target: "image",
        kind: "optimizer",
        description: "为同一角色生成可复用的情绪与口型表情组。",
        tags: ["表情", "角色", "一致性"],
        defaultAspectRatio: "3:2",
        direction:
            "保持角色身份不变，设计平静、喜悦、疑惑、愤怒、悲伤、惊讶等有明确强度差异的自然表情",
        camera: "统一正面近景和头部大小，眼平机位，中性背景，按整齐网格展示",
        finish: "相同镜头、光线、肤色和发型，微表情由眉眼、嘴角、下颌和面部肌肉共同表达",
        constraints:
            "禁止换脸、夸张畸变、表情重复、牙齿异常、文字标签和不同服装",
    },
    {
        id: "costume-development-board",
        name: "服装造型开发板",
        shortName: "服装开发",
        target: "image",
        kind: "optimizer",
        description: "从人物身份和时代出发设计完整服装、材质与配件。",
        tags: ["服装", "造型", "设定"],
        defaultAspectRatio: "3:2",
        direction:
            "围绕时代、职业、气候、阶层和行动需求设计轮廓、内外层、鞋履、配件与磨损逻辑",
        camera: "全身主视图配背面、局部结构和材质样片，姿势中性且不遮挡服装关键结构",
        finish: "布料厚薄、褶皱、缝线、金属和皮革符合物理特性，配色层级清楚并保留使用痕迹",
        constraints:
            "避免无功能装饰、时代混搭、悬浮配件、随机文字、品牌标志和服装结构断裂",
    },
    {
        id: "prop-blueprint-studio",
        name: "叙事道具设计图",
        shortName: "道具设计",
        target: "image",
        kind: "optimizer",
        description: "把故事道具拆成结构、材质、使用方式和细节特写。",
        tags: ["道具", "产品", "设定"],
        defaultAspectRatio: "3:2",
        direction:
            "根据使用者、年代、用途、制造工艺和磨损历史设计原创道具，强调可操作结构和故事痕迹",
        camera: "三分之四主视图配正侧视图、开启状态和关键部件特写，比例一致",
        finish: "材质反射、接缝、螺丝、磨边和污渍位置合理，轮廓在缩略图下仍可识别",
        constraints:
            "不复制现有品牌或影视道具，不出现无法制造的结构、随机文字、漂浮零件和比例冲突",
    },
    {
        id: "environment-concept-system",
        name: "场景概念设定",
        shortName: "场景设定",
        target: "image",
        kind: "optimizer",
        description: "建立场景的地理、建筑、动线、气候和叙事焦点。",
        tags: ["场景", "概念", "世界观"],
        defaultAspectRatio: "16:9",
        direction:
            "先确定地点功能、时代、气候、使用者和事件痕迹，再建立前中后景和可行动路线",
        camera: "广角建立镜头，前景提供尺度，中景承载叙事行为，远景交代地貌与世界边界",
        finish: "光线服从时间与天气，建筑和植被材质统一，空气透视与尺度参照清晰",
        constraints:
            "避免无意义细节堆砌、重复建筑、透视冲突、随机招牌、过度雾化和空洞大场景",
    },
    {
        id: "architecture-visualization",
        name: "建筑空间视觉化",
        shortName: "建筑视觉",
        target: "image",
        kind: "optimizer",
        description: "生成结构可信、尺度明确的建筑外观与使用场景。",
        tags: ["建筑", "空间", "可视化"],
        defaultAspectRatio: "16:9",
        direction:
            "明确建筑用途、场地、结构体系、材料、入口和人与空间的关系，兼顾设计感与可建造性",
        camera: "两点透视或轻微移轴，保持垂直线，利用人物、车辆和植被提供真实尺度",
        finish: "自然光照、玻璃反射、混凝土与木材细节可信，室内外亮度衔接合理",
        constraints:
            "禁止扭曲柱网、悬空楼层、错误门窗尺度、镜面天空、重复人物和伪文字",
    },
    {
        id: "interior-editorial-photo",
        name: "室内杂志摄影",
        shortName: "室内摄影",
        target: "image",
        kind: "optimizer",
        description: "用高端杂志摄影方式呈现室内布局、材质与生活气息。",
        tags: ["室内", "摄影", "空间"],
        defaultAspectRatio: "3:2",
        direction:
            "保留空间真实功能和动线，用少量生活物件建立有人居住但不杂乱的状态",
        camera: "24至35毫米视角，机位约胸口高度，垂直线稳定，以门框或家具形成自然框景",
        finish: "窗外自然光与室内实用灯平衡，木材、织物、石材和金属质感分明，高光不过曝",
        constraints:
            "避免超广角拉伸、家具穿插、无来源灯光、过度样板间、随机文字和重复摆件",
    },
    {
        id: "food-hero-photography",
        name: "食品主视觉摄影",
        shortName: "食品主视觉",
        target: "image",
        kind: "optimizer",
        description: "强化食物的新鲜度、质感、温度与可食用感。",
        tags: ["食品", "广告", "摄影"],
        defaultAspectRatio: "4:3",
        direction:
            "突出核心食物的形状、熟度、汁水和层次，用配料和餐具补充风味但不遮挡主体",
        camera: "三分之四近景或适度俯拍，焦点落在最具食欲的切面，背景简洁并保留呼吸空间",
        finish: "柔和侧逆光塑造油润、蒸汽、酥脆和水珠，颜色自然，不使用塑料般高饱和",
        constraints:
            "食材必须可食用且结构正确，避免漂浮配料、虚假蒸汽、餐具变形、文字和水印",
    },
    {
        id: "jewelry-macro-campaign",
        name: "珠宝微距广告",
        shortName: "珠宝微距",
        target: "image",
        kind: "optimizer",
        description: "精确呈现宝石切面、金属工艺和高级光泽。",
        tags: ["珠宝", "微距", "广告"],
        defaultAspectRatio: "1:1",
        direction:
            "围绕珠宝结构、宝石主色和品牌气质建立极简高级画面，强调真实镶嵌和工艺边缘",
        camera: "微距近景配轻微三分之四角度，焦平面覆盖关键切面，构图保留适量负空间",
        finish: "大面积柔光塑造金属，小面积高光点亮宝石火彩，控制反射环境并保持边缘洁净",
        constraints:
            "不得增加宝石数量、改变镶嵌结构、产生融化金属、假钻光效、随机商标和过度锐化",
    },
    {
        id: "cosmetic-texture-campaign",
        name: "美妆质感广告",
        shortName: "美妆广告",
        target: "image",
        kind: "optimizer",
        description: "表现护肤和彩妆产品的膏体、液体、玻璃与肌肤质感。",
        tags: ["美妆", "产品", "质感"],
        defaultAspectRatio: "4:5",
        direction:
            "以产品真实包装和核心质地为主角，用涂抹轨迹、水膜或粉体表现功能感",
        camera: "产品三分之四近景与质地微距组合，标签面朝向清楚但不生成虚假文案",
        finish: "柔亮洁净的美容灯光，玻璃、塑料、金属与膏体边界明确，肤质自然细腻",
        constraints:
            "不改变瓶型和颜色，不生成不可读标签、漂浮液体、过度磨皮、虚假功效文字和水印",
    },
    {
        id: "automotive-location-campaign",
        name: "汽车场景广告",
        shortName: "汽车场景",
        target: "image",
        kind: "optimizer",
        description: "保证车身结构可信，并让环境和道路强化车辆定位。",
        tags: ["汽车", "广告", "场景"],
        defaultAspectRatio: "16:9",
        direction:
            "保持车型轮廓、车灯、轮毂和车身比例，选择与性能或生活方式匹配的道路与天气",
        camera: "低机位三分之四角度，车轮接地，透视与道路消失点统一，背景提供速度或尺度",
        finish: "车漆反射环境，玻璃与轮胎材质真实，主辅光勾勒车身曲面而不过度镜面化",
        constraints:
            "不得改变轴距、车门数量、车标和灯组，不出现椭圆车轮、漂浮车身、随机文字和水印",
    },
    {
        id: "fashion-editorial-layout",
        name: "时尚大片构图",
        shortName: "时尚大片",
        target: "image",
        kind: "optimizer",
        description: "把服装、姿态、场景和版面空间组织成杂志级画面。",
        tags: ["时尚", "人像", "杂志"],
        defaultAspectRatio: "4:5",
        direction:
            "围绕服装轮廓、材质和人物气质设计克制姿态，场景承担色彩或结构呼应",
        camera: "全身或七分身，适度低机位，肢体轮廓清楚，留出可供排版的干净负空间",
        finish: "定向硬光或大面积柔光形成明确审美，肤色真实，织物和配饰细节可读",
        constraints:
            "避免肢体扭曲、服装黏连、过度磨皮、无意义奢华、随机文字、商标和水印",
    },
    {
        id: "poster-key-art-system",
        name: "海报主视觉系统",
        shortName: "海报主视觉",
        target: "image",
        kind: "optimizer",
        description: "建立单一视觉中心、信息层级与可排版空间。",
        tags: ["海报", "主视觉", "构图"],
        defaultAspectRatio: "2:3",
        direction:
            "提炼一个核心冲突或视觉隐喻，明确主角、辅助元素和情绪色彩，保证缩略图下仍能识别",
        camera: "采用中心、对角或上下层级构图，人物与场景形成清楚剪影，预留标题和信息区域",
        finish: "用统一色调与主光连接全部元素，边缘融合自然，细节集中在视觉焦点",
        constraints:
            "只生成无字主视觉，不生成伪标题、Logo和水印，避免元素平均分布、重复脸和拼贴断层",
    },
    {
        id: "childrens-picture-book",
        name: "儿童绘本叙事",
        shortName: "儿童绘本",
        target: "image",
        kind: "optimizer",
        description: "把故事转成温暖、易读、角色一致的绘本画面。",
        tags: ["绘本", "插画", "叙事"],
        defaultAspectRatio: "4:3",
        direction:
            "用一个清楚动作讲述单页事件，角色轮廓友好、情绪可读，环境细节服务儿童观察与故事线索",
        camera: "平视或轻微俯视，中景为主，构图简洁，给角色动作和翻页方向保留空间",
        finish: "温和色彩、纸张颗粒和手绘边缘，光线柔软，保持每页角色造型与配色一致",
        constraints:
            "避免恐怖细节、拥挤构图、复杂文字、角色换装换脸、手脚异常和成人化视觉语言",
    },
    {
        id: "editorial-collage",
        name: "编辑艺术拼贴",
        shortName: "编辑拼贴",
        target: "image",
        kind: "style",
        description: "用纸张、摄影切片和图形层次形成当代编辑拼贴。",
        tags: ["拼贴", "编辑", "平面"],
        defaultAspectRatio: "4:5",
        direction:
            "把主题拆为一张主图、两到三个辅助切片和几何色块，利用尺度反差而非素材堆积制造张力",
        camera: "平面版式与局部透视混合，撕边和遮挡关系清楚，视觉焦点集中",
        finish: "可见纸纤维、印刷网点、剪裁边和轻微错位，限制色盘并保持真实手工层次",
        constraints:
            "不复制杂志商标和受保护版式，不生成可读正文、过多素材、脏乱阴影和水印",
    },
    {
        id: "risograph-print",
        name: "孔版套色印刷",
        shortName: "孔版印刷",
        target: "image",
        kind: "style",
        description: "以有限专色、网点和轻微套印偏移呈现手工印刷感。",
        tags: ["印刷", "孔版", "复古"],
        defaultAspectRatio: "4:5",
        direction:
            "把主题归纳为清晰大形和两到四种专色层，利用色层叠加形成新的综合色",
        camera: "海报式平面构图，轮廓大胆，负空间明确，细节通过网点密度而非渐变表达",
        finish: "纸张吸墨、颗粒、网点和轻微套印误差自然，颜色鲜明但不发光",
        constraints:
            "避免照片级渐变、无限色彩、数字霓虹、随机文字、过度脏污和水印",
    },
    {
        id: "cyanotype-botanical",
        name: "蓝晒植物摄影",
        shortName: "蓝晒风格",
        target: "image",
        kind: "style",
        description: "用普鲁士蓝和曝光轮廓制作安静的手工蓝晒效果。",
        tags: ["蓝晒", "植物", "摄影"],
        defaultAspectRatio: "3:2",
        direction:
            "把主体处理为接触印相般的层叠轮廓，利用植物、织物或透明物体形成深浅变化",
        camera: "平面俯拍，边缘自然延伸，主体疏密有节奏并保留纸面呼吸空间",
        finish: "深普鲁士蓝、青蓝中间调和纸白高光，保留水洗边缘、曝光不均与纸纤维",
        constraints:
            "限制为蓝白色系，不出现现代数字光效、立体棚拍阴影、随机文字和水印",
    },
    {
        id: "linocut-story-print",
        name: "叙事木刻版画",
        shortName: "木刻版画",
        target: "image",
        kind: "style",
        description: "以有方向的刀痕和强烈黑白关系表达故事。",
        tags: ["木刻", "版画", "叙事"],
        defaultAspectRatio: "3:2",
        direction:
            "把主体归纳为可刻制的黑白大形，用刀痕方向塑造体积、风势和情绪",
        camera: "轮廓优先的戏剧构图，前中后景通过黑白密度区分，不依赖灰度照片感",
        finish: "可见手工刻痕、油墨压力不均和粗纤维纸，少量单色套印可作为焦点",
        constraints:
            "避免光滑矢量边缘、照片纹理、细碎无意义线条、文字、商标和水印",
    },
    {
        id: "clay-stopmotion-still",
        name: "黏土定格场景",
        shortName: "黏土定格",
        target: "image",
        kind: "style",
        description: "呈现手工黏土角色、微缩布景与定格动画质感。",
        tags: ["黏土", "定格", "微缩"],
        defaultAspectRatio: "16:9",
        direction:
            "将人物与环境简化为可手工制作的黏土和模型结构，保留指纹、接缝和轻微不对称",
        camera: "微缩摄影中景，较深景深，机位接近角色高度，让布景具有真实尺度",
        finish: "柔和棚拍灯、黏土哑光、纸板木材和织物纹理可见，阴影真实接触地面",
        constraints:
            "避免光滑三维塑料感、真实皮肤、悬浮角色、形体融化、随机文字和水印",
    },
    {
        id: "low-poly-diorama",
        name: "低多边形微缩世界",
        shortName: "低模微缩",
        target: "image",
        kind: "style",
        description: "用简洁几何面和微缩地台表现完整小世界。",
        tags: ["低多边形", "微缩", "3D"],
        defaultAspectRatio: "1:1",
        direction:
            "把主题转换为有限几何面、清楚色块和可辨识剪影，建立一个带边界的微缩地台",
        camera: "等距或轻微俯视，完整显示地台轮廓和主体关系，避免极端透视",
        finish: "哑光材质、柔和环境光和清晰接触阴影，色彩简洁但层次分明",
        constraints: "不混入照片纹理、复杂曲面、过度反射、漂浮物体、文字和水印",
    },
    {
        id: "stained-glass-illustration",
        name: "彩色玻璃叙事",
        shortName: "彩色玻璃",
        target: "image",
        kind: "style",
        description: "用铅条分区、透光色片和象征构图表现主题。",
        tags: ["彩色玻璃", "装饰", "插画"],
        defaultAspectRatio: "2:3",
        direction:
            "将主体归纳为可由铅条支撑的封闭色块，使用象征图形和重复边框建立仪式感",
        camera: "正面平视，整体窗格完整入画，中心主体和周围装饰层级清楚",
        finish: "玻璃颜色有厚薄变化、气泡和微小纹理，背光透亮但黑色铅条保持稳定",
        constraints:
            "所有色块必须可封闭支撑，避免照片级皮肤、无限碎片、随机文字和水印",
    },
    {
        id: "paper-cut-shadowbox",
        name: "纸雕光影剧场",
        shortName: "纸雕光影",
        target: "image",
        kind: "style",
        description: "用多层纸片、切边和真实投影构成立体场景。",
        tags: ["纸雕", "剪纸", "光影"],
        defaultAspectRatio: "16:9",
        direction:
            "把场景拆为前景框、中景主体和远景背景的有限纸层，每层轮廓简洁且可实际裁切",
        camera: "正面微缩剧场视角，层间距离可见，主体不被前景遮挡",
        finish: "纸纤维、切割边缘、层间暖光和真实阴影清楚，使用有限协调色盘",
        constraints:
            "避免真实材质混入、层级穿插、无支撑碎片、塑料三维感、文字和水印",
    },
    {
        id: "bauhaus-geometric-poster",
        name: "包豪斯几何构成",
        shortName: "包豪斯几何",
        target: "image",
        kind: "style",
        description: "以基础几何、功能秩序和有限配色设计现代主视觉。",
        tags: ["包豪斯", "几何", "平面"],
        defaultAspectRatio: "2:3",
        direction: "用圆、方、线和色块重构主题，强调功能、节奏、对齐与视觉重心",
        camera: "纯平面构成，网格清楚，主次通过尺度和位置建立，保留大胆负空间",
        finish: "红黄蓝与黑白或受控替代色盘，边缘锐利，适量纸张印刷颗粒",
        constraints:
            "不生成伪德文、Logo或大段文字，不加入照片级阴影、过多颜色和装饰堆积",
    },
    {
        id: "art-deco-luxury",
        name: "装饰艺术奢华",
        shortName: "装饰艺术",
        target: "image",
        kind: "style",
        description: "以对称几何、金属线条和深色材质呈现克制奢华。",
        tags: ["装饰艺术", "奢华", "几何"],
        defaultAspectRatio: "2:3",
        direction:
            "围绕中心主体构建阶梯、扇形和放射几何，用结构性的金属装饰替代无目的堆砌",
        camera: "正面对称或轻微低机位，线条汇聚于主体，背景层级简洁",
        finish: "深黑、祖母绿、酒红与少量暖金，漆面、黄铜、石材和玻璃反射受控",
        constraints:
            "避免满屏金色、廉价闪粉、随机复古文字、现代Logo、透视错误和水印",
    },
    {
        id: "close-quarters-fight",
        name: "近身打戏编排",
        shortName: "近身打戏",
        target: "video",
        kind: "optimizer",
        description: "设计动作因果明确、空间可读、角色连续的近身打戏。",
        tags: ["打戏", "动作", "编排"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "明确双方位置、目标和招式节拍，按试探、进攻、格挡、反击、结果五拍推进，每个动作由重心和接触点驱动",
        camera: "先用中广景交代空间，再跟随主导动作侧移，碰撞瞬间保持主体完整，必要时只用一次近景强调结果",
        finish: "节奏由短停顿与爆发形成，衣物、头发和环境受力一致，结尾停在可读姿态",
        constraints:
            "不使用无因果乱拳、频繁切镜、穿模、瞬移、肢体变形、过度血腥、闪烁和慢动作滥用",
    },
    {
        id: "sword-duel-choreography",
        name: "剑术对决编排",
        shortName: "剑术对决",
        target: "video",
        kind: "optimizer",
        description: "用距离、步法、剑路与节奏设计清楚的双人对决。",
        tags: ["剑术", "打戏", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "先建立持剑方式、距离和地形，再按逼近、试探、招架、错身和收势推进，剑路与脚步对应",
        camera: "侧向中景保持两人和剑尖同时入画，沿动作轴小幅跟移，不跨越轴线，关键交锋短暂推近",
        finish: "金属碰撞、衣摆和脚下尘土服从真实力学，最后用稳定全身姿态明确胜负或僵持",
        constraints:
            "剑不可弯曲穿体或消失，人物不得换脸换装，避免无重力旋转、镜头乱甩、血腥特写和水印",
    },
    {
        id: "tactical-gunfight-blocking",
        name: "枪战空间调度",
        shortName: "枪战调度",
        target: "video",
        kind: "optimizer",
        description: "以掩体、视线和移动路线组织克制可读的枪战场面。",
        tags: ["枪战", "调度", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "明确人物起点、掩体、目标方向和安全移动路线，以观察、移动、短促交火和换位组成动作逻辑",
        camera: "先用建立镜头交代掩体关系，再在人物同侧肩后或侧跟，保持屏幕方向一致",
        finish: "枪口反光、尘屑和物体反馈短促克制，环境声和动作停顿形成压力，收尾明确新位置",
        constraints:
            "避免无限弹药感、夸张爆炸、无掩体站立、方向跳变、人物变形、血腥展示和教学式武器细节",
    },
    {
        id: "urban-chase-sequence",
        name: "城市追逐戏",
        shortName: "城市追逐",
        target: "video",
        kind: "optimizer",
        description: "用路线、障碍、距离变化与环境互动设计追逐。",
        tags: ["追逐", "动作", "城市"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "明确追与逃的目标和初始距离，安排转角、跨越、避让和一次局势反转，让环境成为动作的一部分",
        camera: "稳定侧跟与后跟为主，转角前先给方向信息，速度变化时保持人物轮廓和地面接触可读",
        finish: "脚步、衣物、车辆和人群反应符合速度，结尾以距离拉近、脱逃或新障碍形成句号",
        constraints:
            "避免人物瞬移、随机障碍、镜头穿墙、速度忽快忽慢、背景融化、交通逻辑错误和频繁切镜",
    },
    {
        id: "one-take-action-path",
        name: "一镜到底动作路径",
        shortName: "一镜到底",
        target: "video",
        kind: "optimizer",
        description: "将复杂动作拆成可连续执行的空间路径和镜头节点。",
        tags: ["一镜到底", "运镜", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "把事件拆成三个连续空间段，每段只有一个主要动作，并用门、转角或遮挡自然连接",
        camera: "从清楚建立镜头开始，平稳跟随主体，经过遮挡时调整高度或方向，始终保持运动轴和空间线索",
        finish: "镜头加减速跟随人物呼吸与动作强度，末尾停在新的完整构图而非突然中断",
        constraints:
            "禁止瞬移、隐形剪辑感、穿墙、主体丢失、镜头无故旋转、场景重建和连续性破坏",
    },
    {
        id: "impact-slow-motion",
        name: "冲击瞬间慢动作",
        shortName: "冲击慢动作",
        target: "video",
        kind: "optimizer",
        description: "通过正常速度、短暂慢动作和恢复速度突出关键冲击。",
        tags: ["慢动作", "冲击", "动作"],
        defaultAspectRatio: "16:9",
        defaultDuration: 6,
        direction:
            "先用正常速度建立动作动机，只在接触前后短暂减速，清楚展示重心转移、接触和反作用",
        camera: "中近景侧向观察，接触点与双方身体保持入画，慢动作期间镜头仅轻微推进",
        finish: "碎屑、布料、肌肉和道具响应有先后，冲击后恢复正常速度并给出结果姿态",
        constraints:
            "慢动作不得覆盖全片，避免果冻形变、重复撞击、无来源粒子、镜头环绕、血腥特写和闪烁",
    },
    {
        id: "product-orbit-reveal",
        name: "商品环绕展示",
        shortName: "商品环绕",
        target: "video",
        kind: "optimizer",
        description: "用受控环绕、灯光扫过和细节停顿展示商品。",
        tags: ["商品", "广告", "运镜"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "保持产品形状和包装不变，从整体轮廓、核心材质到功能细节依次揭示",
        camera: "从三分之四主视角开始，缓慢环绕不超过九十度，中段短暂停留在关键细节，回到英雄角度",
        finish: "灯光扫过曲面但标签持续可辨，转速平稳，最后产品稳定落在干净主视觉构图",
        constraints:
            "不得变形、旋转标签、添加部件、生成伪文字、让产品漂移或使用无意义粒子爆炸",
    },
    {
        id: "food-motion-commercial",
        name: "食品动态广告",
        shortName: "食品动态",
        target: "video",
        kind: "optimizer",
        description: "把倾倒、切开、蒸汽和装盘组织成有食欲的短广告。",
        tags: ["食品", "广告", "动态"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "选择一个核心食物动作，从准备、发生到诱人结果三段推进，突出真实重量、黏度和温度",
        camera: "微距或近景固定主体，跟随倾倒或切割方向小幅移动，焦点稳定在最有食欲的表面",
        finish: "液体、酥皮、蒸汽和碎屑遵守物理，收尾停在完整成品并保留自然余动",
        constraints:
            "避免食材凭空出现、无限拉丝、液体反重力、器皿变形、过饱和、文字和水印",
    },
    {
        id: "fashion-runway-sequence",
        name: "时装走秀镜头",
        shortName: "时装走秀",
        target: "video",
        kind: "optimizer",
        description: "保持服装和人物一致，清楚呈现步态、轮廓与面料运动。",
        tags: ["时尚", "走秀", "人物"],
        defaultAspectRatio: "9:16",
        defaultDuration: 8,
        direction:
            "人物以稳定步态走向镜头，服装轮廓、层次和配饰持续一致，动作服务面料展示",
        camera: "正面中长焦轻微后退，保持全身和脚步入画，中段可短暂切换或过渡到侧向细节",
        finish: "面料随步态和空气自然摆动，灯光与T台反射稳定，结尾用定点转身或停步完成",
        constraints:
            "不得换脸换装、改变花纹、脚部滑行、背景人群复制、肢体扭曲、闪烁和过度慢动作",
    },
    {
        id: "two-person-dialogue",
        name: "双人对白调度",
        shortName: "双人对白",
        target: "video",
        kind: "optimizer",
        description: "用视线、反应和停顿组织自然的双人对话场面。",
        tags: ["对白", "人物", "调度"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "明确双方关系、情绪目标和潜台词，动作以倾听、眼神、呼吸和少量手势为主",
        camera: "先用双人镜头建立轴线，再以同侧肩后或稳定双人景持续观察，避免频繁切换",
        finish: "对话节奏包含真实停顿与反应，环境保持连续，结尾落在有意义的沉默或视线变化",
        constraints:
            "禁止抢话式口型混乱、眼神漂移、跨轴、人物换脸、手势循环、背景闪烁和字幕水印",
    },
    {
        id: "emotional-closeup-performance",
        name: "情绪特写表演",
        shortName: "情绪特写",
        target: "video",
        kind: "optimizer",
        description: "用微表情、呼吸和视线变化完成克制的近景表演。",
        tags: ["表演", "特写", "情绪"],
        defaultAspectRatio: "16:9",
        defaultDuration: 6,
        direction:
            "从中性状态开始，让情绪通过眼神停顿、呼吸、下颌和嘴角逐步显现，不用夸张哭喊",
        camera: "稳定近景或极慢推近，眼睛处于清晰焦点，视线方向和头部角度保持连续",
        finish: "柔和侧光保留皮肤纹理和眼神光，情绪在最后一秒达到明确但克制的状态",
        constraints:
            "避免脸部变形、换脸、过度磨皮、眼泪突然出现、口型抖动、镜头摇晃和背景跳变",
    },
    {
        id: "cinematic-reveal-shot",
        name: "电影式揭示镜头",
        shortName: "揭示镜头",
        target: "video",
        kind: "optimizer",
        description: "通过遮挡、移动和景别变化逐步揭示关键信息。",
        tags: ["揭示", "运镜", "电影"],
        defaultAspectRatio: "16:9",
        defaultDuration: 7,
        direction:
            "先展示局部或误导性信息，再通过主体动作或镜头移动揭示完整人物、物体或空间关系",
        camera: "从遮挡后缓慢侧移、后拉或升高，运动方向单一，揭示完成后保持稳定构图",
        finish: "光线和声音提示在揭示前适度铺垫，最终信息清楚可读并停留足够时间",
        constraints:
            "避免多次反复揭示、无动机旋转、突然变焦、穿模、场景替换、主体变形和过度特效",
    },
    {
        id: "match-cut-transition",
        name: "匹配剪辑转场",
        shortName: "匹配转场",
        target: "video",
        kind: "optimizer",
        description: "用形状、动作或构图相似性连接两个场景。",
        tags: ["转场", "剪辑", "叙事"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "定义前后两个场景及共同的形状、运动方向或主体位置，让转场推动意义而非只做炫技",
        camera: "第一段在匹配构图上结束，第二段从相同屏幕位置和运动方向开始，切点清楚",
        finish: "色彩或光线可变化但轮廓与节奏连续，转场后留出时间让新场景建立",
        constraints:
            "禁止随机溶解、主体突变、运动方向反转、连续多次转场、画面闪白和身份不一致",
    },
    {
        id: "time-lapse-transformation",
        name: "延时变化叙事",
        shortName: "延时变化",
        target: "video",
        kind: "optimizer",
        description: "表现建造、生长、天气或昼夜变化的连续过程。",
        tags: ["延时", "变化", "时间"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "定义清楚的初始状态、变化阶段和最终状态，变化必须有可观察的物理或时间原因",
        camera: "机位完全锁定或只做极慢稳定移动，用固定参照物保证空间连续",
        finish: "光影、云层、人流或物体逐步变化，速度平滑，最终状态稳定停留",
        constraints:
            "不得瞬间替换、建筑融化、物体无中生有、机位漂移、天空闪烁、人物复制和时间倒流",
    },
    {
        id: "video-character-continuity",
        name: "视频角色连续性",
        shortName: "角色连续",
        target: "video",
        kind: "optimizer",
        description: "锁定角色身份、服装、道具和运动方向，减少视频漂移。",
        tags: ["角色", "一致性", "视频"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "明确不可变的面部、发型、体型、服装、道具和左右手关系，只安排一个主要动作",
        camera: "使用稳定中景或跟随镜头，避免遮挡脸部和快速绕拍，保持人物屏幕方向",
        finish: "动作有准备、执行和结束，光线与背景连续，最后姿态由前一动作自然到达",
        constraints:
            "禁止换脸、换装、年龄变化、道具消失、左右翻转、肢体增减、背景重绘和跳帧",
    },
    {
        id: "found-footage-suspense",
        name: "手持伪纪录悬疑",
        shortName: "伪纪录片",
        target: "video",
        kind: "style",
        description: "用有动机的手持观察、有限视野和真实反应营造悬疑。",
        tags: ["伪纪录", "悬疑", "手持"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "从普通观察开始，异常通过环境细节逐步出现，拍摄者的迟疑和重新取景成为叙事的一部分",
        camera: "自然手持但可读，自动对焦和曝光只做轻微调整，镜头先发现线索再跟随人物反应",
        finish: "使用现场光和环境声逻辑，紧张感来自信息不足，结尾停在一个可辨认但未完全解释的发现",
        constraints:
            "避免持续剧烈抖动、廉价故障滤镜、突然怪脸、随机尖叫、画面全黑、血腥和时间码水印",
    },
    {
        id: "observational-documentary",
        name: "观察式纪录片",
        shortName: "观察纪录",
        target: "video",
        kind: "style",
        description: "以自然行为、真实环境和克制摄影记录人物。",
        tags: ["纪录片", "写实", "人物"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        direction:
            "人物专注真实工作或生活行为，不看镜头表演，环境细节交代时间、地点和社会关系",
        camera: "35至50毫米自然视角，肩扛或稳定手持在不打扰的位置观察，偶尔轻微重构图",
        finish: "现场光、真实停顿和环境声逻辑，结尾保留一个自然动作或声音余韵",
        constraints:
            "避免广告摆拍、过度磨皮、夸张景深、频繁变焦、戏剧化慢动作、字幕和水印",
    },
    {
        id: "noir-thriller-scene",
        name: "黑色悬疑短场景",
        shortName: "黑色悬疑",
        target: "video",
        kind: "style",
        description: "以低调光、遮挡和道德压力构建克制的黑色悬疑。",
        tags: ["黑色电影", "悬疑", "光影"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "人物在一个明确选择或秘密中行动，信息通过影子、反射、门缝和停顿逐步显现",
        camera: "固定中景、缓慢横移或谨慎推近，利用前景遮挡和深层空间保持不安",
        finish: "硬侧光、深阴影、潮湿反射和有限色彩，结尾落在决定性动作或未说出口的反应",
        constraints:
            "避免全黑看不清、无意义百叶窗、过量烟雾、连续闪电、突然怪物、人物变形和滤镜堆叠",
    },
    {
        id: "silent-comedy-beat",
        name: "默片式动作喜剧",
        shortName: "默片喜剧",
        target: "video",
        kind: "style",
        description: "用清楚铺垫、误会、反转和身体动作制造无对白喜剧。",
        tags: ["喜剧", "默片", "动作"],
        defaultAspectRatio: "4:3",
        defaultDuration: 8,
        direction:
            "建立一个简单目标和视觉规则，通过准备、错误执行、短暂停顿和反转形成笑点",
        camera: "稳定全身中景让动作完整可见，必要时只用一次道具特写，保持舞台般空间清楚",
        finish: "动作节奏精准，反应停顿足够，轻微复古质感但人物运动自然，结尾形成视觉句号",
        constraints:
            "避免随机摔倒、动作循环、过度快放、身体伤害细节、镜头乱切、文字卡和夸张变形",
    },
    {
        id: "miniature-stopmotion-video",
        name: "微缩定格动画",
        shortName: "微缩定格",
        target: "video",
        kind: "style",
        description: "用可感知的逐帧节奏和手工材质制作微缩动画。",
        tags: ["定格", "微缩", "手工"],
        defaultAspectRatio: "16:9",
        defaultDuration: 8,
        direction:
            "角色和物体由黏土、纸张、木材或布料制成，动作分段清楚并保留轻微逐帧跳动",
        camera: "微缩场景固定机位或短距离轨道移动，景深与模型尺度一致",
        finish: "手工接缝、指纹、纸边和真实阴影可见，动作以有意停顿结束",
        constraints:
            "避免真人皮肤、光滑CG、模型融化、连续液态变形、镜头漂移、随机文字和帧间换色",
    },
    {
        id: "anime-action-layout",
        name: "原创动画动作分镜",
        shortName: "动画动作",
        target: "video",
        kind: "style",
        description: "以清楚姿势、速度形和有限镜头设计原创二维动作段落。",
        tags: ["动画", "动作", "分镜"],
        defaultAspectRatio: "16:9",
        defaultDuration: 7,
        direction:
            "设计三个关键姿势：蓄力、爆发、落点，用夸张但可读的轮廓和方向线表达速度",
        camera: "先稳定展示空间，爆发时沿动作方向快速跟移，落点立即稳定，不做无意义绕拍",
        finish: "线条粗细、色块、阴影和角色设计保持一致，速度线只在最快阶段出现",
        constraints:
            "不模仿具体动画作品或角色，避免身份漂移、连续闪光、无限变形、乱切和不可读背景",
    },
    {
        id: "music-visual-rhythm",
        name: "音乐节奏视觉化",
        shortName: "音乐视觉",
        target: "video",
        kind: "style",
        description: "把节拍、层次和段落映射为运动、色彩与剪辑。",
        tags: ["音乐", "节奏", "视觉"],
        defaultAspectRatio: "16:9",
        defaultDuration: 10,
        direction:
            "定义主节拍、低频、旋律和段落变化对应的形体运动、尺度、色彩或环境响应",
        camera: "基础机位稳定，镜头移动只在段落转折发生，视觉元素按同一空间规则变化",
        finish: "强拍有清楚但克制的响应，弱拍保留呼吸，结尾回收至一个稳定视觉母题",
        constraints:
            "避免每拍闪白、随机粒子、无规则缩放、频繁镜头旋转、视觉过载、文字和品牌Logo",
    },
    {
        id: "travel-montage-story",
        name: "旅行蒙太奇叙事",
        shortName: "旅行蒙太奇",
        target: "video",
        kind: "style",
        description: "用地点建立、人物体验和细节观察组成有情绪的旅行短片。",
        tags: ["旅行", "蒙太奇", "叙事"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        direction:
            "按到达、探索、交流和余韵四段选择有因果的画面，人物体验比景点打卡更重要",
        camera: "广景交代地点，中景跟随行动，近景捕捉手部、食物和环境细节，运动方向保持连续",
        finish: "自然光和地点环境声统一色调，剪辑节奏由快到慢，结尾以离开或回望收束",
        constraints:
            "避免景点随机拼贴、无人机滥用、过饱和、人物换装换脸、时间天气跳变和旅游广告字幕",
    },
    {
        id: "vertical-social-hook",
        name: "竖屏前三秒钩子",
        shortName: "竖屏钩子",
        target: "video",
        kind: "optimizer",
        description: "为短视频设计立即可懂的视觉问题、动作与结果预告。",
        tags: ["竖屏", "短视频", "广告"],
        defaultAspectRatio: "9:16",
        defaultDuration: 8,
        direction:
            "第一秒展示异常、结果或明确问题，随后立刻进入动作证明，最后给出可视化结果",
        camera: "主体居中偏上并适配手机安全区，近景优先，动作纵向展开，镜头移动简洁",
        finish: "高对比但自然的照明，节奏紧凑无空镜，最后一秒保留清楚成品或反应",
        constraints:
            "不依赖大段文字、夸张箭头、闪烁转场、虚假界面、重复动作、人物变形和水印",
    },
    {
        id: "trailer-beat-structure",
        name: "预告片节奏模板",
        shortName: "预告片节奏",
        target: "video",
        kind: "optimizer",
        description: "把故事压缩为世界、冲突、升级、停顿和最终钩子。",
        tags: ["预告片", "节奏", "叙事"],
        defaultAspectRatio: "16:9",
        defaultDuration: 12,
        direction:
            "按世界建立、人物目标、危险升级、短暂停顿和最终悬念五拍组织，不提前泄露完整结局",
        camera: "每一拍只使用一个清楚镜头意图，景别由宽到近，动作方向和人物身份连续",
        finish: "节奏逐步加快后突然留白，最终以最强视觉问题结束，色彩与光线属于同一世界",
        constraints:
            "禁止无关镜头堆砌、全程高速、随机爆炸、重复台词、身份漂移、文字卡、Logo和水印",
    },
];

export const CREATIVE_SKILL_PACK_50: CreativeSkill[] =
    DEFINITIONS.map(buildSkill);
