import "server-only";

import { existsSync } from "node:fs";
import { join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { logger } from "@/lib/logger";
import type {
    PluginConfig,
    PluginsRegistry,
} from "@/lib/plugins/plugins-registry-schema";
import { runPluginsScanner } from "@/lib/plugins/plugins-scanner.server";
import { pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";

let cached: PluginsRegistry | null = null;
let watcher: FSWatcher | null = null;
let rescanTimer: NodeJS.Timeout | null = null;

const BANANA_MODELS = [
    "nano-banana-pro-1k",
    "nano-banana-pro-2k",
    "nano-banana-pro-4k",
    "nano-banana2-1k",
    "nano-banana2-2k",
    "nano-banana2-4k",
];

const IMG2_MODELS = [
    "gpt-image-2",
    "gpt-image-2-1k",
    "gpt-image-2-2k",
    "gpt-image-2-4k",
];

const NEW_CHANNEL_MODELS = [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
    "gpt-image-2-pro",
];

const BYTEDANCE_VIDEO_MODELS = [
    "doubao-seedance-2-5-260628",
    "doubao-seedance-2-0-260128",
    "doubao-seedance-2-0-fast-260128",
];

const ALLOWED_BUNDLED_PLUGIN_IDS = new Set([
    "tongflow-api-img2-relay",
    "tongflow-api-banana-relay",
    "tongflow-api-new-channel",
    "tongflow-api-bytedance",
    "tongflow-api-prompt-llm",
]);

const CORE_PLUGIN_CONFIGS: Record<string, PluginConfig> = {
    "tongflow-api-banana-relay": {
        localSubdir: "tongflow-api-banana-relay",
        methodsByNodeSlot: {
            "image-gen": { methodName: "image_gen", models: BANANA_MODELS },
            "image-edit": { methodName: "image_edit", models: BANANA_MODELS },
            "image-fusion": {
                methodName: "image_fusion",
                models: BANANA_MODELS,
            },
        },
        entryFile: "entry.py",
        needsDeploy: false,
    },
    "tongflow-api-img2-relay": {
        localSubdir: "tongflow-api-img2-relay",
        methodsByNodeSlot: {
            "image-gen": { methodName: "image_gen", models: IMG2_MODELS },
            "image-edit": { methodName: "image_edit", models: IMG2_MODELS },
            "image-fusion": {
                methodName: "image_fusion",
                models: IMG2_MODELS,
            },
        },
        entryFile: "entry.py",
        needsDeploy: false,
    },
    "tongflow-api-new-channel": {
        localSubdir: "tongflow-api-new-channel",
        methodsByNodeSlot: {
            "image-gen": {
                methodName: "image_gen",
                models: NEW_CHANNEL_MODELS,
            },
            "image-edit": {
                methodName: "image_edit",
                models: NEW_CHANNEL_MODELS,
            },
            "image-fusion": {
                methodName: "image_fusion",
                models: NEW_CHANNEL_MODELS,
            },
        },
        entryFile: "entry.py",
        needsDeploy: false,
    },
    "tongflow-api-bytedance": {
        localSubdir: "tongflow-api-bytedance",
        methodsByNodeSlot: {
            "text-gen-video": {
                methodName: "text_gen_video",
                models: BYTEDANCE_VIDEO_MODELS,
            },
            "image-gen-video": {
                methodName: "image_gen_video",
                models: BYTEDANCE_VIDEO_MODELS,
            },
            "images-gen-video": {
                methodName: "images_gen_video",
                models: BYTEDANCE_VIDEO_MODELS,
            },
        },
        entryFile: "entry.py",
        needsDeploy: false,
    },
    "tongflow-api-prompt-llm": {
        localSubdir: "tongflow-api-prompt-llm",
        methodsByNodeSlot: {
            "gen-text": { methodName: "gen_text" },
        },
        entryFile: "entry.py",
        needsDeploy: false,
    },
};

/**
 * The desktop installer always ships these providers. Keep them usable when a
 * new PC blocks the Python discovery subprocess (antivirus, execution policy,
 * unusual profile path, etc.). We only register providers whose entry.py was
 * actually materialized, so source/web deployments do not gain phantom items.
 */
function withCorePluginFallback(registry: PluginsRegistry): PluginsRegistry {
    const plugins = { ...registry.plugins };
    const nodePluginMap: Record<string, string[]> = {};
    for (const [slot, ids] of Object.entries(registry.nodePluginMap)) {
        nodePluginMap[slot] = [...ids];
    }

    for (const [pluginId, config] of Object.entries(CORE_PLUGIN_CONFIGS)) {
        if (
            !existsSync(
                join(
                    pluginsDir(),
                    config.localSubdir,
                    config.entryFile ?? "entry.py",
                ),
            )
        )
            continue;
        const discovered = plugins[pluginId];
        if (!discovered) {
            plugins[pluginId] = config;
        } else {
            const methodsByNodeSlot = { ...config.methodsByNodeSlot };
            for (const [slot, method] of Object.entries(
                discovered.methodsByNodeSlot,
            )) {
                const bundledMethod = config.methodsByNodeSlot[slot];
                methodsByNodeSlot[slot] = {
                    ...bundledMethod,
                    ...method,
                    // The Python scanner discovers method names but does not
                    // currently preserve TONGFLOW_SLOT_MODELS. Retain the
                    // installer-bundled model list when discovery returns none.
                    models: method.models?.length
                        ? method.models
                        : bundledMethod?.models,
                };
            }
            plugins[pluginId] = {
                ...config,
                ...discovered,
                methodsByNodeSlot,
            };
        }
        for (const slot of Object.keys(config.methodsByNodeSlot)) {
            const current = nodePluginMap[slot] ?? [];
            nodePluginMap[slot] = current.includes(pluginId)
                ? current
                : [...current, pluginId];
        }
    }

    const allowedPlugins = Object.fromEntries(
        Object.entries(plugins).filter(([pluginId]) =>
            ALLOWED_BUNDLED_PLUGIN_IDS.has(pluginId),
        ),
    );
    const allowedNodePluginMap = Object.fromEntries(
        Object.entries(nodePluginMap).map(([slot, pluginIds]) => [
            slot,
            pluginIds.filter((pluginId) =>
                ALLOWED_BUNDLED_PLUGIN_IDS.has(pluginId),
            ),
        ]),
    );

    return {
        ...registry,
        plugins: allowedPlugins,
        nodePluginMap: allowedNodePluginMap,
    };
}

function emptyRegistry(message?: string): PluginsRegistry {
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        nodePluginMap: {},
        plugins: {},
        errors: message
            ? [
                  {
                      pluginId: "<scan>",
                      message,
                  },
              ]
            : undefined,
    };
}

function scanAndCache(): PluginsRegistry {
    ensureDevWatcher();
    try {
        cached = withCorePluginFallback(runPluginsScanner());
        return cached;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn(
            "[plugins] Scanner failed, using bundled plugin fallback:",
            message,
        );
        cached = withCorePluginFallback(emptyRegistry(message));
        return cached;
    }
}

function scheduleRescan(): void {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
        try {
            cached = withCorePluginFallback(runPluginsScanner());
            logger.debug("[plugins] Registry refreshed from scanner");
        } catch (e) {
            logger.warn(
                "[plugins] Registry rescan failed; keeping previous cache:",
                e instanceof Error ? e.message : String(e),
            );
        }
    }, 300);
}

// The dev watcher starts on the first explicit registry load/refresh, not via
// feature-registry module initialization, so lifecycle APIs can refresh safely.
function ensureDevWatcher(): void {
    if (process.env.NODE_ENV === "production" || watcher) return;
    watcher = chokidar.watch(
        [
            join(pluginsDir(), "**", "*.py"),
            join(resourcesDir(), "config", "tongflow.abi.json"),
        ],
        {
            ignoreInitial: true,
            ignored: ["**/__pycache__/**", "**/.venv/**", "**/node_modules/**"],
        },
    );
    watcher.on("all", scheduleRescan);
    watcher.on("error", (e) => {
        logger.warn(
            "[plugins] Registry watcher error:",
            e instanceof Error ? e.message : String(e),
        );
    });
}

export function loadPluginsRegistry(): PluginsRegistry {
    if (cached) return cached;
    return scanAndCache();
}

export function invalidatePluginsRegistry(): PluginsRegistry {
    cached = null;
    if (rescanTimer) {
        clearTimeout(rescanTimer);
        rescanTimer = null;
    }
    return scanAndCache();
}

export function getNodePluginIds(nodeSlot: string): string[] {
    const reg = loadPluginsRegistry();
    const list = reg.nodePluginMap[nodeSlot] ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of list) {
        const x = id.trim();
        if (!x || seen.has(x)) continue;
        seen.add(x);
        out.push(x);
    }
    return out;
}

export function getPluginConfig(pluginId: string): PluginConfig | null {
    const reg = loadPluginsRegistry();
    return reg.plugins[pluginId] ?? null;
}
