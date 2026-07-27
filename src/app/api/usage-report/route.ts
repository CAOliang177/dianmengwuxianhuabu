import { type NextRequest, NextResponse } from "next/server";
import {
    reportUsageEvent,
    type UsageEventInput,
} from "@/lib/usage/usage-reporting.server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
    const result = await reportUsageEvent(body as UsageEventInput);
    return NextResponse.json(result, { status: 202 });
}
