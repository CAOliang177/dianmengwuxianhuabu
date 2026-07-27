import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

interface DownloadSettings {
    imageDirectory?: string;
}

interface SaveImageRequest {
    url: string;
    suggestedName?: string;
}

const SETTINGS_FILE = "download-settings.json";

function settingsPath(): string {
    return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function readSettings(): DownloadSettings {
    try {
        return JSON.parse(
            fs.readFileSync(settingsPath(), "utf8"),
        ) as DownloadSettings;
    } catch {
        return {};
    }
}

function writeSettings(settings: DownloadSettings): void {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function safeFileName(value: string): string {
    const cleaned = value
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/[.\s]+$/g, "")
        .trim();
    return cleaned || `dianmeng-${Date.now()}.png`;
}

function uniqueDestination(directory: string, fileName: string): string {
    const parsed = path.parse(fileName);
    let candidate = path.join(directory, fileName);
    let index = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(
            directory,
            `${parsed.name} (${index})${parsed.ext}`,
        );
        index += 1;
    }
    return candidate;
}

function extensionForContentType(contentType: string | null): string {
    if (contentType?.includes("jpeg")) return ".jpg";
    if (contentType?.includes("webp")) return ".webp";
    if (contentType?.includes("gif")) return ".gif";
    if (contentType?.includes("avif")) return ".avif";
    return ".png";
}

export function registerDownloadIpc(
    getWindow: () => BrowserWindow | null,
): void {
    ipcMain.handle("tongflow:download-directory-get", () => {
        const directory = readSettings().imageDirectory;
        return directory && fs.existsSync(directory) ? directory : null;
    });

    ipcMain.handle("tongflow:download-directory-choose", async () => {
        const owner = getWindow();
        const result = owner
            ? await dialog.showOpenDialog(owner, {
                  title: "选择图片默认保存位置",
                  properties: ["openDirectory", "createDirectory"],
              })
            : await dialog.showOpenDialog({
                  title: "选择图片默认保存位置",
                  properties: ["openDirectory", "createDirectory"],
              });
        if (result.canceled || !result.filePaths[0]) return null;
        const directory = path.resolve(result.filePaths[0]);
        writeSettings({ ...readSettings(), imageDirectory: directory });
        return directory;
    });

    ipcMain.handle(
        "tongflow:download-directory-set",
        (_event, directory: string | null) => {
            const next = { ...readSettings() };
            if (directory) next.imageDirectory = path.resolve(directory);
            else delete next.imageDirectory;
            writeSettings(next);
            return next.imageDirectory ?? null;
        },
    );

    ipcMain.handle(
        "tongflow:image-save",
        async (_event, request: SaveImageRequest) => {
            const response = await fetch(request.url);
            if (!response.ok) {
                throw new Error(`下载图片失败：HTTP ${response.status}`);
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            const configured = readSettings().imageDirectory;
            let fileName = safeFileName(
                request.suggestedName || `dianmeng-${Date.now()}.png`,
            );
            if (!path.extname(fileName)) {
                fileName += extensionForContentType(
                    response.headers.get("content-type"),
                );
            }

            let destination: string;
            if (configured) {
                fs.mkdirSync(configured, { recursive: true });
                destination = uniqueDestination(configured, fileName);
            } else {
                const owner = getWindow();
                const options = {
                    title: "保存图片",
                    defaultPath: path.join(app.getPath("downloads"), fileName),
                };
                const result = owner
                    ? await dialog.showSaveDialog(owner, options)
                    : await dialog.showSaveDialog(options);
                if (result.canceled || !result.filePath) {
                    return { saved: false, path: null };
                }
                destination = result.filePath;
            }

            await fs.promises.writeFile(destination, bytes);
            return { saved: true, path: destination };
        },
    );
}
