import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { registerDiagnosticsIpc } from "./diagnostics";
import { registerDownloadIpc } from "./downloads";
import { findFreePort } from "./free-port";
import { ensureUserDirs } from "./fs-setup";
import { initLogFile, logFilePath, logLine, recentLogs } from "./logging";
import { ensurePythonEnv } from "./python-manager";
import { startServer, stopServer } from "./server-manager";
import { initUpdater } from "./updater";
import {
    createMainWindow,
    createSplash,
    setSplashStatus,
    showErrorPage,
} from "./window";

let mainWindow: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
const canvasWindows = new Set<BrowserWindow>();

// Single-instance: focus the existing window instead of starting a 2nd server.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(boot).catch(fatal);
}

async function boot(): Promise<void> {
    initLogFile();
    splash = createSplash();

    const log = (line: string) => {
        // Surface key progress on the splash and keep a full trace on disk.
        logLine(line);
        setSplashStatus(splash, line);
    };

    try {
        ensureUserDirs();

        // First run materializes the Python venv (can take a minute online).
        await ensurePythonEnv(log);

        const port = await findFreePort();
        log("Starting dianmeng无限画布 server…");
        await startServer(port, logLine, onServerCrash);

        // Register updater IPC before the renderer loads, then let the update
        // check/download continue in the background without delaying startup.
        void initUpdater(() => mainWindow, logLine).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logLine(`[updater] initialization failed: ${message}`);
        });
        registerDownloadIpc(() => mainWindow);
        registerDiagnosticsIpc(() => mainWindow);
        ipcMain.handle("tongflow:canvas-window-open", (event, canvasId) => {
            const id = String(canvasId || "").trim();
            if (!id) return false;
            const sourceWindow = BrowserWindow.fromWebContents(event.sender);
            const baseUrl =
                sourceWindow && !sourceWindow.isDestroyed()
                    ? event.sender.getURL()
                    : mainWindow?.webContents.getURL();
            if (!baseUrl?.startsWith("http://127.0.0.1:")) return false;
            const workspaceUrl = new URL("/workspace", baseUrl);
            workspaceUrl.searchParams.set("canvas", id);
            const canvasWindow = createMainWindow(workspaceUrl.toString());
            canvasWindows.add(canvasWindow);
            canvasWindow.on("closed", () => {
                canvasWindows.delete(canvasWindow);
            });
            return true;
        });

        mainWindow = createMainWindow(`http://127.0.0.1:${port}`);
        mainWindow.on("closed", () => {
            mainWindow = null;
        });
        mainWindow.once("ready-to-show", () => {
            if (splash && !splash.isDestroyed()) splash.close();
            splash = null;
        });
    } catch (err) {
        fatal(err);
    }
}

/** Server died after a successful start: show the failure instead of a dead UI. */
function onServerCrash(code: number | null): void {
    const message = `dianmeng无限画布 server exited unexpectedly (code ${code})`;
    logLine(`[tongflow] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        showErrorPage(mainWindow, "dianmeng无限画布 server stopped", message);
    } else {
        fatal(new Error(message));
    }
}

function fatal(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    logLine(`[tongflow] fatal: ${message}`);
    if (splash && !splash.isDestroyed()) splash.close();
    // Include the log tail + log path so a distributed build produces an
    // actionable report, not just a one-line message.
    dialog.showErrorBox(
        "dianmeng无限画布 failed to start",
        `${message}\n\nFull log: ${logFilePath()}\n\nRecent log output:\n${
            recentLogs(30) || "(no log output captured)"
        }`,
    );
    app.quit();
}

// The app is a thin shell over a single local server; closing the window means
// quitting (and tearing down the server) on every platform, macOS included.
app.on("window-all-closed", () => {
    stopServer();
    app.quit();
});

app.on("before-quit", stopServer);
