const COMMON_MIME_BY_EXTENSION: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/opus",
    flac: "audio/flac",
};

export function inferUploadMime(
    filename: string,
    fieldName = "",
): string | undefined {
    const extension = filename.split(".").pop()?.toLowerCase();
    if (!extension || extension === filename.toLowerCase()) return undefined;
    if (extension === "webm") {
        return fieldName.startsWith("audios") ? "audio/webm" : "video/webm";
    }
    return COMMON_MIME_BY_EXTENSION[extension];
}
