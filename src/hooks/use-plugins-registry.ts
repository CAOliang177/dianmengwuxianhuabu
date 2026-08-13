"use client";

import { useEffect } from "react";
import { create } from "zustand";

export type PluginsRegistryPayload = {
    version: 1;
    generatedAt: string;
    scannerVersion?: number;
    nodePluginMap: Record<string, string[]>;
    plugins: Record<
        string,
        {
            methodsByNodeSlot?: Record<
                string,
                { methodName: string; models?: string[] }
            >;
        }
    >;
    errors?: Array<{ pluginId: string; message: string }>;
};

type PluginsRegistryState = {
    registry: PluginsRegistryPayload | null;
    isLoaded: boolean;
    isLoading: boolean;
    error: Error | null;
};

let fetchPromise: Promise<void> | null = null;

export const usePluginsRegistryStore = create<PluginsRegistryState>(() => ({
    registry: null,
    isLoaded: false,
    isLoading: false,
    error: null,
}));

async function loadRegistry(): Promise<void> {
    const state = usePluginsRegistryStore.getState();
    if (state.isLoaded || fetchPromise)
        return fetchPromise ?? Promise.resolve();

    usePluginsRegistryStore.setState({ isLoading: true });

    fetchPromise = (async () => {
        try {
            const res = await fetch("/api/plugins/registry", {
                cache: "no-store",
                credentials: "same-origin",
            });
            const contentType = res.headers.get("content-type") || "";
            const raw = await res.text();
            if (!res.ok) {
                let detail = "";
                try {
                    detail =
                        (JSON.parse(raw) as { error?: string }).error || "";
                } catch {
                    // A missing packaged API route returns a Next.js HTML page.
                    detail = contentType.includes("text/html")
                        ? "安装包缺少插件注册接口"
                        : raw.slice(0, 180);
                }
                throw new Error(detail || `HTTP ${res.status}`);
            }
            if (!contentType.includes("json")) {
                throw new Error(
                    "插件注册接口返回了非 JSON 内容，请修复或重装客户端",
                );
            }
            const payload = JSON.parse(raw) as PluginsRegistryPayload;
            usePluginsRegistryStore.setState({
                registry: payload,
                isLoaded: true,
                isLoading: false,
                error: null,
            });
        } catch (e) {
            usePluginsRegistryStore.setState({
                isLoaded: false,
                isLoading: false,
                error: e instanceof Error ? e : new Error(String(e)),
            });
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

export function usePluginsRegistry() {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const isLoaded = usePluginsRegistryStore((s) => s.isLoaded);
    const isLoading = usePluginsRegistryStore((s) => s.isLoading);
    const error = usePluginsRegistryStore((s) => s.error);

    useEffect(() => {
        void loadRegistry();
    }, []);

    return { registry, isLoaded, isLoading, error };
}

/**
 * Force refresh registry from the server (e.g. after install/update/remove).
 */
export async function refreshPluginsRegistry(): Promise<void> {
    usePluginsRegistryStore.setState({ isLoaded: false });
    await loadRegistry();
}

function dedupeIds(list: string[]): string[] {
    const seen = new Set<string>();
    return list
        .map((s) => s.trim())
        .filter((s) => Boolean(s))
        .filter((s) => {
            if (seen.has(s)) return false;
            seen.add(s);
            return true;
        });
}

/** Plugin directory names registered for a single ABI `nodeSlot`. */
export function useNodePluginIds(nodeSlot: string): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const list = registry?.nodePluginMap?.[nodeSlot] ?? [];
    return dedupeIds(list);
}

/**
 * Model ids a plugin declares for one ABI `nodeSlot` (empty for single-model
 * plugins — the model dropdown is hidden in that case).
 */
export function useNodePluginModels(
    nodeSlot: string,
    pluginId: string,
): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const models =
        registry?.plugins?.[pluginId]?.methodsByNodeSlot?.[nodeSlot]?.models ??
        [];
    return dedupeIds(models);
}

/**
 * Union of plugin ids for several slots (e.g. `transcribe` + `transcribe_timestamp`).
 */
export function useNodePluginIdsUnion(nodeSlots: string[]): string[] {
    const registry = usePluginsRegistryStore((s) => s.registry);
    const out: string[] = [];
    for (const slot of nodeSlots) {
        for (const id of registry?.nodePluginMap?.[slot] ?? []) {
            out.push(id);
        }
    }
    return dedupeIds(out);
}
