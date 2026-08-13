import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { TosClient } from "@volcengine/tos-sdk";
import { type NextRequest, NextResponse } from "next/server";
import { loadEnvStore } from "@/lib/settings/env-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MaterialView = "groups" | "assets";

type ArkResponse = {
    Result?: unknown;
    data?: unknown;
    ResponseMetadata?: {
        Error?: { Code?: string; Message?: string };
    };
    error?: { code?: string; message?: string } | string;
    [key: string]: unknown;
};

const DEFAULT_REGION = "cn-beijing";
const DEFAULT_ASSET_HOST = "open.volcengineapi.com";
const API_VERSION = "2024-01-01";

function normalizeRegion(value?: string): string {
    const raw = (value || "").trim();
    if (!raw) return DEFAULT_REGION;
    const normalized = raw.toLowerCase().replaceAll("_", "-");
    if (
        normalized === "beijing" ||
        normalized === "cn-beijing" ||
        raw.includes("北京")
    ) {
        return "cn-beijing";
    }
    if (/^[a-z0-9-]+$/.test(normalized)) return normalized;
    throw new Error(
        `火山区域“${raw}”无法用于 API 签名，请填写区域代码（例如 cn-beijing）。`,
    );
}

function sha256(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
    return createHmac("sha256", key).update(value, "utf8").digest();
}

function compactTimestamp(now: Date): { xDate: string; date: string } {
    const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    return { xDate: iso, date: iso.slice(0, 8) };
}

/**
 * Sign an official Volcengine OpenAPI request with the account AK/SK.
 * Ark's private-material management API is an OpenAPI, not the inference
 * Bearer-key API used by /api/v3/contents/generations/tasks.
 */
async function callOfficialOpenApi(
    action: string,
    body: Record<string, unknown>,
    env: Record<string, string>,
): Promise<ArkResponse> {
    const accessKey = env.VOLCENGINE_ACCESS_KEY_ID?.trim();
    const secretKey = env.VOLCENGINE_SECRET_ACCESS_KEY?.trim();
    if (!accessKey || !secretKey) {
        throw new Error(
            "浏览火山私域素材库需要在设置中填写 VOLCENGINE_ACCESS_KEY_ID 和 VOLCENGINE_SECRET_ACCESS_KEY；仅用于模型推理的 ARK_API_KEY 无法查询素材列表。",
        );
    }

    const host = env.VOLCENGINE_ASSET_HOST?.trim() || DEFAULT_ASSET_HOST;
    const region = normalizeRegion(env.VOLCENGINE_REGION);
    const payload = JSON.stringify(body);
    const payloadHash = sha256(payload);
    const { xDate, date } = compactTimestamp(new Date());
    const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(API_VERSION)}`;
    const canonicalHeaders = [
        "content-type:application/json",
        `host:${host}`,
        `x-content-sha256:${payloadHash}`,
        `x-date:${xDate}`,
        "",
    ].join("\n");
    const signedHeaders = "content-type;host;x-content-sha256;x-date";
    const canonicalRequest = [
        "POST",
        "/",
        query,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");
    const scope = `${date}/${region}/ark/request`;
    const stringToSign = [
        "HMAC-SHA256",
        xDate,
        scope,
        sha256(canonicalRequest),
    ].join("\n");
    const dateKey = hmac(secretKey, date);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, "ark");
    const signingKey = hmac(serviceKey, "request");
    const signature = createHmac("sha256", signingKey)
        .update(stringToSign, "utf8")
        .digest("hex");
    const authorization =
        `HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}/?${query}`, {
        method: "POST",
        cache: "no-store",
        headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
            Host: host,
            "X-Content-Sha256": payloadHash,
            "X-Date": xDate,
        },
        body: payload,
        signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let parsed: ArkResponse;
    try {
        parsed = JSON.parse(text) as ArkResponse;
    } catch {
        throw new Error(
            `火山素材库 HTTP ${response.status} 返回了非 JSON 内容：${text.slice(0, 300)}`,
        );
    }
    const metadataError = parsed.ResponseMetadata?.Error;
    const responseError =
        typeof parsed.error === "string"
            ? parsed.error
            : parsed.error?.message || parsed.error?.code;
    if (metadataError?.Code || metadataError?.Message || responseError) {
        throw new Error(
            metadataError?.Message ||
                metadataError?.Code ||
                responseError ||
                "火山素材库返回业务错误",
        );
    }
    if (!response.ok) {
        throw new Error(
            metadataError?.Message ||
                metadataError?.Code ||
                `火山素材库 HTTP ${response.status}`,
        );
    }
    return parsed;
}

/**
 * Optional Bearer-compatible material endpoint for a user-supplied gateway.
 * This keeps official Ark generation and compatible relay deployments usable
 * from the same picker without ever exposing the key to the renderer.
 */
async function callBearerEndpoint(
    action: string,
    body: Record<string, unknown>,
    env: Record<string, string>,
): Promise<ArkResponse> {
    const configured = env.VOLCENGINE_ASSET_BASE_URL?.trim();
    const apiKey = (env.ARK_API_KEY || env.VOLCENGINE_API_KEY || "").trim();
    if (!configured || !apiKey) {
        return callOfficialOpenApi(action, body, env);
    }

    const base = configured.replace(/\/+$/, "");
    const url = base.endsWith("/open")
        ? `${base}/${action}`
        : `${base}/open/${action}`;
    const model =
        env.VOLCENGINE_ASSET_MODEL?.trim() ||
        env.VOLCENGINE_VIDEO_MODEL?.trim();
    const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(model ? { model, ...body } : body),
        signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let parsed: ArkResponse;
    try {
        parsed = JSON.parse(text) as ArkResponse;
    } catch {
        throw new Error(
            `素材库兼容接口 HTTP ${response.status} 返回了非 JSON 内容：${text.slice(0, 300)}`,
        );
    }
    const metadataError = parsed.ResponseMetadata?.Error;
    const responseError =
        typeof parsed.error === "string"
            ? parsed.error
            : parsed.error?.message || parsed.error?.code;
    if (metadataError?.Code || metadataError?.Message || responseError) {
        throw new Error(
            metadataError?.Message ||
                metadataError?.Code ||
                responseError ||
                "素材库兼容接口返回业务错误",
        );
    }
    if (!response.ok) {
        throw new Error(`素材库兼容接口 HTTP ${response.status}`);
    }
    return parsed;
}

function resultOf(response: ArkResponse): Record<string, unknown> {
    const value = response.Result ?? response.data ?? response;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function listFromResult(
    result: Record<string, unknown>,
    view: MaterialView,
): unknown[] {
    const keys =
        view === "groups"
            ? ["Items", "AssetGroups", "Groups", "GroupList"]
            : ["Items", "Assets", "AssetList"];
    for (const key of keys) {
        if (Array.isArray(result[key])) return result[key];
    }
    return [];
}

function safeErrorMessage(error: unknown, env: Record<string, string>): string {
    let message = error instanceof Error ? error.message : String(error);
    for (const key of [
        "ARK_API_KEY",
        "VOLCENGINE_API_KEY",
        "VOLCENGINE_ACCESS_KEY_ID",
        "VOLCENGINE_SECRET_ACCESS_KEY",
        "VOLCENGINE_TOS_ACCESS_KEY_ID",
        "VOLCENGINE_TOS_SECRET_ACCESS_KEY",
    ]) {
        const secret = env[key]?.trim();
        if (secret) message = message.replaceAll(secret, "***");
    }
    return message.slice(0, 1200);
}

function assetTypeForFile(file: File): "Image" | "Video" | "Audio" {
    const hint = `${file.type} ${file.name}`.toLowerCase();
    if (
        file.type.startsWith("video/") ||
        /\.(?:mp4|mov|m4v|webm|avi|mkv)$/i.test(hint)
    )
        return "Video";
    if (
        file.type.startsWith("audio/") ||
        /\.(?:mp3|wav|m4a|aac|ogg|flac)$/i.test(hint)
    )
        return "Audio";
    if (
        file.type.startsWith("image/") ||
        /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(hint)
    )
        return "Image";
    throw new Error("只支持上传图片、视频或音频素材。");
}

function stagingObjectKey(fileName: string, env: Record<string, string>) {
    const prefix = (env.VOLCENGINE_TOS_PREFIX || "dianmeng-assets")
        .trim()
        .replace(/^\/+|\/+$/g, "");
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const safeName = fileName
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(-120);
    return `${prefix || "dianmeng-assets"}/${date}/${randomUUID()}-${safeName || "asset"}`;
}

async function waitForAsset(
    id: string,
    env: Record<string, string>,
): Promise<{ item: Record<string, unknown>; ready: boolean }> {
    const deadline = Date.now() + 75_000;
    let item: Record<string, unknown> = { Id: id, Status: "Processing" };
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        const response = await callBearerEndpoint(
            "GetAsset",
            {
                Id: id,
                ProjectName: env.VOLCENGINE_PROJECT_NAME?.trim() || "default",
            },
            env,
        );
        item = resultOf(response);
        const status = String(item.Status || item.status || "").toLowerCase();
        if (status === "active") return { item, ready: true };
        if (status === "failed") {
            throw new Error(
                String(
                    item.Message || item.ErrorMessage || "火山素材预处理失败",
                ),
            );
        }
    }
    return { item, ready: false };
}

export async function POST(request: NextRequest) {
    const env = loadEnvStore();
    let stagingClient: TosClient | null = null;
    let stagingBucket = "";
    let stagingKey = "";
    let assetSubmitted = false;
    try {
        const form = await request.formData();
        const file = form.get("file");
        const groupId = String(form.get("groupId") || "").trim();
        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json(
                { error: "请选择要上传的素材文件。" },
                { status: 400 },
            );
        }
        if (!groupId || groupId === "__all_assets__") {
            return NextResponse.json(
                { error: "请先进入一个具体素材组，再上传素材。" },
                { status: 400 },
            );
        }
        if (file.size > 512 * 1024 * 1024) {
            return NextResponse.json(
                { error: "单个素材不能超过 512 MB。" },
                { status: 413 },
            );
        }

        const accessKey = (
            env.VOLCENGINE_TOS_ACCESS_KEY_ID ||
            env.VOLCENGINE_ACCESS_KEY_ID ||
            ""
        ).trim();
        const secretKey = (
            env.VOLCENGINE_TOS_SECRET_ACCESS_KEY ||
            env.VOLCENGINE_SECRET_ACCESS_KEY ||
            ""
        ).trim();
        stagingBucket = env.VOLCENGINE_TOS_BUCKET?.trim() || "";
        if (!accessKey || !secretKey || !stagingBucket) {
            throw new Error(
                "端内上传需要在火山插件设置中填写 VOLCENGINE_TOS_BUCKET，并确保素材库 AK/SK 具有该 TOS 桶的 PutObject、GetObject 和 DeleteObject 权限。",
            );
        }

        const region = normalizeRegion(env.VOLCENGINE_REGION);
        const endpoint =
            env.VOLCENGINE_TOS_ENDPOINT?.trim() || `tos-${region}.volces.com`;
        stagingClient = new TosClient({
            accessKeyId: accessKey,
            accessKeySecret: secretKey,
            region,
            endpoint,
            requestTimeout: 10 * 60 * 1000,
        });
        stagingKey = stagingObjectKey(file.name, env);
        const body = Buffer.from(await file.arrayBuffer());
        if (body.length >= 20 * 1024 * 1024) {
            await stagingClient.uploadFile({
                bucket: stagingBucket,
                key: stagingKey,
                file: body,
                contentType: file.type || "application/octet-stream",
                partSize: 20 * 1024 * 1024,
                taskNum: 3,
            });
        } else {
            await stagingClient.putObject({
                bucket: stagingBucket,
                key: stagingKey,
                body,
                contentType: file.type || "application/octet-stream",
            });
        }
        const sourceUrl = stagingClient.getPreSignedUrl({
            bucket: stagingBucket,
            key: stagingKey,
            method: "GET",
            expires: 24 * 60 * 60,
        });

        const created = resultOf(
            await callBearerEndpoint(
                "CreateAsset",
                {
                    GroupId: groupId,
                    URL: sourceUrl,
                    AssetType: assetTypeForFile(file),
                    Name: file.name,
                    ProjectName:
                        env.VOLCENGINE_PROJECT_NAME?.trim() || "default",
                },
                env,
            ),
        );
        const id = String(created.Id || created.AssetId || "").trim();
        if (!id) throw new Error("火山 CreateAsset 响应中没有素材 ID。");
        assetSubmitted = true;
        const result = await waitForAsset(id, env);
        if (result.ready) {
            await stagingClient
                .deleteObject({ bucket: stagingBucket, key: stagingKey })
                .catch(() => undefined);
            stagingKey = "";
        }
        return NextResponse.json({
            item: {
                ...result.item,
                Id: id,
                GroupId: groupId,
                AssetType: assetTypeForFile(file),
                Name: file.name,
            },
            ready: result.ready,
            message: result.ready
                ? "素材已上传并完成火山预处理。"
                : "素材已提交火山预处理，请稍后刷新素材组。",
        });
    } catch (error) {
        if (!assetSubmitted && stagingClient && stagingBucket && stagingKey) {
            await stagingClient
                .deleteObject({ bucket: stagingBucket, key: stagingKey })
                .catch(() => undefined);
        }
        return NextResponse.json(
            { error: safeErrorMessage(error, env) },
            { status: 502 },
        );
    }
}

export async function GET(request: NextRequest) {
    const view = request.nextUrl.searchParams.get(
        "view",
    ) as MaterialView | null;
    if (view !== "groups" && view !== "assets") {
        return NextResponse.json(
            { error: "view must be groups or assets" },
            { status: 400 },
        );
    }

    const env = loadEnvStore();
    const groupId = request.nextUrl.searchParams.get("groupId")?.trim();
    const allAssets =
        view === "assets" &&
        request.nextUrl.searchParams.get("scope") === "all";
    const requestedGroupType =
        request.nextUrl.searchParams.get("groupType") === "LivenessFace"
            ? "LivenessFace"
            : "AIGC";
    if (view === "assets" && !groupId && !allAssets) {
        return NextResponse.json(
            { error: "groupId is required for assets unless scope=all" },
            { status: 400 },
        );
    }

    const action = view === "groups" ? "ListAssetGroups" : "ListAssets";
    const groupTypes =
        view === "groups" ? ["AIGC", "LivenessFace"] : [requestedGroupType];

    try {
        const items: unknown[] = [];
        const warnings: string[] = [];
        let successfulTypes = 0;
        const pageSize = 100;
        for (const groupType of groupTypes) {
            try {
                const filter: Record<string, unknown> = {
                    GroupType: groupType,
                };
                if (groupId && !allAssets) filter.GroupIds = [groupId];
                if (view === "assets") filter.Statuses = ["Active"];
                let loadedForType = 0;
                for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
                    const response = await callBearerEndpoint(
                        action,
                        {
                            Filter: filter,
                            PageNumber: pageNumber,
                            PageSize: pageSize,
                            SortBy: "CreateTime",
                            SortOrder: "Desc",
                            ProjectName:
                                env.VOLCENGINE_PROJECT_NAME?.trim() ||
                                "default",
                        },
                        env,
                    );
                    const result = resultOf(response);
                    const pageItems = listFromResult(result, view).map(
                        (item) =>
                            view === "groups" &&
                            item &&
                            typeof item === "object"
                                ? { ...(item as object), GroupType: groupType }
                                : item,
                    );
                    items.push(...pageItems);
                    loadedForType += pageItems.length;
                    const reportedTotal =
                        typeof result.TotalCount === "number"
                            ? result.TotalCount
                            : undefined;
                    if (
                        pageItems.length < pageSize ||
                        (reportedTotal !== undefined &&
                            loadedForType >= reportedTotal)
                    )
                        break;
                }
                successfulTypes += 1;
            } catch (error) {
                warnings.push(`${groupType}: ${safeErrorMessage(error, env)}`);
            }
        }
        if (successfulTypes === 0 && warnings.length > 0)
            throw new Error(warnings.join("；"));
        return NextResponse.json(
            {
                items,
                totalCount: items.length,
                warnings: warnings.length > 0 ? warnings : undefined,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? safeErrorMessage(error, env)
                        : "读取火山素材库失败",
            },
            { status: 502 },
        );
    }
}
