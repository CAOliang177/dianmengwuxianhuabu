import fs from "node:fs";
import path from "node:path";
import { bundledPluginsDir, dataDir, pluginsDir } from "./paths";

const PUBLIC_IMAGE_PRESETS: Record<string, string> = {
	BANANA_BASE_URL: "http://ai.maxagent.top/v1",
	BANANA_IMAGE_MODEL: "nano-banana2-1k",
	BANANA_ASYNC: "true",
	BANANA_EDIT_ASYNC: "false",
	BANANA_TIMEOUT: "600",
	IMG2_BASE_URL: "http://ai.maxagent.top/v1",
	IMG2_IMAGE_MODEL: "gpt-image-2",
	IMG2_ASYNC: "true",
	IMG2_EDIT_ASYNC: "false",
	IMG2_TIMEOUT: "600",
	NEW_CHANNEL_BASE_URL: "http://ai.maxagent.top/v1",
	NEW_CHANNEL_IMAGE_MODEL: "gemini-3-pro-image-preview",
	NEW_CHANNEL_ASYNC: "true",
	NEW_CHANNEL_EDIT_ASYNC: "false",
	NEW_CHANNEL_TIMEOUT: "600",
};

const BUNDLED_IMAGE_PLUGIN_IDS = new Set([
	"tongflow-api-img2-relay",
	"tongflow-api-banana-relay",
	"tongflow-api-new-channel",
]);

const RETIRED_BUNDLED_PLUGIN_IDS = [
	"tongflow-api-gada-img2",
	"tongflow-api-gada-banana",
	"tongflow-api-openai",
];

function ensurePublicImagePresets(): void {
	const settings = path.join(dataDir(), "settings.json");
	let current: Record<string, unknown> = {};

	if (fs.existsSync(settings)) {
		try {
			const parsed: unknown = JSON.parse(fs.readFileSync(settings, "utf8"));
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				return;
			current = parsed as Record<string, unknown>;
		} catch {
			// Preserve an unreadable existing file rather than risk losing keys.
			return;
		}
	}

	let changed = !fs.existsSync(settings);
	for (const [key, value] of Object.entries(PUBLIC_IMAGE_PRESETS)) {
		if (!Object.hasOwn(current, key)) {
			current[key] = value;
			changed = true;
		}
	}

	if (changed) {
		fs.writeFileSync(settings, JSON.stringify(current, null, 2), "utf8");
	}
}

/**
 * Create writable user directories, materialize bundled providers, and seed
 * only public endpoint/model defaults on a clean install. API keys are never
 * present here and existing user settings are never overwritten.
 */
export function ensureUserDirs(): void {
	fs.mkdirSync(dataDir(), { recursive: true });
	fs.mkdirSync(pluginsDir(), { recursive: true });
	ensurePublicImagePresets();

	for (const pluginId of RETIRED_BUNDLED_PLUGIN_IDS) {
		fs.rmSync(path.join(pluginsDir(), pluginId), {
			recursive: true,
			force: true,
		});
	}

	const bundled = bundledPluginsDir();
	if (!fs.existsSync(bundled)) return;
	for (const name of fs.readdirSync(bundled)) {
		if (!BUNDLED_IMAGE_PLUGIN_IDS.has(name)) continue;
		const source = `${bundled}/${name}`;
		const destination = `${pluginsDir()}/${name}`;
		if (!fs.statSync(source).isDirectory()) continue;
		// Refresh bundled provider code on every app update. API values live
		// separately in data/settings.json and are never copied here.
		fs.cpSync(source, destination, { recursive: true, force: true });
	}
}
