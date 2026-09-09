// Composer drafts keyed by session id. Persisted as a single object so a
// session's in-progress text survives layout changes, pane swaps, and reloads.
//
// What is left of the old `persistence.ts`, which also stored the deleted
// chat's collapse state, pane sizes, workspace tree and six filter sets. The
// only surviving consumer is `Composer.tsx`, so the file is named for what it
// actually holds.
const DRAFTS_KEY = 'bridge-ui-drafts';
function readDrafts() {
    try {
        const raw = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
        if (!raw || typeof raw !== 'object')
            return {};
        const out = {};
        for (const [k, v] of Object.entries(raw)) {
            if (typeof k === 'string' && typeof v === 'string')
                out[k] = v;
        }
        return out;
    }
    catch {
        return {};
    }
}
function writeDrafts(drafts) {
    try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    }
    catch { /* ignore */ }
}
export function loadDraft(sessionId) {
    if (!sessionId)
        return '';
    return readDrafts()[sessionId] ?? '';
}
export function saveDraft(sessionId, text) {
    if (!sessionId)
        return;
    const drafts = readDrafts();
    if (text)
        drafts[sessionId] = text;
    else
        delete drafts[sessionId];
    writeDrafts(drafts);
}
export function clearDraft(sessionId) {
    if (!sessionId)
        return;
    const drafts = readDrafts();
    if (sessionId in drafts) {
        delete drafts[sessionId];
        writeDrafts(drafts);
    }
}
//# sourceMappingURL=drafts.js.map