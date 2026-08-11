import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundledPluginsDir = path.resolve(
    here,
    "..",
    "resources",
    "bundled-plugins",
);
const allowedPluginIds = new Set([
    "tongflow-api-img2-relay",
    "tongflow-api-banana-relay",
    "tongflow-api-new-channel",
    "tongflow-api-bytedance",
    "tongflow-api-prompt-llm",
]);

if (fs.existsSync(bundledPluginsDir)) {
    for (const name of fs.readdirSync(bundledPluginsDir)) {
        if (allowedPluginIds.has(name)) continue;
        fs.rmSync(path.join(bundledPluginsDir, name), {
            recursive: true,
            force: true,
        });
    }

    const removeDevelopmentArtifacts = (directory) => {
        for (const entry of fs.readdirSync(directory, {
            withFileTypes: true,
        })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "__pycache__") {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    removeDevelopmentArtifacts(fullPath);
                }
            } else if (/^test_.*\.py$/i.test(entry.name)) {
                fs.rmSync(fullPath, { force: true });
            }
        }
    };
    removeDevelopmentArtifacts(bundledPluginsDir);
}

console.log(
    "[assemble] retained bundled providers:",
    [...allowedPluginIds].join(", "),
);
