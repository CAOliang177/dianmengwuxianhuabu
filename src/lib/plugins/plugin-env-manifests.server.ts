import "server-only";

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import {
	type PluginEnvDecl,
	PluginEnvManifestSchema,
} from "@/lib/plugins/plugin-env-manifest-schema";
import { pluginsDir } from "@/lib/runtime/paths.server";

export const PLUGIN_ENV_MANIFEST_FILE = "tongflow.plugin.json";

/**
 * Reads `tongflow.plugin.json` from every runnable local plugin. Desktop builds
 * copy bundled providers without Git metadata, so `entry.py` + a manifest is
 * the portable installation marker; requiring `.git` hides their presets on a
 * clean computer.
 * Reads fresh on every call — files are tiny, the settings dialog is
 * low-frequency, and newly installed plugins are picked up automatically.
 * A missing or invalid manifest never fails the call; it just yields no entry.
 */
export function loadPluginEnvDecls(): PluginEnvDecl[] {
	const root = pluginsDir();
	let entries: Dirent[];
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return [];
	}

	const decls: PluginEnvDecl[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const pluginId = entry.name;
		const pluginRoot = join(root, pluginId);
		const manifestPath = join(pluginRoot, PLUGIN_ENV_MANIFEST_FILE);
		if (
			!existsSync(join(pluginRoot, "entry.py")) ||
			!existsSync(manifestPath)
		) {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
		} catch (error) {
			logger.warn(
				`[plugins] unreadable ${PLUGIN_ENV_MANIFEST_FILE} in ${pluginId}:`,
				error,
			);
			continue;
		}
		const result = PluginEnvManifestSchema.safeParse(parsed);
		if (!result.success) {
			logger.warn(
				`[plugins] invalid ${PLUGIN_ENV_MANIFEST_FILE} in ${pluginId}: ${result.error.message}`,
			);
			continue;
		}

		// Dedupe keys within one plugin; first declaration wins.
		const seen = new Set<string>();
		const env = result.data.env.filter((v) => {
			if (seen.has(v.key)) return false;
			seen.add(v.key);
			return true;
		});
		if (env.length > 0) decls.push({ pluginId, env });
	}

	decls.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
	return decls;
}
