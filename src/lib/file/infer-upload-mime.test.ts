import { describe, expect, it } from "vitest";
import { inferUploadMime } from "./infer-upload-mime";

describe("inferUploadMime", () => {
    it("recognizes video formats used by canvas uploads", () => {
        expect(inferUploadMime("clip.mp4", "videos[0]")).toBe("video/mp4");
        expect(inferUploadMime("clip.mov", "videos[0]")).toBe(
            "video/quicktime",
        );
        expect(inferUploadMime("clip.avi", "videos[0]")).toBe(
            "video/x-msvideo",
        );
        expect(inferUploadMime("clip.webm", "videos[0]")).toBe("video/webm");
    });

    it("disambiguates WebM audio from WebM video", () => {
        expect(inferUploadMime("sound.webm", "audios[0]")).toBe("audio/webm");
    });

    it("returns undefined for unknown extensions", () => {
        expect(inferUploadMime("clip.unknown", "videos[0]")).toBeUndefined();
    });
});
