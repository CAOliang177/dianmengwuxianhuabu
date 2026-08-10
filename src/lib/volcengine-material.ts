export type MaterialKind = "image" | "video" | "audio";

export type VolcengineMaterial = {
    id: string;
    name?: string;
    type: MaterialKind;
    url?: string;
    groupId?: string;
    groupType?: string;
    /** Optional Seedance request role, e.g. first_frame / last_frame. */
    role?: string;
};

function readString(
    item: Record<string, unknown>,
    keys: string[],
): string | undefined {
    for (const key of keys) {
        const value = item[key];
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number") return String(value);
    }
    return undefined;
}

export function materialKind(item: Record<string, unknown>): MaterialKind {
    const candidates = [
        readString(item, [
            "Type",
            "AssetType",
            "MediaType",
            "MimeType",
            "ContentType",
            "Kind",
            "type",
        ]),
        readString(item, [
            "Name",
            "FileName",
            "OriginalName",
            "ObjectName",
            "URL",
            "Url",
            "FileUrl",
            "fileUrl",
            "url",
        ]),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    if (
        candidates.includes("video") ||
        /\.(?:mp4|mov|m4v|webm|avi|mkv)(?:\?|#|$)/i.test(candidates)
    )
        return "video";
    if (
        candidates.includes("audio") ||
        /\.(?:mp3|wav|m4a|aac|ogg|flac)(?:\?|#|$)/i.test(candidates)
    )
        return "audio";
    return "image";
}

export function normalizeVolcengineMaterial(
    item: unknown,
    groupId?: string,
): VolcengineMaterial | null {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const id = readString(record, [
        "Id",
        "ID",
        "AssetId",
        "AssetID",
        "GroupId",
        "GroupID",
        "assetId",
        "id",
    ]);
    if (!id) return null;
    return {
        id,
        name: readString(record, [
            "Name",
            "GroupName",
            "AssetGroupName",
            "AssetName",
            "DisplayName",
            "Title",
            "FileName",
            "OriginalName",
            "ObjectName",
            "name",
        ]),
        type: materialKind(record),
        url: readString(record, [
            "PreviewUrl",
            "PreviewURL",
            "CoverUrl",
            "CoverURL",
            "Url",
            "URL",
            "FileUrl",
            "fileUrl",
            "url",
        ]),
        groupId:
            groupId ||
            readString(record, ["GroupId", "GroupID", "AssetGroupId"]),
        groupType: readString(record, ["GroupType", "groupType"]),
        role: readString(record, ["Role", "role"]),
    };
}

export function parseVolcengineMaterials(value?: string): VolcengineMaterial[] {
    const raw = (value || "").trim();
    if (!raw) return [];
    if (raw.startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((item) => normalizeVolcengineMaterial(item))
                    .filter((item): item is VolcengineMaterial => !!item);
            }
        } catch {
            // Fall back to the legacy comma/newline format below.
        }
    }
    return raw
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map((id) => {
            const match = /^(image|video|audio):(.+)$/i.exec(id);
            const type = (match?.[1]?.toLowerCase() || "image") as MaterialKind;
            return { id: match?.[2] || id, type };
        });
}
