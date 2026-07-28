import { describe, expect, it } from "vitest";
import { normalizeTaskPayloadData } from "./payload";

describe("normalizeTaskPayloadData", () => {
    it("merges image output nested in result and JSON data", () => {
        expect(
            normalizeTaskPayloadData({
                data: "```json\n{\"status\":\"ok\"}\n```",
                result: {
                    output: {
                        images: [{ file_key: "generated.png" }],
                    },
                },
            }),
        ).toMatchObject({
            status: "ok",
            images: [{ file_key: "generated.png" }],
        });
    });
});
