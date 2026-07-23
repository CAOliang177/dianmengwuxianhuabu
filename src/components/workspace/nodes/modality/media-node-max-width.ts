/**
 * Image/video nodes: the canvas node width is proportional to the media long-edge pixel count (for example, 1024 and 2048 are about 1:2),
 * making resolution differences easier to compare visually. Min/max values prevent nodes from becoming too small or covering the canvas.
 */

/** Reference long edge (px): this length maps to a node width of REF_DISPLAY_WIDTH_PX */
export const MEDIA_NODE_REF_LONG_EDGE_PX = 1024;

/** Target outer node width (CSS px) when the long edge equals REF */
export const MEDIA_NODE_REF_DISPLAY_WIDTH_PX = 256;

export const MEDIA_NODE_MIN_DISPLAY_WIDTH_PX = 120;
export const MEDIA_NODE_MAX_DISPLAY_WIDTH_PX = 720;

/** Uploaded/reference images use the same preview width as generated images. */
export const IMAGE_NODE_MAX_DISPLAY_WIDTH_PX = 480;

export function normalizedImageAspectRatio(width: number, height: number) {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return 1;
    }

    const rawAspectRatio = width / height;
    const canonicalRatios = [
        1,
        16 / 9,
        9 / 16,
        4 / 3,
        3 / 4,
        3 / 2,
        2 / 3,
        21 / 9,
    ];
    const nearestRatio = canonicalRatios.reduce((best, candidate) =>
        Math.abs(rawAspectRatio - candidate) < Math.abs(rawAspectRatio - best)
            ? candidate
            : best,
    );

    return Math.abs(rawAspectRatio - nearestRatio) / nearestRatio <= 0.035
        ? nearestRatio
        : rawAspectRatio;
}

/**
 * Calculate the canvas node width (px) linearly from the long edge, rounded and clamped.
 */
export function proportionalMediaNodeWidthPx(
    width: number,
    height: number,
): number {
    const long = Math.max(width, height);
    if (!Number.isFinite(long) || long <= 0) {
        return MEDIA_NODE_REF_DISPLAY_WIDTH_PX;
    }
    const raw =
        (long / MEDIA_NODE_REF_LONG_EDGE_PX) * MEDIA_NODE_REF_DISPLAY_WIDTH_PX;
    return Math.round(
        Math.min(
            MEDIA_NODE_MAX_DISPLAY_WIDTH_PX,
            Math.max(MEDIA_NODE_MIN_DISPLAY_WIDTH_PX, raw),
        ),
    );
}

/**
 * Generated-image previews are 480px wide. Keep uploaded/reference images at
 * that exact width too, so equal aspect ratios have an identical visible size.
 * Pixel resolution is deliberately ignored.
 */
export function normalizedImageNodeWidthPx(
    width: number,
    height: number,
): number {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return IMAGE_NODE_MAX_DISPLAY_WIDTH_PX;
    }

    return IMAGE_NODE_MAX_DISPLAY_WIDTH_PX;
}
