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
]);

if (fs.existsSync(bundledPluginsDir)) {
    for (const name of fs.readdirSync(bundledPluginsDir)) {
        if (allowedPluginIds.has(name)) continue;
        fs.rmSync(path.join(bundledPluginsDir, name), {
            recursive: true,
            force: true,
        });
    }
}

console.log(
    "[assemble] retained bundled image providers:",
    [...allowedPluginIds].join(", "),
);
