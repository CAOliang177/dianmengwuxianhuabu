import type { ResolutionTier } from "@/constants/media-options";

export type VideoResolutionValue = "480p" | "720p" | "1080p" | "4k";

const VIDEO_RESOLUTION_480P: ResolutionTier = {
    value: "480p",
    label: "480P",
    scale: 1,
};

const VIDEO_RESOLUTION_720P: ResolutionTier = {
    value: "720p",
    label: "720P",
    scale: 1,
};

const VIDEO_RESOLUTION_1080P: ResolutionTier = {
    value: "1080p",
    label: "1080P",
    scale: 1,
};

const VIDEO_RESOLUTION_4K: ResolutionTier = {
    value: "4k",
    label: "4K",
    scale: 1,
};

const SEEDANCE_HD_TIERS = [
    VIDEO_RESOLUTION_480P,
    VIDEO_RESOLUTION_720P,
] as const;

const SEEDANCE_STANDARD_TIERS = [
    VIDEO_RESOLUTION_480P,
    VIDEO_RESOLUTION_720P,
    VIDEO_RESOLUTION_1080P,
    VIDEO_RESOLUTION_4K,
] as const;

export function isSeedance25Model(model?: string): boolean {
    const normalized = (model || "").trim().toLowerCase();
    return (
        normalized === "" ||
        normalized.includes("seedance-2-5") ||
        normalized.includes("seedance-2.5")
    );
}

export function videoResolutionTiersForModel(model?: string): ResolutionTier[] {
    const normalized = (model || "").trim().toLowerCase();
    if (
        isSeedance25Model(normalized) ||
        normalized.includes("fast") ||
        normalized.includes("mini")
    ) {
        return [...SEEDANCE_HD_TIERS];
    }
    return [...SEEDANCE_STANDARD_TIERS];
}

export function normalizeVideoResolution(
    value: unknown,
    model?: string,
): VideoResolutionValue {
    const tiers = videoResolutionTiersForModel(model);
    const candidate = String(value || "")
        .trim()
        .toLowerCase();
    return tiers.some((tier) => tier.value === candidate)
        ? (candidate as VideoResolutionValue)
        : "720p";
}
