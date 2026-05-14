import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from './context';
/**
 * useKanban — list/create boards and (when a board id is given) load its
 * full BoardView with cards joined to noteboard items. Polls every 15s.
 * All mutate actions auto-refresh the affected scope.
 */
export function useKanban(boardID, options = {}) {
    const { fetch: fetchFn, kanbanStoreBasePath } = useBridgeConfig();
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
        const t = setInterval(() => { fetchBoards(); fetchView(); }, 15000);
        return () => { cancelled = true; clearInterval(t); };
    }, [fetchBoards, fetchView, fetchEntityTypes]);
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
    const listCardLinks = useCallback(async (cardID) => {
        if (!enabled)
            return [];
        const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/links`);
        if (!res.ok)
            return [];
        return (await res.json()) ?? [];
    }, [fetchFn, kanbanStoreBasePath, enabled]);
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
    const listCardsForEntity = useCallback(async (entityType, entityRef) => {
        if (!enabled)
            return [];
        const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/cards`);
        if (!res.ok) {
            setError(`listCardsForEntity HTTP ${res.status}`);
            return [];
        }
        return (await res.json()) ?? [];
    }, [fetchFn, kanbanStoreBasePath, enabled]);
    const listEntityTags = useCallback(async (entityType, entityRef) => {
        if (!enabled)
            return [];
        const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags`);
        if (!res.ok) {
            setError(`listEntityTags HTTP ${res.status}`);
            return [];
        }
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
        createCard, moveCard, patchCard, deleteCard,
        listCardLinks, addCardLink, deleteCardLink,
        listCardsForEntity, listEntityTags, addEntityTag, deleteEntityTag,
    ]);
}
//# sourceMappingURL=useKanban.js.map