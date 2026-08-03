import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, type BrowserWindow, dialog, ipcMain } from "electron";
import { logLine } from "./logging";
import { userDataDir } from "./paths";

interface ZipEntry {
    name: string;
    data: Buffer;
    modifiedAt: Date;
}

interface DiagnosticExportResult {
    saved: boolean;
    path: string | null;
    included: number;
    skipped: string[];
}

interface DiagnosticExportRequest {
    rendererCanvasStorage?: Record<string, string>;
}

const MAX_DIAGNOSTIC_FILE_BYTES = 64 * 1024 * 1024;

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date: Date): { time: number; date: number } {
    const year = Math.max(1980, date.getFullYear());
    return {
        time:
            (date.getHours() << 11) |
            (date.getMinutes() << 5) |
            Math.floor(date.getSeconds() / 2),
        date:
            ((year - 1980) << 9) |
            ((date.getMonth() + 1) << 5) |
            date.getDate(),
    };
}

/** Small dependency-free ZIP writer. Diagnostic files are stored uncompressed. */
export function createDiagnosticZip(entries: ZipEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
        const checksum = crc32(entry.data);
        const stamp = dosTimestamp(entry.modifiedAt);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(stamp.time, 10);
        local.writeUInt16LE(stamp.date, 12);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(entry.data.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, name, entry.data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(stamp.time, 12);
        central.writeUInt16LE(stamp.date, 14);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(entry.data.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, name);
        offset += local.length + name.length + entry.data.length;
    }

    const centralSize = centralParts.reduce(
        (sum, part) => sum + part.length,
        0,
    );
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, ...centralParts, end]);
}

function diagnosticCandidates(root: string): string[] {
    const files: string[] = [];
    for (const relative of [
        path.join("logs", "tongflow.log"),
        path.join("logs", "tongflow.log.old"),
        path.join("data", "canvas-history.json"),
        path.join("data", "canvas-history.json.bak"),
        path.join("data", "canvas-history.json.bak.1"),
        path.join("data", "canvas-history.json.bak.2"),
        path.join("data", "canvas-history.json.bak.3"),
        path.join("data", "canvas-history.json.bak.4"),
        path.join("data", "canvas-history.json.tmp"),
        path.join("data", "tongflow.db"),
        path.join("data", "tongflow.db-wal"),
        path.join("data", "tongflow.db-shm"),
    ]) {
        if (fs.existsSync(path.join(root, relative))) files.push(relative);
    }
    return files;
}

function safeRendererSnapshot(request?: DiagnosticExportRequest) {
    const source = request?.rendererCanvasStorage;
    if (!source || typeof source !== "object") return {};
    return Object.fromEntries(
        Object.entries(source).filter(
            ([key, value]) =>
                typeof value === "string" &&
                (key.startsWith("dianmeng.canvas.") ||
                    key === "nodes" ||
                    key === "edges" ||
                    key === "workflowMeta"),
        ),
    );
}

function safeTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exportDiagnostics(
    getWindow: () => BrowserWindow | null,
    request?: DiagnosticExportRequest,
): Promise<DiagnosticExportResult> {
    const owner = getWindow();
    const suggested = path.join(
        app.getPath("downloads"),
        `dianmeng-diagnostic-${safeTimestamp()}.zip`,
    );
    const options = { title: "导出 dianmeng 诊断包", defaultPath: suggested };
    const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
        return { saved: false, path: null, included: 0, skipped: [] };
    }

    const root = userDataDir();
    const entries: ZipEntry[] = [];
    const skipped: string[] = [];
    for (const relative of diagnosticCandidates(root)) {
        const absolute = path.resolve(root, relative);
        const safeRoot = `${path.resolve(root)}${path.sep}`;
        if (!absolute.startsWith(safeRoot)) continue;
        try {
            const stat = await fs.promises.stat(absolute);
            if (stat.size > MAX_DIAGNOSTIC_FILE_BYTES) {
                skipped.push(`${relative}：文件超过 64 MB`);
                continue;
            }
            entries.push({
                name: relative,
                data: await fs.promises.readFile(absolute),
                modifiedAt: stat.mtime,
            });
        } catch (error) {
            const detail =
                error && typeof error === "object" && "code" in error
                    ? String(error.code)
                    : error instanceof Error
                      ? error.name
                      : "unknown error";
            skipped.push(`${relative}：${detail}`);
        }
    }

    const rendererCanvasStorage = safeRendererSnapshot(request);
    entries.push({
        name: "renderer-canvas-storage.json",
        data: Buffer.from(
            JSON.stringify(rendererCanvasStorage, null, 2),
            "utf8",
        ),
        modifiedAt: new Date(),
    });

    const info = {
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        includedFiles: entries.map((entry) => entry.name),
        skippedFiles: skipped,
        privacy:
            "API keys, settings.json, plugins, virtual environments and uploaded/generated images are intentionally excluded.",
    };
    entries.push({
        name: "diagnostic-info.json",
        data: Buffer.from(JSON.stringify(info, null, 2), "utf8"),
        modifiedAt: new Date(),
    });

    const destination = result.filePath.toLowerCase().endsWith(".zip")
        ? result.filePath
        : `${result.filePath}.zip`;
    await fs.promises.writeFile(destination, createDiagnosticZip(entries));
    logLine(
        `[diagnostics] exported ${entries.length} files to ${destination} (${skipped.length} skipped)`,
    );
    return {
        saved: true,
        path: destination,
        included: entries.length,
        skipped,
    };
}

export function registerDiagnosticsIpc(
    getWindow: () => BrowserWindow | null,
): void {
    ipcMain.handle("tongflow:diagnostics-export", (_event, request) =>
        exportDiagnostics(getWindow, request as DiagnosticExportRequest),
    );
}
