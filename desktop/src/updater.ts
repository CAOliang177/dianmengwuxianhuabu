import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app, type BrowserWindow, dialog, ipcMain, net, shell } from "electron";

/**
 * App-update state machine. Both platforms fully auto-update:
 *  - Windows: electron-updater — silent download from the GitHub release feed,
 *    then install-and-relaunch (unsigned NSIS builds are fine).
 *  - macOS: our builds are unsigned and Squirrel.Mac refuses to apply unsigned
 *    updates, so we do it ourselves: download the release dmg (sha512-verified
 *    against the update feed when available), mount it, swap the .app bundle
 *    in place, and relaunch. If the swap fails (e.g. the install dir isn't
 *    writable) we open the downloaded dmg for a manual drag-install.
 *
 * State is pushed to the renderer over IPC so the web UI can render an update
 * button (version info, manual check, live download progress).
 */

const execFileP = promisify(execFile);

// Owner/repo must match the `publish` block in electron-builder.yml.
const LATEST_RELEASE_API =
    "https://api.github.com/repos/CAOliang177/dianmengwuxianhuabu/releases/latest";
const RELEASE_DOWNLOAD_BASE =
    "https://github.com/CAOliang177/dianmengwuxianhuabu/releases/download";

const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type UpdateStatus =
    | "idle"
    | "checking"
    | "up-to-date"
    | "available"
    | "downloading"
    | "downloaded"
    | "error";

export interface UpdateState {
    status: UpdateStatus;
    /** Kept for the renderer contract; both platforms are "auto" today. */
    mode: "auto" | "manual";
    currentVersion: string;
    latestVersion: string | null;
    /** Download progress 0-100, only meaningful while `downloading`. */
    percent: number | null;
    error: string | null;
}

let state: UpdateState = {
    status: "idle",
    mode: "auto",
    currentVersion: app.getVersion(),
    latestVersion: null,
    percent: null,
    error: null,
};

let getWindow: () => BrowserWindow | null = () => null;
let log: (line: string) => void = () => {};
let downloadedDmgPath: string | null = null;
let notifiedAvailableVersion: string | null = null;

function setState(patch: Partial<UpdateState>): void {
    state = { ...state, ...patch };
    const win = getWindow();
    if (win && !win.isDestroyed()) {
        if (state.status === "downloading") {
            const progress = Math.max(
                0.01,
                Math.min(1, (state.percent ?? 0) / 100),
            );
            win.setProgressBar(progress, { mode: "normal" });
        } else if (state.status === "available") {
            win.setProgressBar(2, { mode: "indeterminate" });
        } else if (state.status === "downloaded") {
            win.setProgressBar(1, { mode: "normal" });
        } else {
            win.setProgressBar(-1);
        }
        win.webContents.send("tongflow:update-state", state);
    }
}

/**
 * Wire IPC + start the boot check and the periodic re-check. The download is
 * ~200 MB, so a boot-only check rarely completes on slow links — long-running
 * apps get retries every few hours. Never blocks or crashes startup.
 */
export async function initUpdater(
    getMainWindow: () => BrowserWindow | null,
    logLine: (line: string) => void,
): Promise<void> {
    getWindow = getMainWindow;
    log = logLine;

    ipcMain.handle("tongflow:update-get-state", () => state);
    ipcMain.handle("tongflow:update-check", () => {
        void check();
    });
    ipcMain.handle("tongflow:update-install", () => install());

    if (!app.isPackaged) return;

    if (process.platform === "win32") await setupWindowsAutoUpdater();
    setInterval(() => void check(), RECHECK_INTERVAL_MS);
    await check(true);
}

async function check(promptWhenReady = false): Promise<void> {
    // Already busy, or an update is sitting ready — nothing to re-check.
    if (
        state.status === "checking" ||
        state.status === "downloading" ||
        state.status === "downloaded"
    ) {
        return;
    }
    if (!app.isPackaged) {
        // Dev build: report reality instead of comparing against releases.
        setState({ status: "up-to-date", latestVersion: state.currentVersion });
        return;
    }
    setState({ status: "checking", error: null });
    try {
        if (process.platform === "win32") {
            // electron-updater events drive the rest of the state machine.
            const { autoUpdater } = await import("electron-updater");
            await autoUpdater.checkForUpdates();
        } else {
            await checkMacUpdate(promptWhenReady);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log(`[updater] check failed: ${message}`);
        setState({ status: "error", error: message });
    }
}

/** Install the downloaded update and relaunch into the new version. */
async function install(): Promise<void> {
    if (state.status !== "downloaded") return;
    if (process.platform === "win32") {
        const { autoUpdater } = await import("electron-updater");
        autoUpdater.quitAndInstall(true, true);
        return;
    }
    if (!downloadedDmgPath) return;
    try {
        await installMacUpdateAndRelaunch(downloadedDmgPath);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log(`[updater] install failed: ${message} — opening dmg instead`);
        setState({ error: message });
        // Fall back to a manual drag-install of the already-downloaded dmg.
        await shell.openPath(downloadedDmgPath);
    }
}

/** "Restart now / Later" prompt once an update is downloaded and ready. */
async function promptRestart(version: string): Promise<void> {
    const options = {
        type: "info" as const,
        title: "Update ready",
        message: `TongFlow ${version} has been downloaded`,
        detail: "Restart now to install it. You can also do this later from the update button in the top-right corner.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
    };
    const win = getWindow();
    const { response } = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options);
    if (response === 0) await install();
}

// --- Windows: electron-updater ----------------------------------------------

/** Tell the user immediately that a download has started. */
async function promptUpdateAvailable(version: string): Promise<void> {
    if (notifiedAvailableVersion === version) return;
    notifiedAvailableVersion = version;
    const options = {
        type: "info" as const,
        title: "发现新版本",
        message: `dianmeng无限画布 v${version} 可更新`,
        detail:
            "新版本正在后台下载。下载完成后会再次提示重启安装，请在下载完成前保持应用打开。",
        buttons: ["知道了"],
        defaultId: 0,
    };
    const win = getWindow();
    if (win && !win.isDestroyed()) {
        await dialog.showMessageBox(win, options);
    } else {
        await dialog.showMessageBox(options);
    }
}

async function setupWindowsAutoUpdater(): Promise<void> {
    const { autoUpdater } = await import("electron-updater");

    // Locally distributed installers and GitHub Actions artifacts are built on
    // different machines, so their binary block maps are not interchangeable.
    // A differential attempt can reach the end and fail checksum validation;
    // use the stable full installer download instead.
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Every updater step goes to the log file — update failures on user
    // machines must be diagnosable from a bug report.
    autoUpdater.logger = {
        info: (m: unknown) => log(`[updater] ${String(m)}`),
        warn: (m: unknown) => log(`[updater] warn: ${String(m)}`),
        error: (m: unknown) => log(`[updater] error: ${String(m)}`),
        debug: (m: unknown) => log(`[updater] ${String(m)}`),
    };

    autoUpdater.on("update-available", (info) => {
        setState({ status: "available", latestVersion: info.version });
        log(
            `[updater] update available: ${state.currentVersion} -> ${info.version}; full download starting`,
        );
        void promptUpdateAvailable(info.version);
    });
    autoUpdater.on("update-not-available", (info) => {
        setState({ status: "up-to-date", latestVersion: info.version });
    });
    autoUpdater.on("error", (err) => {
        setState({ status: "error", error: err.message });
    });

    let lastLoggedPercent = -25;
    autoUpdater.on("download-progress", (p) => {
        setState({ status: "downloading", percent: p.percent });
        if (p.percent - lastLoggedPercent >= 25) {
            lastLoggedPercent = p.percent;
            log(`[updater] downloading: ${Math.round(p.percent)}%`);
        }
    });

    autoUpdater.on("update-downloaded", (info) => {
        lastLoggedPercent = -25;
        setState({
            status: "downloaded",
            latestVersion: info.version,
            percent: 100,
        });
        // "Later" still updates: autoInstallOnAppQuit installs on quit.
        void promptRestart(info.version);
    });
}

// --- macOS: download + swap-install (unsigned builds) ------------------------

interface GitHubRelease {
    tag_name?: string;
    html_url?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
}

function macArch(): "arm64" | "x64" {
    return process.arch === "arm64" ? "arm64" : "x64";
}

function updatesDir(): string {
    return path.join(app.getPath("userData"), "updates");
}

async function checkMacUpdate(promptWhenReady: boolean): Promise<void> {
    const res = await net.fetch(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`release lookup failed: HTTP ${res.status}`);
    const release = (await res.json()) as GitHubRelease;
    const latest = (release.tag_name ?? "").replace(/^v/, "");
    const current = state.currentVersion;
    if (!isNewerVersion(latest, current)) {
        log(`[updater] up to date (current ${current}, latest ${latest})`);
        fs.rmSync(updatesDir(), { recursive: true, force: true });
        setState({ status: "up-to-date", latestVersion: latest || null });
        return;
    }

    log(`[updater] update available: ${current} -> ${latest}`);
    const assetName = `TongFlow-mac-${macArch()}.dmg`;
    const asset = release.assets?.find((a) => a.name === assetName);
    if (!asset?.browser_download_url) {
        throw new Error(`release v${latest} has no ${assetName}`);
    }
    setState({ status: "available", latestVersion: latest });

    downloadedDmgPath = await downloadMacUpdate(
        latest,
        asset.browser_download_url,
    );
    setState({ status: "downloaded", percent: 100 });
    log(`[updater] update ${latest} downloaded: ${downloadedDmgPath}`);
    if (promptWhenReady) await promptRestart(latest);
}

/**
 * Download the dmg with live progress, verifying sha512 against the update
 * feed when the feed has an entry for this artifact. The final filename is
 * only created by a completed download (rename from .partial), so an existing
 * file is a completed download from an earlier session.
 */
async function downloadMacUpdate(
    version: string,
    url: string,
): Promise<string> {
    const dir = updatesDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `TongFlow-${version}-${macArch()}.dmg`);
    if (fs.existsSync(file)) return file;
    for (const stale of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, stale), { force: true });
    }

    const expectedSha512 = await fetchExpectedSha512(version);
    if (!expectedSha512) {
        log("[updater] no checksum in the update feed; skipping verification");
    }

    setState({ status: "downloading", percent: 0 });
    const res = await net.fetch(url);
    if (!res.ok || !res.body) {
        throw new Error(`download failed: HTTP ${res.status}`);
    }
    const total = Number(res.headers.get("content-length") ?? 0);
    const partial = `${file}.partial`;
    const out = fs.createWriteStream(partial);
    const hash = createHash("sha512");
    const reader = res.body.getReader();
    let received = 0;
    let lastSentPercent = -1;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            hash.update(chunk);
            received += chunk.byteLength;
            if (!out.write(chunk)) {
                await new Promise<void>((resolve) =>
                    out.once("drain", () => resolve()),
                );
            }
            if (total > 0) {
                const percent = Math.min((received / total) * 100, 100);
                if (percent - lastSentPercent >= 1) {
                    lastSentPercent = percent;
                    setState({ status: "downloading", percent });
                }
            }
        }
        await new Promise<void>((resolve, reject) => {
            out.on("error", reject);
            out.end(() => resolve());
        });
    } catch (e) {
        out.destroy();
        fs.rmSync(partial, { force: true });
        throw e;
    }
    if (expectedSha512 && hash.digest("base64") !== expectedSha512) {
        fs.rmSync(partial, { force: true });
        throw new Error("update download failed sha512 verification");
    }
    fs.renameSync(partial, file);
    return file;
}

/** sha512 for this arch's dmg from electron-builder's latest-mac.yml, if listed. */
async function fetchExpectedSha512(version: string): Promise<string | null> {
    try {
        const res = await net.fetch(
            `${RELEASE_DOWNLOAD_BASE}/v${version}/latest-mac.yml`,
        );
        if (!res.ok) return null;
        const feed = await res.text();
        // Minimal parse of the feed's `files:` entries: a `url:` line followed
        // by its `sha512:` line.
        const entry = new RegExp(
            `url:\\s*TongFlow-mac-${macArch()}\\.dmg\\s+sha512:\\s*(\\S+)`,
        ).exec(feed);
        return entry ? entry[1] : null;
    } catch {
        return null;
    }
}

/**
 * Swap the running .app bundle with the one inside the downloaded dmg, then
 * relaunch. The dmg was downloaded by us (no quarantine attribute), so the
 * replaced bundle launches without Gatekeeper prompts.
 */
async function installMacUpdateAndRelaunch(dmgPath: string): Promise<void> {
    // …/TongFlow.app/Contents/MacOS/TongFlow → …/TongFlow.app
    const bundle = path.resolve(app.getPath("exe"), "..", "..", "..");
    if (!bundle.endsWith(".app")) {
        throw new Error(`not an app bundle: ${bundle}`);
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tongflow-update-"));
    const mountPoint = path.join(workDir, "mnt");
    const staged = path.join(workDir, "staged.app");
    await execFileP("hdiutil", [
        "attach",
        dmgPath,
        "-nobrowse",
        "-readonly",
        "-mountpoint",
        mountPoint,
    ]);
    try {
        const appName = fs
            .readdirSync(mountPoint)
            .find((name) => name.endsWith(".app"));
        if (!appName) throw new Error("no .app inside the update dmg");
        await execFileP("ditto", [path.join(mountPoint, appName), staged]);
    } finally {
        await execFileP("hdiutil", ["detach", mountPoint, "-force"]).catch(
            () => {},
        );
    }
    // Defense in depth: make sure nothing tagged the staged copy.
    await execFileP("xattr", ["-cr", staged]).catch(() => {});

    log(`[updater] swapping ${bundle}`);
    const previous = path.join(workDir, "previous.app");
    await execFileP("mv", [bundle, previous]);
    try {
        // ditto, not mv: temp and the install dir may be different volumes.
        await execFileP("ditto", [staged, bundle]);
    } catch (e) {
        await execFileP("rm", ["-rf", bundle]).catch(() => {});
        await execFileP("mv", [previous, bundle]);
        throw e;
    }
    log("[updater] update installed, relaunching");
    app.relaunch();
    app.quit();
}

/** True when `candidate` is a well-formed x.y.z strictly newer than `current`. */
function isNewerVersion(candidate: string, current: string): boolean {
    const next = candidate.split(".").map(Number);
    const cur = current.split(".").map(Number);
    if (next.length !== 3 || next.some(Number.isNaN)) return false;
    for (let i = 0; i < 3; i++) {
        const diff = (next[i] ?? 0) - (cur[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}
