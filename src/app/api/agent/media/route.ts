import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_REDIRECTS = 5;

function isPrivateAddress(address: string): boolean {
    const normalized = address.toLowerCase().replace(/^::ffff:/, "");
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    const parts = normalized.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)))
        return false;
    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
    );
}

async function assertPublicUrl(value: string): Promise<URL> {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("仅支持 HTTP/HTTPS 素材地址");
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        throw new Error("不允许读取本机或内网地址");
    }
    if (isIP(hostname) && isPrivateAddress(hostname)) {
        throw new Error("不允许读取本机或内网地址");
    }
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (
        !addresses.length ||
        addresses.some(({ address }) => isPrivateAddress(address))
    ) {
        throw new Error("素材地址解析到了不可访问的内网地址");
    }
    return url;
}

async function fetchRemoteMedia(initialUrl: string): Promise<Response> {
    let current = await assertPublicUrl(initialUrl);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const response = await fetch(current, {
            cache: "no-store",
            redirect: "manual",
            signal: AbortSignal.timeout(40_000),
            headers: {
                Accept: "image/*,video/*;q=0.9,application/octet-stream;q=0.7",
                "User-Agent": "dianmeng-infinite-canvas/agent-media",
            },
        });
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get("location");
        if (!location) return response;
        current = await assertPublicUrl(new URL(location, current).toString());
    }
    throw new Error("远程素材重定向次数过多");
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as { url?: unknown };
        const value = typeof body.url === "string" ? body.url.trim() : "";
        if (!value) {
            return NextResponse.json(
                { error: "缺少远程素材地址" },
                { status: 400 },
            );
        }
        const upstream = await fetchRemoteMedia(value);
        if (!upstream.ok || !upstream.body) {
            return NextResponse.json(
                { error: `远程素材返回 HTTP ${upstream.status}` },
                { status: 502 },
            );
        }
        const contentType =
            upstream.headers.get("content-type") || "application/octet-stream";
        if (
            !contentType.startsWith("image/") &&
            !contentType.startsWith("video/") &&
            contentType !== "application/octet-stream"
        ) {
            return NextResponse.json(
                { error: `远程地址返回了不支持的内容类型：${contentType}` },
                { status: 415 },
            );
        }
        const headers = new Headers({
            "Content-Type": contentType,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        });
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) headers.set("Content-Length", contentLength);
        return new Response(upstream.body, { status: 200, headers });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : "读取远程素材失败",
            },
            { status: 502 },
        );
    }
}
