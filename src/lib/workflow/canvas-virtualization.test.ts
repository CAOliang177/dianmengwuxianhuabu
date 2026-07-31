import { describe, expect, it } from "vitest";
import { shouldVirtualizeCanvasNodes } from "./canvas-virtualization";

describe("shouldVirtualizeCanvasNodes", () => {
    it.each(["PENDING", "PROCESSING"])(
        "keeps off-screen nodes mounted while a %s task is active",
        (status) => {
            expect(shouldVirtualizeCanvasNodes([{ status }])).toBe(false);
        },
    );

    it("enables virtualization again after all tasks are terminal", () => {
        expect(
            shouldVirtualizeCanvasNodes([
                { status: "COMPLETED" },
                { status: "FAILED" },
            ]),
        ).toBe(true);
    });
});
