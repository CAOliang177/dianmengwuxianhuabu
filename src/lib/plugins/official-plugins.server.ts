import "server-only";

import fs, { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { logger } from "@/lib/logger";
import { pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";

/**
 * The canonical official-plugin manifest lives in config/official-plugins.json
 * and is shared with scripts/install-official-plugins.mjs — a single source of
 * truth for both the CLI installer and the in-app plugin manager.
 */
export interface OfficialPluginManifest {
	org: string;
	plugins: string[];
}

export interface OfficialPluginInfo {
	id: string;
	installed: boolean;
}

function manifestPath(): string {
	return join(resourcesDir(), "config", "official-plugins.json");
}

export function loadOfficialPluginManifest(): OfficialPluginManifest {
	const raw = readFileSync(manifestPath(), "utf8");
	return JSON.parse(raw) as OfficialPluginManifest;
}

/** Git remote URL for an official plugin id under the configured org. */
export function officialGitUrl(org: string, id: string): string {
	return `${org}/${id}.git`;
}

function isGitCheckout(id: string): boolean {
	return existsSync(join(pluginsDir(), id, ".git"));
}

function isRunnableLocalPlugin(id: string): boolean {
	const root = join(pluginsDir(), id);
	return (
		existsSync(join(root, "entry.py")) &&
		existsSync(join(root, "tongflow.plugin.json"))
	);
}

/**
 * Git-managed plugins retain their checkout marker. Desktop-bundled providers
 * intentionally ship without `.git`; a runnable entry plus manifest marks
 * those as installed and prevents a clean computer from trying to clone them.
 */
export function isPluginInstalled(id: string): boolean {
	return isGitCheckout(id) || isRunnableLocalPlugin(id);
}

export function listOfficialPlugins(): {
	org: string;
	plugins: OfficialPluginInfo[];
} {
	const manifest = loadOfficialPluginManifest();
	return {
		org: manifest.org,
		plugins: manifest.plugins.map((id) => ({
			id,
			installed: isPluginInstalled(id),
		})),
	};
}

/**
 * Installed plugins under the plugins dir that are not in the official
 * manifest — i.e. community plugins cloned from a custom git URL.
 */
export function listInstalledCommunityPlugins(): string[] {
	const official = new Set(loadOfficialPluginManifest().plugins);
	let entries: string[];
	try {
		entries = fs.readdirSync(pluginsDir());
	} catch {
		// Plugins dir not created yet — nothing installed.
		return [];
	}
	return entries
		.filter((id) => !official.has(id) && isPluginInstalled(id))
		.sort();
}

/** Update status for one installed plugin, from comparing local vs remote HEAD. */
export interface PluginUpdateInfo {
	id: string;
	localCommit: string | null;
	remoteCommit: string | null;
	/** True only when both commits are known and differ. */
	hasUpdate: boolean;
}

/** Local HEAD commit of an installed plugin (read from its .git, no network). */
async function localHeadCommit(id: string): Promise<string | null> {
	try {
		return await git.resolveRef({
			fs,
			dir: join(pluginsDir(), id),
			ref: "HEAD",
		});
	} catch {
		return null;
	}
}

/** Remote default-branch HEAD commit (a single ls-remote, no clone). */
async function remoteHeadCommit(
	org: string,
	id: string,
): Promise<string | null> {
	try {
		const refs = await git.listServerRefs({
			http,
			url: officialGitUrl(org, id),
			prefix: "HEAD",
			symrefs: true,
		});
		return refs.find((r) => r.ref === "HEAD")?.oid ?? null;
	} catch (e) {
		// Network/auth failure: treat as "unknown" rather than surfacing an error
		// — the user can still pull manually.
		logger.warn(`[plugins] update check failed for ${id}: ${String(e)}`);
		return null;
	}
}

/** Compare local vs remote HEAD for one plugin. Not-installed -> no update. */
export async function checkPluginUpdate(
	org: string,
	id: string,
): Promise<PluginUpdateInfo> {
	// Bundled/local providers have no Git remote and are updated with the app.
	// Do not contact GitHub or surface Git-related errors for them.
	if (!isGitCheckout(id)) {
		return { id, localCommit: null, remoteCommit: null, hasUpdate: false };
	}
	const [localCommit, remoteCommit] = await Promise.all([
		localHeadCommit(id),
		remoteHeadCommit(org, id),
	]);
	return {
		id,
		localCommit,
		remoteCommit,
		hasUpdate: Boolean(
			localCommit && remoteCommit && localCommit !== remoteCommit,
		),
	};
}

/** Check every installed official plugin in parallel (one ls-remote each). */
export async function checkOfficialPluginUpdates(): Promise<
	PluginUpdateInfo[]
> {
	const manifest = loadOfficialPluginManifest();
	const installed = manifest.plugins.filter((id) => isPluginInstalled(id));
	return Promise.all(
		installed.map((id) => checkPluginUpdate(manifest.org, id)),
	);
}
