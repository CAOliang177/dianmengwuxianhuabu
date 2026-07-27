import { type NextRequest, NextResponse } from "next/server";
import {
    loadUsageSettings,
    saveUsageSettings,
    usageQueueSize,
} from "@/lib/usage/usage-reporting.server";

export const runtime = "nodejs";

function publicSettings() {
    const settings = loadUsageSettings();
    return {
        enabled: settings.enabled,
        clientId: settings.clientId,
        clientName: settings.clientName,
        queueSize: usageQueueSize(),
    };
}

export function GET() {
    return NextResponse.json(
        publicSettings(),
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function PUT(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    }
    saveUsageSettings({
        enabled:
            typeof (body as { enabled?: unknown }).enabled === "boolean"
                ? (body as { enabled: boolean }).enabled
                : undefined,
        clientName:
            typeof (body as { clientName?: unknown }).clientName === "string"
                ? (body as { clientName: string }).clientName
                : undefined,
    });
    return NextResponse.json(publicSettings());
}
