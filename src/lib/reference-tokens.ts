export type ReferenceTokenKind = "图片" | "视频" | "音频";

export function removeAndRenumberReferenceTokens(
    prompt: string,
    kind: ReferenceTokenKind,
    removedNumbers: ReadonlySet<number>,
): string {
    if (removedNumbers.size === 0) return prompt;
    const pattern = new RegExp(`@${kind}(\\d+)`, "g");
    return prompt
        .replace(pattern, (_token, rawNumber: string) => {
            const number = Number(rawNumber);
            if (removedNumbers.has(number)) return "";
            const shift = [...removedNumbers].filter(
                (removed) => removed < number,
            ).length;
            return `@${kind}${number - shift}`;
        })
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([，。！？,.!?])/g, "$1")
        .trim();
}
