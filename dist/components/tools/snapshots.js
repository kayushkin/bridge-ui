// Shared types and helpers for fetching tool-call file snapshots from the
// bridge server. Both EditRenderer and BashRenderer use these to render the
// diff for whichever files a tool call mutated.
// loadSide fetches the blob for one phase, falling back to a caller-supplied
// string when the snapshot is absent or unavailable (binary, oversized,
// missing, no blob_url).
export async function loadSide(fetchFn, basePath, label, meta, fallback) {
    if (!meta) {
        return { label, content: fallback ?? '' };
    }
    if (meta.missing || meta.is_binary || meta.too_large || !meta.blob_url) {
        return { label, content: fallback ?? '', meta };
    }
    const res = await fetchFn(`${basePath}${meta.blob_url}`);
    if (!res.ok)
        throw new Error(`blob ${res.status}`);
    const text = await res.text();
    return { label, content: text, meta };
}
// sidesHint surfaces side-specific degradations (binary, oversized, new file)
// so the UI can explain why a half of the diff is empty.
export function sidesHint(before, after) {
    const parts = [];
    if (before?.missing && !after?.missing)
        parts.push('new file');
    if (after?.missing && !before?.missing)
        parts.push('file deleted');
    if (before?.is_binary || after?.is_binary)
        parts.push('binary file');
    if (before?.too_large || after?.too_large)
        parts.push('file exceeds size cap');
    return parts.join(' · ');
}
//# sourceMappingURL=snapshots.js.map