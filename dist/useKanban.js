import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from './context';
// kanbanPollWouldFetch reports whether the 15-second refresh has anything to
// ask for. It mirrors the guards at the top of fetchBoards and fetchView, which
// are what decide whether a poll issues an HTTP request or returns immediately.
// Exported so the render checks can pin it against those guards.
export function kanbanPollWouldFetch(enabled, loadBoards, boardID) {
    if (!enabled)
        return false;
    return loadBoards || Boolean(boardID);
}
// preserveUnchangedKanbanPayload returns the previous list when the refreshed
// one is identical to it, so a caller can hand it straight to a state setter
// and let React bail out of the re-render. A background refresh that fires
// while the pane is open mostly brings back exactly what is already on screen;
// storing a fresh array for that would re-render the pane, and everything below
// it, on every tick for no visible change. Same technique as fetchView's
// lastViewJSON, expressed as a value so callers need no ref of their own.
// Exported so the render checks can pin both directions.
export function preserveUnchangedKanbanPayload(previous, next) {
    return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}
/**
 * useKanban — list/create boards and (when a board id is given) load its
 * full BoardView with cards joined to noteboard items. Polls every 15s.
 * All mutate actions auto-refresh the affected scope.
 */
export function useKanban(boardID, options = {}) {
    // basePath is llm-bridge-server: the stop button has to reach past kanban-store
    // to interrupt the session that is actually running the card's work.
    const { fetch: fetchFn, kanbanStoreBasePath, basePath } = useBridgeConfig();
    const enabled = !!kanbanStoreBasePath;
    const { loadBoards = true, loadEntityTypes = true } = options;
    const [boards, setBoards] = useState([]);
    const [view, setView] = useState(null);
    const [entityTypes, setEntityTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const lastViewJSON = useRef('');
    const fetchBoards = useCallback(async () => {
        if (!enabled || !loadBoards) {
            setLoading(false);
            return;
        }
        try {
            const res = await fetchFn(`${kanbanStoreBasePath}/api/boards`);
            if (!res.ok)
                throw new Error(`/api/boards HTTP ${res.status}`);
            const data = (await res.json()) ?? [];
            setBoards(data);
            setError(null);
        }
        catch (err) {
            setError(`${err}`);
        }
    }, [fetchFn, kanbanStoreBasePath, enabled, loadBoards]);
    const fetchView = useCallback(async () => {
        if (!enabled || !boardID) {
            setView(null);
            return;
        }
        try {
            const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/cards`);
            if (!res.ok)
                throw new Error(`/api/boards/:id/cards HTTP ${res.status}`);
            const data = await res.json();
            const json = JSON.stringify(data);
            if (json !== lastViewJSON.current) {
                lastViewJSON.current = json;
                setView(data);
            }
            setError(null);
        }
        catch (err) {
            setError(`${err}`);
        }
    }, [fetchFn, kanbanStoreBasePath, enabled, boardID]);
    const fetchEntityTypes = useCallback(async () => {
        if (!enabled || !loadEntityTypes)
            return;
        try {
            const res = await fetchFn(`${kanbanStoreBasePath}/api/entity-types`);
            if (!res.ok)
                return;
            setEntityTypes((await res.json()) ?? []);
        }
        catch { /* non-fatal */ }
    }, [fetchFn, kanbanStoreBasePath, enabled, loadEntityTypes]);
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            await Promise.all([fetchBoards(), fetchView(), fetchEntityTypes()]);
            if (!cancelled)
                setLoading(false);
        };
        run();
        // Only run the timer when one of the two calls it makes can actually fetch.
        // The chat pane's LinkedKanbanPanel constructs this hook with loadBoards
        // false and no board id, and both callbacks then return at their first line
        // — so the interval fired every 15 seconds, per open chat pane, and issued no
        // request at all. The cards that panel shows come from listCardsForEntity
        // and listEntityTags, which this timer has never called; the panel runs its
        // own refresh over those two, at the same cadence.
        if (!kanbanPollWouldFetch(enabled, loadBoards, boardID)) {
            return () => { cancelled = true; };
        }
        const t = setInterval(() => { fetchBoards(); fetchView(); }, 15000);
        return () => { cancelled = true; clearInterval(t); };
    }, [fetchBoards, fetchView, fetchEntityTypes, enabled, loadBoards, boardID]);
    const createBoard = useCallback(async (args) => {
        if (!enabled)
            return null;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/boards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        });
        if (!res.ok) {
            setError(`createBoard HTTP ${res.status}`);
            return null;
        }
        const b = await res.json();
        await fetchBoards();
        return b;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchBoards]);
    const deleteBoard = useCallback(async (id) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) {
            setError(`deleteBoard HTTP ${res.status}`);
            return false;
        }
        await fetchBoards();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchBoards]);
    const createColumn = useCallback(async (args) => {
        if (!enabled || !boardID)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/columns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        });
        if (!res.ok) {
            setError(`createColumn HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, boardID, fetchView]);
    const deleteColumn = useCallback(async (columnID) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/columns/${encodeURIComponent(columnID)}`, { method: 'DELETE' });
        if (!res.ok) {
            setError(`deleteColumn HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    const createCard = useCallback(async (args) => {
        if (!enabled || !boardID)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/cards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            setError(`createCard HTTP ${res.status}: ${text}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, boardID, fetchView]);
    const moveCard = useCallback(async (cardID, columnID, position = 0) => {
        if (!enabled || !boardID)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board_id: boardID, column_id: columnID, position }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            setError(`moveCard HTTP ${res.status}: ${text}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, boardID, fetchView]);
    const patchCard = useCallback(async (cardID, patch) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            setError(`patchCard HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    /**
     * holdCard / unholdCard — the stop/play button.
     *
     * The hold lives on the noteboard item, not on this board, which is why it
     * works from ANY column rather than only from a designated gate column, and
     * why it also binds on the autoworker's noteboard-discovery path, which never
     * looks at a board at all.
     */
    const holdCard = useCallback(async (cardID, reason = '') => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/hold`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
        });
        if (!res.ok) {
            setError(`holdCard HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    const unholdCard = useCallback(async (cardID) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/unhold`, {
            method: 'POST',
        });
        if (!res.ok) {
            setError(`unholdCard HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    const deleteCard = useCallback(async (cardID, hard = false) => {
        if (!enabled)
            return false;
        const url = `${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}${hard ? '?hard=true' : ''}`;
        const res = await fetchFn(url, { method: 'DELETE' });
        if (!res.ok) {
            setError(`deleteCard HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    /**
     * detachCard — take a card off this board without touching the work.
     *
     * The placement is kanban-store's; the card's content is a noteboard item that
     * other things may point at. Detaching removes only the placement, so the todo
     * survives and can be attached to another board later.
     *
     * This is the operation to reach for when a card should stop appearing here.
     * deleteCard below is a different thing entirely: it deletes the noteboard
     * item, and on a reversible delete it LEAVES the placement behind, so the card
     * turns into a null-item orphan on this board rather than departing it.
     */
    const detachCard = useCallback(async (boardID, cardID) => {
        if (!enabled)
            return false;
        const url = `${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/cards/${encodeURIComponent(cardID)}`;
        const res = await fetchFn(url, { method: 'DELETE' });
        if (!res.ok) {
            setError(`detachCard HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    /**
     * archiveCard — mark the work archived, leaving it a live, restorable item.
     *
     * noteboard keeps archiving and deletion deliberately apart: archiving is a
     * state chosen for an item that still exists, deletion is the item being taken
     * away. The drawer's "Archive" button used to call deleteCard, which set
     * deleted_at and never touched status — so the two were the same button under
     * different names, and a restore could not tell which had happened.
     */
    const archiveCard = useCallback(async (cardID) => {
        return patchCard(cardID, { status: 'archived' });
    }, [patchCard]);
    const listCardLinks = useCallback(async (cardID) => {
        if (!enabled)
            return [];
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/links`);
        if (!res.ok)
            return [];
        return (await res.json()) ?? [];
    }, [fetchFn, kanbanStoreBasePath, enabled]);
    /**
     * stopCard — the stop button, in whichever column the card is sitting.
     *
     * Two halves, because a card can be gated before it runs OR already running:
     *   1. Hold the item, so no future autoworker tick dispatches it.
     *   2. Interrupt any session already working it, so the agent stops NOW.
     *
     * The card does not move. It stays In Progress and paused, which keeps its
     * session link meaningful — a card bounced back to Queued would have a link to
     * a session that is no longer working it.
     *
     * Interrupt (not kill) is deliberate: llm-bridge models it as SessionPaused,
     * "user-interrupted, can be resumed", so pressing play genuinely resumes the
     * turn rather than starting the task over.
     */
    const stopCard = useCallback(async (cardID, reason = '') => {
        if (!enabled)
            return false;
        if (!(await holdCard(cardID, reason)))
            return false;
        const sessions = (await listCardLinks(cardID))
            .filter(l => l.entity_type === 'session')
            .map(l => l.entity_ref);
        // A failed interrupt must not read as a successful stop. The hold already
        // landed, so nothing NEW will be dispatched — but the agent already running
        // is still running, and saying otherwise is the one lie this button cannot
        // afford to tell.
        let allPaused = true;
        for (const sid of sessions) {
            const res = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sid)}/interrupt`, { method: 'POST' });
            if (!res.ok) {
                allPaused = false;
                setError(`held the card, but session ${sid} did not interrupt (HTTP ${res.status}) — it may still be working`);
            }
        }
        await fetchView();
        return allPaused;
    }, [fetchFn, basePath, enabled, holdCard, listCardLinks, fetchView]);
    /**
     * playCard — the play button: clear the gate, and resume whatever we paused.
     *
     * A session is only resumed if it is actually `paused`. Blindly POSTing resume
     * to every linked session would also poke sessions that ended on their own —
     * play means "undo the stop", not "run this again", and a card can carry links
     * to sessions from earlier, completed dispatches.
     */
    const playCard = useCallback(async (cardID) => {
        if (!enabled)
            return false;
        if (!(await unholdCard(cardID)))
            return false;
        const sessions = (await listCardLinks(cardID))
            .filter(l => l.entity_type === 'session')
            .map(l => l.entity_ref);
        for (const sid of sessions) {
            const get = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sid)}`);
            if (!get.ok)
                continue;
            const session = await get.json().catch(() => null);
            if (session?.state !== 'paused')
                continue;
            const res = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sid)}/resume`, { method: 'POST' });
            if (!res.ok)
                setError(`cleared the hold, but session ${sid} did not resume (HTTP ${res.status})`);
        }
        await fetchView();
        return true;
    }, [fetchFn, basePath, enabled, unholdCard, listCardLinks, fetchView]);
    const addCardLink = useCallback(async (cardID, entity_type, entity_ref, label) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_type, entity_ref, label }),
        });
        if (!res.ok) {
            setError(`addCardLink HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    const deleteCardLink = useCallback(async (linkID) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/links/${encodeURIComponent(linkID)}`, { method: 'DELETE' });
        if (!res.ok) {
            setError(`deleteCardLink HTTP ${res.status}`);
            return false;
        }
        await fetchView();
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled, fetchView]);
    // These two throw rather than reporting through the hook's `error`, because
    // their only caller renders its own error and never reads that field. An
    // empty array returned for a failed request is indistinguishable from a
    // session that genuinely has no linked cards, and the caller refreshes on a
    // timer — so a single blip would replace a real list with "No linked cards
    // yet" and leave it there, silently, until the next tick. Failing loudly is
    // what lets the caller keep the last good answer on screen.
    const listCardsForEntity = useCallback(async (entityType, entityRef) => {
        if (!enabled)
            return [];
        const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/cards`);
        if (!res.ok)
            throw new Error(`listCardsForEntity HTTP ${res.status}`);
        return (await res.json()) ?? [];
    }, [fetchFn, kanbanStoreBasePath, enabled]);
    const listEntityTags = useCallback(async (entityType, entityRef) => {
        if (!enabled)
            return [];
        const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags`);
        if (!res.ok)
            throw new Error(`listEntityTags HTTP ${res.status}`);
        return (await res.json()) ?? [];
    }, [fetchFn, kanbanStoreBasePath, enabled]);
    const addEntityTag = useCallback(async (entityType, entityRef, tag) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag }),
        });
        if (!res.ok) {
            setError(`addEntityTag HTTP ${res.status}`);
            return false;
        }
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled]);
    const deleteEntityTag = useCallback(async (entityType, entityRef, tag) => {
        if (!enabled)
            return false;
        const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags/${encodeURIComponent(tag)}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            setError(`deleteEntityTag HTTP ${res.status}`);
            return false;
        }
        return true;
    }, [fetchFn, kanbanStoreBasePath, enabled]);
    return useMemo(() => ({
        boards,
        view,
        entityTypes,
        loading,
        error,
        refresh: () => { fetchBoards(); fetchView(); },
        createBoard,
        deleteBoard,
        createColumn,
        deleteColumn,
        createCard,
        moveCard,
        patchCard,
        deleteCard,
        detachCard,
        archiveCard,
        holdCard,
        unholdCard,
        stopCard,
        playCard,
        listCardLinks,
        addCardLink,
        deleteCardLink,
        listCardsForEntity,
        listEntityTags,
        addEntityTag,
        deleteEntityTag,
    }), [
        boards, view, entityTypes, loading, error,
        fetchBoards, fetchView,
        createBoard, deleteBoard, createColumn, deleteColumn,
        createCard, moveCard, patchCard, deleteCard, detachCard, archiveCard,
        holdCard, unholdCard, stopCard, playCard,
        listCardLinks, addCardLink, deleteCardLink,
        listCardsForEntity, listEntityTags, addEntityTag, deleteEntityTag,
    ]);
}
//# sourceMappingURL=useKanban.js.map