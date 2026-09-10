async function getJSON(fetchFn, url) {
    const res = await fetchFn(url);
    if (!res.ok)
        throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}
function str(o, k) {
    const v = o[k];
    return typeof v === 'string' ? v : '';
}
// Eager fetches (session core + todo) run once per chip on mount. A chat with
// the same id repeated many times would otherwise refetch per chip, so results
// are cached by id for a short window and shared across chips.
const CORE_TTL_MS = 30_000;
const noteboardItemCache = new Map();
function cached(cache, key, make) {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < CORE_TTL_MS)
        return hit.p;
    const p = make();
    cache.set(key, { at: now, p });
    // A rejected fetch must not be cached as a permanent failure.
    p.catch(() => { if (cache.get(key)?.p === p)
        cache.delete(key); });
    return p;
}
export function fetchNoteboardItemRef(fetchFn, noteboardBasePath, itemId) {
    return cached(noteboardItemCache, itemId, async () => {
        const raw = await getJSON(fetchFn, `${noteboardBasePath}/api/items/${encodeURIComponent(itemId)}`);
        const o = (raw ?? {});
        const tags = Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === 'string') : [];
        return {
            type: str(o, 'type'),
            title: str(o, 'title'),
            status: str(o, 'status'),
            priority: typeof o.priority === 'number' ? o.priority : 0,
            tags,
            due_at: str(o, 'due_at'),
            updated_at: str(o, 'updated_at'),
            held_at: typeof o.held_at === 'string' ? o.held_at : null,
            deleted_at: typeof o.deleted_at === 'string' ? o.deleted_at : null,
        };
    });
}
//# sourceMappingURL=noteboardItemRef.js.map