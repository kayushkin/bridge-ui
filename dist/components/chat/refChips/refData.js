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
export async function fetchSessionRef(fetchFn, basePath, sessionId) {
    const raw = await getJSON(fetchFn, `${basePath}/sessions/${encodeURIComponent(sessionId)}`);
    const o = (raw ?? {});
    const info = (o.info ?? {});
    const harnessSessionId = str(o, 'harness_session_id');
    return {
        display_name: str(o, 'display_name'),
        state: str(o, 'state'),
        type: str(o, 'type'),
        harness: str(o, 'harness'),
        model: str(info, 'model'),
        updated_at: str(o, 'updated_at'),
        cost_usd: await lookupCost(fetchFn, basePath, sessionId, harnessSessionId),
    };
}
export async function fetchTodoRef(fetchFn, noteboardBasePath, itemId) {
    const raw = await getJSON(fetchFn, `${noteboardBasePath}/api/items/${encodeURIComponent(itemId)}`);
    const o = (raw ?? {});
    const tags = Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === 'string') : [];
    return {
        title: str(o, 'title'),
        status: str(o, 'status'),
        priority: typeof o.priority === 'number' ? o.priority : 0,
        tags,
        due_at: str(o, 'due_at'),
        updated_at: str(o, 'updated_at'),
        held_at: typeof o.held_at === 'string' ? o.held_at : null,
        deleted_at: typeof o.deleted_at === 'string' ? o.deleted_at : null,
    };
}
let aggCache = null;
const AGG_TTL_MS = 30_000;
async function loadAggregates(fetchFn, basePath) {
    const now = Date.now();
    if (aggCache && now - aggCache.at < AGG_TTL_MS)
        return aggCache.rows;
    const raw = await getJSON(fetchFn, `${basePath}/sessions/aggregates`);
    const rows = Array.isArray(raw)
        ? raw.map(r => ({
            session_id: str(r, 'session_id'),
            cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : 0,
        }))
        : [];
    aggCache = { at: now, rows };
    return rows;
}
async function lookupCost(fetchFn, basePath, sessionId, harnessSessionId) {
    try {
        const rows = await loadAggregates(fetchFn, basePath);
        const hit = rows.find(r => r.session_id === sessionId || (harnessSessionId !== '' && r.session_id === harnessSessionId));
        return hit ? hit.cost_usd : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=refData.js.map