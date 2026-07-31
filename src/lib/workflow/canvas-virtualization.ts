interface CanvasTaskState {
    status: string;
}

/**
 * Running node components own their live task subscriptions. They must remain
 * mounted until every task is terminal; idle canvases can safely virtualize
 * off-screen nodes for performance.
 */
export function shouldVirtualizeCanvasNodes(
    tasks: Iterable<CanvasTaskState>,
): boolean {
    for (const task of tasks) {
        if (task.status === "PENDING" || task.status === "PROCESSING") {
            return false;
        }
    }
    return true;
}
