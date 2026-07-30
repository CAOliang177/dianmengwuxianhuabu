import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const workspace = path.resolve(process.argv[2] ?? ".");
const sources = path.resolve(process.argv[3] ?? "../third-party-sources");
const outputFile = path.join(
    workspace,
    "src",
    "lib",
    "multi-source-skill-atlas.json",
);
const coverOutput = path.join(
    workspace,
    "public",
    "skill-covers",
    "multi-source-atlas",
);

const entries = [];
fs.rmSync(coverOutput, { recursive: true, force: true });

function read(file) {
    return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function firstHeading(markdown, fallback) {
    return (
        markdown
            .match(/^#\s+(.+)$/m)?.[1]
            ?.replace(/^[^\p{L}\p{N}]+/u, "")
            .trim() ?? fallback
    );
}

function excerpt(markdown) {
    const blocks = [
        ...markdown.matchAll(/```(?:json|text|markdown)?\n([\s\S]*?)\n```/g),
    ]
        .map((match) => match[1].trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
    if (blocks[0]) return blocks[0].slice(0, 8000);
    return markdown
        .replace(/^---\n[\s\S]*?\n---\n/, "")
        .trim()
        .slice(0, 8000);
}

function ratioFrom(text, fallback) {
    const candidates = [
        /default=\\?"(\d+:\d+)\\?"/i,
        /aspect[_ ]ratio["']?\s*[:=]\s*["']?(\d+:\d+)/i,
        /(?:format|比例)[：:]\s*(\d+:\d+)/i,
    ];
    for (const pattern of candidates) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
    }
    return fallback;
}

function words(value) {
    return value
        .replace(/\.md$/i, "")
        .split(/[-_/\\\s]+/)
        .filter(Boolean)
        .slice(0, 4);
}

function addFileEntry({
    id,
    file,
    source,
    target,
    category,
    kind = "optimizer",
    cover,
    title,
}) {
    const markdown = read(file);
    const name = title ?? firstHeading(markdown, path.basename(file, ".md"));
    const promptTemplate = excerpt(markdown);
    entries.push({
        id,
        name,
        target,
        kind,
        description: `来自现成开源 Skill 的「${name}」工作流，可直接结合当前主题生成提示词。`,
        tags: [...new Set([category, ...words(path.basename(file))])],
        defaultAspectRatio: ratioFrom(
            promptTemplate,
            target === "video" ? "16:9" : "1:1",
        ),
        defaultDuration: target === "video" ? 8 : undefined,
        cover:
            cover ??
            (target === "video"
                ? "/skill-covers/cinematic-director.png"
                : "/skill-covers/style-lab.png"),
        source,
        promptTemplate,
    });
}

// Source 1: ConardLi/garden-skills — 55 focused image templates.
const gardenRoot = path.join(
    sources,
    "garden-skills",
    "skills",
    "gpt-image-2",
    "references",
);
const gardenDirectories = [
    "poster-and-campaigns",
    "product-visuals",
    "portraits-and-characters",
    "storyboards-and-sequences",
    "ui-mockups",
    "branding-and-packaging",
    "scenes-and-illustrations",
    "maps",
    "typography-and-text-layout",
    "grids-and-collages",
];
for (const directory of gardenDirectories) {
    const directoryPath = path.join(gardenRoot, directory);
    for (const filename of fs
        .readdirSync(directoryPath)
        .filter((name) => name.endsWith(".md"))
        .sort()) {
        addFileEntry({
            id: `multi-garden-${directory}-${path.basename(filename, ".md")}`,
            file: path.join(directoryPath, filename),
            source: `ConardLi/garden-skills:${directory}/${filename}`,
            target: "image",
            category: directory,
            kind:
                directory.includes("poster") ||
                directory.includes("scenes") ||
                directory.includes("portraits")
                    ? "style"
                    : "optimizer",
        });
    }
}

// Source 2: smixs/visual-skills — 30 image/video craft modules.
const visualRoot = path.join(sources, "visual-skills");
const visualImageFiles = fs
    .readdirSync(path.join(visualRoot, "image", "references"), {
        recursive: true,
        withFileTypes: true,
    })
    .filter(
        (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".md") &&
            !["models.md", "gpt-image.md", "nano-banana.md"].includes(
                entry.name,
            ),
    )
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
const visualVideoFiles = fs
    .readdirSync(path.join(visualRoot, "video", "references"), {
        recursive: true,
        withFileTypes: true,
    })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
for (const file of [...visualImageFiles, ...visualVideoFiles]) {
    const target = file.includes(`${path.sep}video${path.sep}`)
        ? "video"
        : "image";
    addFileEntry({
        id: `multi-visual-${target}-${path.basename(file, ".md")}`,
        file,
        source: `smixs/visual-skills:${path.relative(visualRoot, file).replaceAll("\\", "/")}`,
        target,
        category: target === "video" ? "视频导演" : "图片导演",
        kind: file.includes(`${path.sep}patterns${path.sep}`)
            ? "style"
            : "optimizer",
    });
}

// Source 3: MapleShaw/seedance2.0-prompt-skill — 13 modules + 7 real cases.
const seedanceRoot = path.join(sources, "seedance2-prompt-skill");
const seedanceReferenceFiles = fs
    .readdirSync(path.join(seedanceRoot, "references"))
    .filter((name) => name.endsWith(".md"))
    .sort();
for (const filename of seedanceReferenceFiles) {
    const target = ["image-generation.md", "image-to-prompt.md"].includes(
        filename,
    )
        ? "image"
        : "video";
    addFileEntry({
        id: `multi-seedance-module-${path.basename(filename, ".md")}`,
        file: path.join(seedanceRoot, "references", filename),
        source: `MapleShaw/seedance2.0-prompt-skill:references/${filename}`,
        target,
        category: target === "video" ? "Seedance 视频" : "Seedance 图片",
    });
}
const seedanceCases = [
    "case-30-时尚快剪服装广告三语版.md",
    "case-29-情侣欧洲旅行八宫格回忆短片.md",
    "case-27-F1维修区赛前pit-lane记录.md",
    "case-14-沙滩排球游戏3连击.md",
    "case-13-街球1v1进攻分解.md",
    "case-11-雨夜女性四宫格电影预告.md",
    "case-08-厨房抖音爆款.md",
];
for (const filename of seedanceCases) {
    addFileEntry({
        id: `multi-seedance-case-${path.basename(filename, ".md")}`,
        file: path.join(seedanceRoot, "experiments", "cases", filename),
        source: `MapleShaw/seedance2.0-prompt-skill:experiments/cases/${filename}`,
        target: "video",
        category: "视频案例",
        kind: "style",
    });
}

// Source 4: nidhinjs/prompt-master — four visual prompt frameworks.
const promptMasterFile = path.join(
    sources,
    "prompt-master",
    "references",
    "templates.md",
);
const promptMasterMarkdown = read(promptMasterFile);
for (const letter of ["I", "J", "K", "L"]) {
    const pattern = new RegExp(
        `^## Template ${letter}[^\\n]*\\n([\\s\\S]*?)(?=^## Template |(?![\\s\\S]))`,
        "m",
    );
    const match = promptMasterMarkdown.match(pattern);
    if (!match) throw new Error(`Missing Prompt Master template ${letter}`);
    const section = `# ${
        promptMasterMarkdown.match(
            new RegExp(`^## (Template ${letter}[^\\n]*)`, "m"),
        )?.[1]
    }\n${match[1]}`;
    const tempFile = path.join(
        workspace,
        ".generated-skill-source",
        `prompt-master-${letter}.md`,
    );
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    fs.writeFileSync(tempFile, section, "utf8");
    addFileEntry({
        id: `multi-prompt-master-${letter.toLowerCase()}`,
        file: tempFile,
        source: `nidhinjs/prompt-master:Template ${letter}`,
        target: "image",
        category: "提示词框架",
    });
}

// Source 5: rich5000/seedance-prompt-guide — main video prompt Skill.
addFileEntry({
    id: "multi-rich5000-seedance-guide",
    file: path.join(sources, "seedance-prompt-guide", "SKILL.md"),
    source: "rich5000/seedance-prompt-guide:SKILL.md",
    target: "video",
    category: "Seedance 视频",
    title: "Seedance 2.0 专业提示词",
});

// Source 6: wuyoscar/gpt_image_2_skill — 18 fashion/fine-art/illustration prompts.
const wuyoscarRoot = path.join(sources, "gpt-image2-skill");
const galleryFiles = fs
    .readdirSync(path.join(wuyoscarRoot, "skills", "gpt-image", "references"))
    .filter((name) => name.startsWith("gallery-") && name.endsWith(".md"));
const wantedNumbers = new Set(
    Array.from({ length: 18 }, (_, index) => index + 129),
);
for (const filename of galleryFiles) {
    const markdown = read(
        path.join(wuyoscarRoot, "skills", "gpt-image", "references", filename),
    );
    const headingPattern =
        /^### No\. (\d+) · (.+)\n([\s\S]*?)(?=^### No\. |(?![\s\S]))/gm;
    for (const match of markdown.matchAll(headingPattern)) {
        const number = Number(match[1]);
        if (!wantedNumbers.has(number)) continue;
        const body = match[3];
        const image = body.match(/^- Image: `([^`]+)`/m)?.[1];
        const prompt = body.match(/```text\n([\s\S]*?)\n```/)?.[1]?.trim();
        if (!image || !prompt) {
            throw new Error(`Missing wuyoscar prompt ${number}`);
        }
        const sourceImage = path.join(wuyoscarRoot, image);
        const coverName = `wuyoscar-${number}.webp`;
        fs.mkdirSync(coverOutput, { recursive: true });
        await sharp(sourceImage)
            .resize(640, 360, {
                fit: "cover",
                position: "attention",
            })
            .webp({ quality: 78 })
            .toFile(path.join(coverOutput, coverName));
        entries.push({
            id: `multi-wuyoscar-${number}`,
            name: match[2].trim(),
            target: "image",
            kind: "style",
            description: `现成的开源风格提示词：${match[2].trim()}。`,
            tags: ["风格化", "图片", `No.${number}`],
            defaultAspectRatio: ratioFrom(body, "4:5"),
            cover: `/skill-covers/multi-source-atlas/${coverName}`,
            source: `wuyoscar/gpt_image_2_skill:No.${number}`,
            promptTemplate: prompt,
        });
    }
}

entries.sort((left, right) => left.id.localeCompare(right.id));

if (entries.length !== 128) {
    const counts = Object.groupBy(
        entries,
        (entry) => entry.source.split(":")[0],
    );
    throw new Error(
        `Expected 128 entries, got ${entries.length}: ${JSON.stringify(
            Object.fromEntries(
                Object.entries(counts).map(([key, value]) => [
                    key,
                    value.length,
                ]),
            ),
        )}`,
    );
}

const names = new Map();
for (const entry of entries) {
    const count = names.get(entry.name) ?? 0;
    names.set(entry.name, count + 1);
    if (count > 0) entry.name = `${entry.name} ${count + 1}`;
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(
    outputFile,
    `${JSON.stringify(
        {
            selectedCount: entries.length,
            sources: [
                "ConardLi/garden-skills",
                "smixs/visual-skills",
                "MapleShaw/seedance2.0-prompt-skill",
                "nidhinjs/prompt-master",
                "rich5000/seedance-prompt-guide",
                "wuyoscar/gpt_image_2_skill",
            ],
            entries,
        },
        null,
        2,
    )}\n`,
    "utf8",
);

fs.rmSync(path.join(workspace, ".generated-skill-source"), {
    recursive: true,
    force: true,
});

console.log(`Generated ${entries.length} Skills from 6 source projects.`);
