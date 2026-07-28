import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/utils/json-utils";

/**
 * Persistent task snapshot used as a recovery path when the final SSE event is
 * lost (for example, a brief client-network interruption at completion).
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    try {
        const db = await getDb();
        const task = await db.query.tasks.findFirst({
            where: eq(tasks.id, id),
        });
        if (!task) {
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 },
            );
        }
        return NextResponse.json(
            {
                task: {
                    ...task,
                    prompt: safeJsonParse(task.prompt, {}),
                    result: safeJsonParse(task.result, null),
                },
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    } catch (error) {
        logger.error(`[API /api/task/${id}] Error:`, error);
        return NextResponse.json(
            { error: "Failed to get task" },
            { status: 500 },
        );
    }
}
