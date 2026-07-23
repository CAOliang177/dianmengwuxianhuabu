import net from "node:net";

const PREFERRED_PORT = 55141;

/**
 * Prefer one stable loopback port so browser storage keeps the same origin
 * across desktop restarts. Fall back to an OS-assigned port only when another
 * process already owns the preferred port.
 */
export function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.once("error", () => {
            const fallback = net.createServer();
            fallback.unref();
            fallback.once("error", reject);
            fallback.listen(0, "127.0.0.1", () => {
                const addr = fallback.address();
                const port = typeof addr === "object" && addr ? addr.port : 0;
                fallback.close(() => resolve(port));
            });
        });
        srv.listen(PREFERRED_PORT, "127.0.0.1", () => {
            const addr = srv.address();
            const port = typeof addr === "object" && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
    });
}
