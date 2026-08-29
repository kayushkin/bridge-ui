import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { cleanEmailBodyForPreview } from '../emailText';
import { useKanban } from '../useKanban';
import { formatAgeCompact } from '../utils';
import { entityTarget, isLocalPathRef } from '../entityLinks';
import { CardBudgetBadge, CardTimelinePanel, hasClockData } from './CardTime';
import { readAgentPrompt, stripAgentPrompt, writeAgentPrompt, suggestAgentPrompt } from '../agentPrompt';
import { dispatchAgentOnCard } from '../agentDispatch';
import { SignalKindQuestion } from '../types';
import { groupSignalsByRequest, useOpenSignalsByTodo, useOpenSignalsForTodo } from './chat/signalData';
import { SignalRequestCard } from './chat/SignalCard';
import { fetchNoteboardItemRef } from './chat/refChips/refData';
import { CARD_AXES, allCardsOf, axisUsage, filterIsActive, matchesFilter, parseEmailLocator, sortCards, withAxisValue, } from '../kanbanAxes';
// latestSessionLink returns the most recently attached session, which is the one
// that describes what is happening to the card now.
//
// Cards carry a single session link today, so newest and first are the same row
// and the old "return the first match" behaviour was never visibly wrong. It was
// only ever right by accident: nothing stops a second dispatch adding a second
// link, and on the day that happens, first-match silently reports the oldest
// agent as the current one.
function latestSessionLink(card) {
    let newest = null;
    for (const l of card.links ?? []) {
        if (l.entity_type !== 'session' || !l.entity_ref)
            continue;
        // An unparseable timestamp sorts oldest rather than winning by accident.
        const at = new Date(l.created_at).getTime();
        const rank = Number.isFinite(at) ? at : -Infinity;
        if (!newest || rank > newest.at) {
            newest = { ref: l.entity_ref, dispatchedAt: l.created_at, at: rank };
        }
    }
    return newest ? { ref: newest.ref, dispatchedAt: newest.dispatchedAt } : null;
}
const LAYOUT_KEY = 'bk:layout';
const LAST_BOARD_KEY = 'bk:lastBoardId';
const COLLAPSED_COLUMNS_KEY = 'bk:collapsedColumns';
const DEFAULT_BOARD_NAME = 'Agent runs';
/** How many cards a column loads at a time, and how many each "show more" adds. */
const CARDS_PER_COLUMN = 25;
// How many linked emails a card drawer shows before collapsing the rest behind a
// button. Bucket cards on the Email board accumulate every message from a sender,
// so this list grows without bound while the card itself stays one thing.
const EMAIL_LINKS_SHOWN = 25;
function loadCollapsedColumns() {
    if (typeof localStorage === 'undefined')
        return new Set();
    try {
        const raw = localStorage.getItem(COLLAPSED_COLUMNS_KEY);
        if (!raw)
            return new Set();
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
    }
    catch {
        return new Set();
    }
}
/**
 * Kanban page. The header carries a board selector and a layout toggle so the
 * column flow can run side-by-side (landscape) or stacked (portrait). Card
 * click opens a drawer with body, status, links, and entity-link/tag editors.
 */
export function BridgeKanban() {
    const [selectedBoardID, setSelectedBoardID] = useState(null);
    // ⚠️ The open card lives in the URL and NOWHERE else — there is deliberately no
    // `useState` mirroring it.
    //
    // A card is shareable ("look at this one"), so `?card=<id>` had to exist. The
    // obvious shape is local state plus two effects syncing it to the query string,
    // and that is the shape that loops: each effect observes the other's write and
    // writes back. `sessionDeeplink.ts` carries a small state machine precisely to
    // survive that, because the chat's `activeId` is genuine state owned by a store.
    // The drawer's is not — nothing but this component ever decides which card is
    // open — so making the query string the only copy removes the synchronisation
    // problem rather than managing it.
    //
    // The id IS a noteboard item id (see the signals comment below), so the link is
    // also a stable reference to the todo the card is made of.
    const [searchParams, setSearchParams] = useSearchParams();
    const drawerCardID = searchParams.get('card');
    const setDrawerCardID = useCallback((cardID) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (cardID)
                next.set('card', cardID);
            else
                next.delete('card');
            return next;
        }, 
        // Replace rather than push: opening and closing a drawer half a dozen
        // times while reading a board would otherwise bury the page the user
        // arrived from under a stack of its own states.
        { replace: true });
    }, [setSearchParams]);
    const [showNewBoard, setShowNewBoard] = useState(false);
    const [showNewColumn, setShowNewColumn] = useState(false);
    const [composeColumn, setComposeColumn] = useState(null);
    const [layout, setLayout] = useState(() => {
        if (typeof localStorage === 'undefined')
            return 'horizontal';
        return localStorage.getItem(LAYOUT_KEY) === 'vertical' ? 'vertical' : 'horizontal';
    });
    const [collapsedColumns, setCollapsedColumns] = useState(loadCollapsedColumns);
    // Axis filter and sort are view state only: they never write to the board, so
    // two people can look at the same board through different lenses.
    const [axisFilter, setAxisFilter] = useState({});
    // Priority-then-due-date is the default because the stored order is arbitrary:
    // every writer on this host creates cards at position 0, so "board order" is
    // really "reverse order of creation" and says nothing about what to do first.
    const [sortKey, setSortKey] = useState('priority');
    const { routes, mailBasePath, mailPagePath, basePath: bridgeBasePath, fetch: fetchFn, 
    // Read directly as well as through useKanban: resolving a deeplinked card's
    // board is a one-off request that hook has no verb for.
    kanbanStoreBasePath, } = useBridgeConfig();
    const navigate = useNavigate();
    const openSessionLink = (link) => {
        navigate(`${routes.chat}?session=${encodeURIComponent(link.ref)}`);
    };
    // A screenful a column. The largest board here holds 6,466 cards and answered
    // 12 MB per read before this cap; the rest arrive when asked for.
    const k = useKanban(selectedBoardID, { columnPageSize: CARDS_PER_COLUMN });
    // A card id IS a noteboard todo id here, so the signals a session raised
    // against its todo land on the card that todo already has. The map covers
    // every todo, so switching boards needs no refetch.
    const signalsByTodo = useOpenSignalsByTodo();
    useEffect(() => {
        localStorage.setItem(LAYOUT_KEY, layout);
    }, [layout]);
    useEffect(() => {
        localStorage.setItem(COLLAPSED_COLUMNS_KEY, JSON.stringify([...collapsedColumns]));
    }, [collapsedColumns]);
    const toggleColumnCollapsed = (columnID) => {
        setCollapsedColumns(prev => {
            const next = new Set(prev);
            if (next.has(columnID))
                next.delete(columnID);
            else
                next.add(columnID);
            return next;
        });
    };
    useEffect(() => {
        if (selectedBoardID)
            localStorage.setItem(LAST_BOARD_KEY, selectedBoardID);
    }, [selectedBoardID]);
    // Pick the initial board: last-opened (if it still exists) → Agent Runs → first.
    useEffect(() => {
        if (selectedBoardID)
            return;
        if (k.boards.length === 0)
            return;
        const last = localStorage.getItem(LAST_BOARD_KEY);
        if (last && k.boards.some(b => b.id === last)) {
            setSelectedBoardID(last);
            return;
        }
        const named = k.boards.find(b => b.name === DEFAULT_BOARD_NAME);
        if (named) {
            setSelectedBoardID(named.id);
            return;
        }
        setSelectedBoardID(k.boards[0].id);
    }, [k.boards, selectedBoardID]);
    // Deep link into the host's mail page. The account is carried alongside the
    // message id because mailstack requires it on every read — a message id alone
    // is not addressable there.
    const openEmailInMail = (accountID, messageID) => {
        if (!mailPagePath)
            return;
        navigate(`${mailPagePath}?account=${encodeURIComponent(accountID)}&message=${encodeURIComponent(messageID)}`);
    };
    const drawerCard = useMemo(() => {
        if (!drawerCardID || !k.view)
            return null;
        for (const col of k.view.columns) {
            for (const c of col.cards ?? []) {
                if (c.placement.card_id === drawerCardID)
                    return c;
            }
        }
        return null;
    }, [drawerCardID, k.view]);
    // A deeplinked card is usually on some OTHER board than the one that opened.
    //
    // `drawerCard` above searches the loaded board's view, so without this a
    // `?card=` link silently opened nothing whenever the recipient's last-opened
    // board was not the card's — which is the common case, and indistinguishable
    // from a dead link. kanban-store answers "which boards is this card on?"
    // directly, so the fix is one request rather than loading every board.
    //
    // Guarded by a ref keyed on the card id, not a boolean: the effect re-runs when
    // the view arrives, and an unguarded version would re-request on every render
    // for a card that genuinely is on no board. One attempt per id, and a card that
    // resolves to nothing leaves the board selection alone rather than clearing it.
    const boardResolveAttempted = useRef(null);
    useEffect(() => {
        if (!drawerCardID || drawerCard || !kanbanStoreBasePath)
            return;
        // Wait for the view: mid-load it is null and the card may well be in it.
        if (!k.view)
            return;
        if (boardResolveAttempted.current === drawerCardID)
            return;
        boardResolveAttempted.current = drawerCardID;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(drawerCardID)}/placements`);
                if (!res.ok || cancelled)
                    return;
                // ⚠️ kanban-store answers a card id it does not know with 200 and a JSON
                // `null` body, NOT a 404 — measured against the live service. So `res.ok`
                // is not evidence that a card exists, and annotating this `Placement[]`
                // was a claim the wire does not honour.
                //
                // ⚪ This check changes NO observable answer, and that was measured
                // rather than assumed. Removing it and running the browser spec leaves
                // all nine cases green: `.find` throws on the null, the catch below
                // swallows it, and the outcome — no board change, no drawer, one
                // request — is identical. A `pageerror` assertion cannot see it either,
                // because the throw is handled by design.
                //
                // It is kept for the TYPE, not the control flow: the response was
                // annotated `Placement[]`, which is a claim the wire does not honour, so
                // `unknown` plus a checked narrowing is the honest shape. Anyone
                // tempted to restore the annotation should know it was measured false.
                //
                // ⚠️ Do NOT cite this as precedent for keeping a defensive guard.
                // `dash/src/pages/dashv2/panePersistence.ts` DELETED an `Array.isArray`
                // guard for exactly this property and recorded the measurement in its
                // place. The only thing earning this one its keep is the type.
                const placements = await res.json();
                if (!Array.isArray(placements) || cancelled)
                    return;
                const target = placements.find(p => p.board_id && p.board_id !== selectedBoardID);
                if (target?.board_id && !cancelled)
                    setSelectedBoardID(target.board_id);
            }
            catch {
                // A link to a card that no longer exists is a dead link, not an error
                // state for the whole board — the drawer simply stays shut.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [drawerCardID, drawerCard, k.view, kanbanStoreBasePath, fetchFn, selectedBoardID]);
    // Axis controls render only for boards whose cards actually carry these tags.
    // Boards that predate the classifier report no axes and are left exactly as
    // they were — this component is shared with llmux.
    const axes = useMemo(() => (k.view ? axisUsage(allCardsOf(k.view.columns)) : []), [k.view]);
    // Filtering and sorting are applied to a copy. The board view itself stays
    // untouched so the drawer, the delete-column count and the orphan list keep
    // reporting what is really on the board rather than what survived the filter.
    const visibleColumns = useMemo(() => {
        if (!k.view)
            return [];
        return k.view.columns.map(cv => ({
            ...cv,
            cards: sortCards((cv.cards ?? []).filter(c => matchesFilter(c, axisFilter)), sortKey),
        }));
    }, [k.view, axisFilter, sortKey]);
    const hiddenCardCount = k.view
        ? allCardsOf(k.view.columns).length - allCardsOf(visibleColumns).length
        : 0;
    return (_jsxs("div", { className: "bk-container", children: [_jsxs("main", { className: "bk-main", children: [k.error && _jsx("div", { className: "bridge-error", children: k.error }), _jsxs("div", { className: "bk-board-header", children: [_jsxs("div", { className: "bk-board-header-main", children: [_jsxs("select", { className: "bk-board-select", value: selectedBoardID ?? '', onChange: e => setSelectedBoardID(e.target.value || null), children: [!selectedBoardID && _jsx("option", { value: "", children: "\u2014 select board \u2014" }), k.boards.map(b => (_jsxs("option", { value: b.id, children: [b.name, b.archived ? ' (archived)' : ''] }, b.id)))] }), _jsx("button", { className: "bi-add-btn", onClick: () => setShowNewBoard(s => !s), children: "+ New Board" }), k.view?.board.description && (_jsx("p", { className: "bk-board-desc", children: k.view.board.description }))] }), _jsxs("div", { className: "bk-board-actions", children: [_jsx("button", { className: "bi-add-btn", onClick: () => setLayout(l => l === 'horizontal' ? 'vertical' : 'horizontal'), title: layout === 'horizontal' ? 'Switch to vertical (stacked) columns' : 'Switch to horizontal (side-by-side) columns', children: layout === 'horizontal' ? 'Vertical layout' : 'Horizontal layout' }), selectedBoardID && k.view && (_jsxs(_Fragment, { children: [_jsx("button", { className: "bi-add-btn", onClick: () => setShowNewColumn(s => !s), children: "+ Column" }), _jsx("button", { className: "bi-add-btn", onClick: async () => {
                                                    if (!confirm(`Delete board "${k.view.board.name}"? Cards remain in noteboard.`))
                                                        return;
                                                    const ok = await k.deleteBoard(k.view.board.id);
                                                    if (ok)
                                                        setSelectedBoardID(null);
                                                }, children: "Delete board" })] }))] })] }), showNewBoard && (_jsx(NewBoardForm, { onCreate: async (args) => {
                            const b = await k.createBoard(args);
                            if (b) {
                                setSelectedBoardID(b.id);
                                setShowNewBoard(false);
                            }
                        }, onCancel: () => setShowNewBoard(false) })), !selectedBoardID ? (k.boards.length === 0 && !k.loading
                        ? _jsx("div", { className: "bi-empty", children: "No boards. Create one to start." })
                        : _jsx("div", { className: "bi-empty", children: "Select a board." })) : !k.view ? (_jsx("div", { className: "bi-loading", children: "Loading\u2026" })) : (_jsxs(_Fragment, { children: [showNewColumn && (_jsx(NewColumnForm, { onCreate: async (args) => {
                                    const ok = await k.createColumn(args);
                                    if (ok)
                                        setShowNewColumn(false);
                                }, onCancel: () => setShowNewColumn(false) })), axes.length > 0 && (_jsx(CardAxisToolbar, { axes: axes, filter: axisFilter, onFilterChange: setAxisFilter, sortKey: sortKey, onSortChange: setSortKey, hiddenCardCount: hiddenCardCount })), _jsx("div", { className: `bk-columns bk-columns-${layout}`, children: visibleColumns.map(cv => (_jsx(ColumnPane, { cv: cv, onLoadMore: () => k.loadMoreCards(cv.column.id, CARDS_PER_COLUMN), signalsByTodo: signalsByTodo, boardColumns: k.view.columns.map(c => c.column), collapsed: collapsedColumns.has(cv.column.id), onToggleCollapse: () => toggleColumnCollapsed(cv.column.id), onCompose: () => setComposeColumn(cv.column.id), composeOpen: composeColumn === cv.column.id, onCancelCompose: () => setComposeColumn(null), onCreateCard: async (args) => {
                                        const ok = await k.createCard({ ...args, column_id: cv.column.id });
                                        if (ok)
                                            setComposeColumn(null);
                                    }, onMoveCard: (cardID, columnID) => k.moveCard(cardID, columnID), onOpenCard: (cardID) => setDrawerCardID(cardID), onOpenChat: openSessionLink, onStopCard: async (cardID) => {
                                        // Parking work nobody is doing yet is cheap and reversible, so
                                        // it just happens. Interrupting an agent mid-turn is not the
                                        // same act, and the card's own session link is what tells the
                                        // two apart — so only that case asks.
                                        const card = cv.cards?.find(c => c.placement.card_id === cardID);
                                        if (card && latestSessionLink(card)) {
                                            if (!confirm('This card has a running session. Stop will pause the agent mid-turn (resumable) and park the work. Continue?'))
                                                return false;
                                        }
                                        return k.stopCard(cardID);
                                    }, onPlayCard: (cardID) => k.playCard(cardID), onRunAgent: async (card) => {
                                        const item = card.item;
                                        const title = item?.title ?? card.placement.card_id;
                                        // The tile sends exactly what the drawer would: the saved
                                        // prompt, or the same suggestion the drawer would show. A
                                        // shortcut that dispatched something different from what
                                        // the card displays would be a trap.
                                        const stored = readAgentPrompt(item?.body);
                                        const prompt = stored ?? suggestAgentPrompt({
                                            cardID: card.placement.card_id,
                                            title,
                                            body: stripAgentPrompt(item?.body),
                                            linkedEmailCount: (card.links ?? []).filter(l => l.entity_type === 'email').length,
                                        });
                                        // An autonomous session auto-allows tool calls and spends
                                        // money, and this button sits on a tile next to two others.
                                        // One misclick should not silently start an agent, so the
                                        // confirmation names the card, says whether the prompt was
                                        // written or merely suggested, and warns about a second
                                        // agent when one is already attached.
                                        const existing = latestSessionLink(card);
                                        const lines = [
                                            `Start an agent on "${title}"?`,
                                            '',
                                            stored ? 'Using the prompt saved on this card.' : 'Using the suggested prompt (nothing saved on this card).',
                                        ];
                                        if (existing)
                                            lines.push('', 'This card already has a session. This adds a second one.');
                                        lines.push('', '--- prompt ---', prompt.length > 600 ? prompt.slice(0, 600) + '…' : prompt);
                                        if (!window.confirm(lines.join('\n')))
                                            return false;
                                        try {
                                            const sessionID = await dispatchAgentOnCard({
                                                basePath: bridgeBasePath,
                                                fetchFn: fetchFn,
                                                title,
                                                prompt,
                                                addLink: (et, er, label) => k.addCardLink(card.placement.card_id, et, er, label),
                                            });
                                            navigate(`${routes.chat}?session=${encodeURIComponent(sessionID)}`);
                                            return true;
                                        }
                                        catch (e) {
                                            // No toast surface on this page, and a dispatch that
                                            // failed must not look like one that worked.
                                            window.alert(`Could not start an agent: ${e instanceof Error ? e.message : String(e)}`);
                                            return false;
                                        }
                                    }, onDeleteColumn: async () => {
                                        // Count from the real board, not the filtered copy: deleting
                                        // a column detaches every card in it, including the ones the
                                        // active filter is hiding, and a count that only reflects
                                        // what is on screen would understate what is about to happen.
                                        const actual = k.view.columns.find(c => c.column.id === cv.column.id)?.cards?.length ?? 0;
                                        if (actual > 0) {
                                            if (!confirm(`Column "${cv.column.name}" has ${actual} cards. Delete column AND detach those cards?`))
                                                return;
                                        }
                                        await k.deleteColumn(cv.column.id);
                                    } }, cv.column.id))) }), k.view.orphans && k.view.orphans.length > 0 && (_jsxs("div", { className: "bk-orphans", children: [_jsxs("h3", { children: ["Orphaned placements (", k.view.orphans.length, ")"] }), _jsx("p", { className: "bk-orphan-note", children: "These placements are still on the board but their noteboard items were deleted, so there is nothing left to show. A reversible delete leaves the placement behind on purpose \u2014 restoring the item has to be able to put it back here \u2014 which is why they accumulate." }), k.view.orphans.map(o => (_jsxs("div", { className: "bk-orphan-row", children: [_jsx("code", { children: o.placement.card_id }), _jsx("button", { className: "bi-add-btn", title: "Remove this empty placement from the board", onClick: () => k.detachCard(k.view.board.id, o.placement.card_id), children: "Detach" })] }, o.placement.card_id)))] }))] }))] }), drawerCard && k.view && (_jsx(CardDrawer, { card: drawerCard, boardID: k.view.board.id, entityTypes: k.entityTypes, onClose: () => setDrawerCardID(null), onPatch: (patch) => k.patchCard(drawerCard.placement.card_id, patch), onDetach: async () => {
                    const ok = await k.detachCard(k.view.board.id, drawerCard.placement.card_id);
                    if (ok)
                        setDrawerCardID(null);
                }, onArchive: async () => {
                    const ok = await k.archiveCard(drawerCard.placement.card_id);
                    if (ok)
                        setDrawerCardID(null);
                }, onDelete: async (hard) => {
                    const ok = await k.deleteCard(drawerCard.placement.card_id, hard);
                    if (ok)
                        setDrawerCardID(null);
                }, onAddLink: (et, er, label) => k.addCardLink(drawerCard.placement.card_id, et, er, label), onDeleteLink: (linkID) => k.deleteCardLink(linkID), onOpenChat: openSessionLink, onOpenInMail: openEmailInMail, mailBasePath: mailBasePath, fetchFn: fetchFn }))] }));
}
// ============================ Sub-components ============================
/**
 * Filter and sort controls for the card axes a board actually uses.
 *
 * Both are view state — neither writes to the board — so this is safe to leave
 * on while the classifier keeps filing in the background.
 */
function CardAxisToolbar({ axes, filter, onFilterChange, sortKey, onSortChange, hiddenCardCount, }) {
    const toggle = (prefix, value) => {
        const current = filter[prefix] ?? [];
        const next = current.includes(value)
            ? current.filter(v => v !== value)
            : [...current, value];
        onFilterChange({ ...filter, [prefix]: next });
    };
    return (_jsxs("div", { className: "bk-axis-toolbar", children: [axes.map(({ axis, values }) => (_jsxs("div", { className: "bk-axis-group", children: [_jsx("span", { className: "bk-axis-label", children: axis.label }), values.map(({ value, count }) => {
                        const on = (filter[axis.prefix] ?? []).includes(value);
                        return (_jsxs("button", { type: "button", className: `bk-axis-chip${on ? ' bk-axis-chip-on' : ''}`, onClick: () => toggle(axis.prefix, value), title: `${count} card${count === 1 ? '' : 's'}`, children: [value, " ", _jsx("span", { className: "bk-axis-count", children: count })] }, value));
                    })] }, axis.prefix))), _jsxs("div", { className: "bk-axis-group", children: [_jsx("span", { className: "bk-axis-label", children: "Sort" }), _jsxs("select", { value: sortKey, onChange: e => onSortChange(e.target.value), children: [_jsx("option", { value: "priority", children: "Priority, then due date" }), _jsx("option", { value: "urgency", children: "Urgency" }), _jsx("option", { value: "newest", children: "Recently updated" }), _jsx("option", { value: "title", children: "Title" }), _jsx("option", { value: "stored", children: "Board order" })] })] }), filterIsActive(filter) && (_jsx("div", { className: "bk-axis-group", children: _jsxs("button", { type: "button", className: "bi-add-btn", onClick: () => onFilterChange({}), children: ["Clear filter", hiddenCardCount > 0 ? ` (${hiddenCardCount} hidden)` : ''] }) }))] }));
}
/**
 * Structured editors for a card's axis tags.
 *
 * The drawer already has a free-text tag box, and it stays: it is the only way
 * to touch tags that are not axes. These selects exist because reclassifying by
 * retyping "cat:commerce, action:decide, urgency:high" invites typos that
 * silently drop a card out of every filter.
 */
function CardAxisEditor({ tags, onChange, }) {
    return (_jsx("div", { className: "bk-axis-editor", children: CARD_AXES.map(axis => {
            const current = tags.find(t => t.startsWith(axis.prefix))?.slice(axis.prefix.length) ?? '';
            // A value the classifier wrote outside the vocabulary is offered as an
            // extra option rather than silently reset to blank by the select.
            const options = current && !axis.values.includes(current)
                ? [...axis.values, current]
                : axis.values;
            return (_jsxs("div", { children: [_jsx("label", { className: "bk-drawer-label", children: axis.label }), _jsxs("select", { value: current, onChange: e => onChange(withAxisValue(tags, axis.prefix, e.target.value)), children: [_jsx("option", { value: "", children: "\u2014 unset \u2014" }), options.map(v => _jsx("option", { value: v, children: v }, v))] })] }, axis.prefix));
        }) }));
}
function NewBoardForm({ onCreate, onCancel, }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    return (_jsxs("form", { className: "bk-new-form", onSubmit: e => { e.preventDefault(); if (name.trim())
            onCreate({ name: name.trim(), description: description.trim() || undefined }); }, children: [_jsx("input", { autoFocus: true, placeholder: "Board name", value: name, onChange: e => setName(e.target.value) }), _jsx("input", { placeholder: "Description (optional)", value: description, onChange: e => setDescription(e.target.value) }), _jsxs("div", { className: "bk-form-actions", children: [_jsx("button", { type: "submit", className: "bi-save-btn", children: "Create" }), _jsx("button", { type: "button", onClick: onCancel, children: "Cancel" })] })] }));
}
function NewColumnForm({ onCreate, onCancel, }) {
    const [name, setName] = useState('');
    const [wip, setWip] = useState('');
    const [autoStatus, setAutoStatus] = useState('');
    return (_jsxs("form", { className: "bk-new-form", onSubmit: e => {
            e.preventDefault();
            if (!name.trim())
                return;
            onCreate({
                name: name.trim(),
                wip_limit: wip ? Number(wip) : undefined,
                auto_status: autoStatus || undefined,
            });
        }, children: [_jsx("input", { autoFocus: true, placeholder: "Column name", value: name, onChange: e => setName(e.target.value) }), _jsx("input", { placeholder: "WIP limit (optional)", type: "number", min: 1, value: wip, onChange: e => setWip(e.target.value) }), _jsxs("select", { value: autoStatus, onChange: e => setAutoStatus(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 no auto-status \u2014" }), _jsx("option", { value: "open", children: "open" }), _jsx("option", { value: "done", children: "done" }), _jsx("option", { value: "archived", children: "archived" })] }), _jsxs("div", { className: "bk-form-actions", children: [_jsx("button", { type: "submit", className: "bi-save-btn", children: "Add column" }), _jsx("button", { type: "button", onClick: onCancel, children: "Cancel" })] })] }));
}
function ColumnPane({ cv, signalsByTodo, boardColumns, collapsed, onToggleCollapse, onLoadMore, onCompose, composeOpen, onCancelCompose, onCreateCard, onMoveCard, onOpenCard, onOpenChat, onStopCard, onPlayCard, onRunAgent, onDeleteColumn, }) {
    const cards = cv.cards ?? [];
    const wip = cv.column.wip_limit;
    // Against the column's real size, not the page's: a column of 200 with 25
    // loaded is over a WIP limit of 50, and saying otherwise would be the page
    // reporting on itself.
    const overWIP = wip != null && cv.total > wip;
    const hidden = Math.max(0, cv.total - cards.length);
    const className = [
        'bk-column',
        overWIP ? 'bk-column-over-wip' : '',
        collapsed ? 'bk-column-collapsed' : '',
    ].filter(Boolean).join(' ');
    return (_jsxs("section", { className: className, children: [_jsxs("header", { className: "bk-column-head", style: cv.column.color ? { borderTopColor: cv.column.color } : undefined, children: [_jsxs("div", { className: "bk-column-title", children: [_jsx("button", { className: "bk-column-collapse-btn", onClick: onToggleCollapse, title: collapsed ? 'Expand column' : 'Collapse column', "aria-label": collapsed ? 'Expand column' : 'Collapse column', children: collapsed ? '▸' : '▾' }), _jsx("strong", { children: cv.column.name }), _jsxs("span", { className: "bk-column-count", title: hidden > 0 ? `${hidden} more not loaded` : undefined, children: [hidden > 0 ? `${cards.length} of ${cv.total}` : cards.length, wip != null ? ` / ${wip}` : ''] })] }), !collapsed && (_jsxs("div", { className: "bk-column-actions", children: [_jsx("button", { className: "bi-add-btn", onClick: onCompose, children: "+" }), _jsx("button", { className: "bi-add-btn", onClick: onDeleteColumn, title: "Delete column", children: "\u00D7" })] })), cv.column.auto_status && !collapsed && (_jsxs("div", { className: "bk-column-meta", children: ["auto-status: ", cv.column.auto_status] }))] }), !collapsed && composeOpen && (_jsx(NewCardForm, { onCreate: onCreateCard, onCancel: onCancelCompose })), !collapsed && (_jsxs("div", { className: "bk-card-list", children: [cards.map(c => (_jsx(CardTile, { card: c, signals: signalsByTodo.get(c.placement.card_id) ?? [], currentColumn: cv.column.id, boardColumns: boardColumns, onMove: onMoveCard, onOpen: () => onOpenCard(c.placement.card_id), onOpenChat: onOpenChat, onStop: onStopCard, onPlay: onPlayCard, onRunAgent: onRunAgent }, c.placement.card_id))), cards.length === 0 && (_jsx("div", { className: "bk-card-empty", children: "no cards" })), hidden > 0 && (_jsxs("div", { className: "bk-column-more", children: [_jsxs("button", { type: "button", className: "bi-add-btn", onClick: onLoadMore, children: ["Show ", Math.min(hidden, 25), " more"] }), _jsxs("span", { className: "bk-column-more-note", children: [hidden, " more \u2014 sorting applies to the ", cards.length, " loaded"] })] }))] }))] }));
}
function NewCardForm({ onCreate, onCancel, }) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [tags, setTags] = useState('');
    const [hold, setHold] = useState(false);
    const [ceiling, setCeiling] = useState('');
    return (_jsxs("form", { className: "bk-new-form bk-new-card", onSubmit: e => {
            e.preventDefault();
            if (!title.trim())
                return;
            // An empty box is NO ceiling, not a ceiling of zero — and a ceiling of
            // zero is a real thing ("stop before spending a cent"). parseFloat('')
            // is NaN, so the empty case is filtered out explicitly rather than
            // being allowed to fall through as 0.
            const parsed = parseFloat(ceiling);
            const auto_hold_at_usd = ceiling.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
            onCreate({
                title: title.trim(),
                body: body.trim() || undefined,
                tags: tags.split(',').map(s => s.trim()).filter(Boolean),
                hold: hold || undefined,
                hold_reason: hold ? 'created held' : undefined,
                auto_hold_at_usd,
            });
        }, children: [_jsx("input", { autoFocus: true, placeholder: "Card title", value: title, onChange: e => setTitle(e.target.value) }), _jsx("textarea", { placeholder: "Body (markdown, optional)", rows: 3, value: body, onChange: e => setBody(e.target.value) }), _jsx("input", { placeholder: "tags (comma-separated)", value: tags, onChange: e => setTags(e.target.value) }), _jsxs("label", { className: "bk-form-check", title: "Create this card parked: no agent will pick it up until you press play.", children: [_jsx("input", { type: "checkbox", checked: hold, onChange: e => setHold(e.target.checked) }), "Start held (agents can't pick this up)"] }), _jsx("input", { type: "number", min: "0", step: "0.50", placeholder: "Auto-hold at $ (optional \u2014 blank = no limit)", value: ceiling, onChange: e => setCeiling(e.target.value), title: "Once this card's agent sessions have cost this much in total, it is held automatically. Each session is also capped at whatever is left." }), _jsxs("div", { className: "bk-form-actions", children: [_jsx("button", { type: "submit", className: "bi-save-btn", children: "Add card" }), _jsx("button", { type: "button", onClick: onCancel, children: "Cancel" })] })] }));
}
/** What a card says when a session working this todo has raised something.
 *
 * A question and a notification are different demands and get different words:
 * a question is blocking a session that cannot proceed without an answer, a
 * notification is an FYI nobody has read yet. When both are open the question
 * is what the card leads with — it is the one costing time right now.
 *
 * The named one is the newest, matching the order every other signal surface
 * reads in. The count is what says there are more.
 *
 * The badge states the problem and does not offer to solve it. Answering
 * happens where the signal has a resolve verb: the chat, the inbox, or the
 * RefChip panel. Putting an inert answer box on a board card would promise a
 * resolution the board cannot deliver. */
function SignalBadge({ signals }) {
    if (signals.length === 0)
        return null;
    const questions = signals.filter(s => s.kind === SignalKindQuestion);
    const leading = questions[0] ?? signals[0];
    const label = questions.length > 0
        ? (questions.length > 1 ? `❓ ${questions.length} open questions` : '❓ open question')
        : (signals.length > 1 ? `📣 ${signals.length} unread notifications` : '📣 unread notification');
    return (_jsxs("div", { className: `bk-card-signal bk-card-signal-${leading.kind}`, title: leading.title, children: [_jsx("span", { className: "bk-card-signal-label", children: label }), _jsx("span", { className: "bk-card-signal-title", children: leading.title })] }));
}
// latestLinkedActivity finds the most recent of those, from links the board
// view already carries.
//
// Only 'email' and 'session' count. 'email_msgid' is the same arrival recorded
// under its RFC identity and would double-count it, and 'email_sender' is a
// learned affinity between a sender and a card rather than an event.
function latestLinkedActivity(card) {
    let newest = null;
    for (const l of card.links ?? []) {
        if (l.entity_type !== 'email' && l.entity_type !== 'session')
            continue;
        const rank = new Date(l.created_at).getTime();
        if (!Number.isFinite(rank))
            continue;
        if (!newest || rank > newest.rank) {
            newest = { at: l.created_at, kind: l.entity_type, rank };
        }
    }
    return newest ? { at: newest.at, kind: newest.kind } : null;
}
// CardAgeBadge answers "when did anything last happen here?".
//
// It reports time since the last linked email or dispatch, not time since the
// card was created. Creation age says how long ago a bucket was opened, which
// stops being interesting immediately — a card opened in May that took mail an
// hour ago is live, and one opened yesterday that has been silent since is not.
// Creation time stays in the tooltip, where it is context rather than the
// headline.
//
// It deliberately does NOT show time since the agent last did something inside
// its session. That lives on the session, not the link, and reading it means
// asking llm-bridge-server per session. The Agent runs board holds 6,466 cards
// across 5,628 distinct sessions, so on a 15-second poll that is thousands of
// requests a minute to render a caption. The drawer shows it for one card.
function CardAgeBadge({ card, placement, }) {
    const activity = latestLinkedActivity(card);
    // With no links at all there is no activity to report, so the card falls back
    // to saying how long it has been sitting there — which is the honest answer.
    const shown = activity
        ? formatAgeCompact(activity.at)
        : formatAgeCompact(placement.created_at);
    if (!shown)
        return null;
    const title = [
        activity
            ? `Last ${activity.kind === 'email' ? 'email attached' : 'handed to an agent'}: ${new Date(activity.at).toLocaleString()}`
            : 'Nothing has happened on this card yet',
        `On this board since ${new Date(placement.created_at).toLocaleString()}`,
    ].join('\n');
    return (_jsxs("span", { className: "bk-card-age", title: title, children: [activity ? (activity.kind === 'email' ? '✉' : '▶') : '🕒', " ", shown] }));
}
function CardTile({ card, signals, currentColumn, boardColumns, onMove, onOpen, onOpenChat, onStop, onPlay, onRunAgent, }) {
    // Guards the button between click and session id, so an impatient second
    // click cannot start a second agent on the same card.
    const [running, setRunning] = useState(false);
    const item = card.item;
    if (!item) {
        return (_jsxs("div", { className: "bk-card bk-card-orphan", onClick: onOpen, children: [_jsx("em", { children: "missing noteboard item" }), _jsx("small", { children: card.placement.card_id })] }));
    }
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const status = item.status;
    const session = latestSessionLink(card);
    // The gate is a property of the work, not of the column it sits in — so the
    // button renders on every card in every column, not just in a gate column.
    const held = !!item.held_at;
    const ceiling = typeof item.auto_hold_at_usd === 'number' ? item.auto_hold_at_usd : null;
    return (_jsxs("div", { className: `bk-card${held ? ' bk-card-held' : ''}`, onClick: onOpen, children: [_jsx("div", { className: "bk-card-title", children: item.title }), ceiling !== null && (_jsxs("div", { className: "bk-card-ceiling", title: `Auto-holds once this card's sessions have cost $${ceiling.toFixed(2)} in total. Each session is capped at whatever is left of that.`, children: ["\u26FD auto-hold at $", ceiling.toFixed(2)] })), held && (_jsxs("div", { className: "bk-card-hold", title: item.hold_reason || 'No reason given', children: ["\u23F8 held \u2014 no agent will pick this up", item.hold_reason ? `: ${item.hold_reason}` : ''] })), _jsx(SignalBadge, { signals: signals }), tags.length > 0 && (_jsx("div", { className: "bk-card-tags", children: tags.map(t => _jsx("span", { className: "bk-tag", children: t }, t)) })), _jsxs("div", { className: "bk-card-foot", children: [_jsx("span", { className: `bk-status bk-status-${status}`, children: status }), hasClockData(card.time) && _jsx(CardBudgetBadge, { time: card.time }), (card.time?.event_count ?? 0) === 0 && (_jsx(CardAgeBadge, { card: card, placement: card.placement })), _jsx("button", { type: "button", className: held ? 'bk-card-play' : 'bk-card-stop', title: held
                            ? 'Play — clear the hold so agents may work this, and resume its session if it was paused'
                            : 'Stop — park this work so no agent picks it up, and pause any session already running it', onClick: e => {
                            e.stopPropagation();
                            held ? onPlay(card.placement.card_id) : onStop(card.placement.card_id);
                        }, children: held ? '▶' : '⏸' }), _jsx("button", { type: "button", className: "bk-card-run", disabled: held || running, title: held
                            ? 'Held — clear the hold before starting an agent'
                            : session
                                ? 'Start another agent on this card. It already has one.'
                                : 'Start an agent on this card, using its prompt', onClick: async (e) => {
                            e.stopPropagation();
                            setRunning(true);
                            try {
                                await onRunAgent(card);
                            }
                            finally {
                                setRunning(false);
                            }
                        }, children: running ? '…' : '🤖' }), session && (_jsx("button", { type: "button", className: "bk-card-chat", title: `Open chat session ${session.ref}`, onClick: e => { e.stopPropagation(); onOpenChat(session); }, children: "chat \u2197" })), _jsx("select", { value: currentColumn, onClick: e => e.stopPropagation(), onChange: e => onMove(card.placement.card_id, e.target.value), title: "Move to column", children: boardColumns.map(c => (_jsx("option", { value: c.id, children: c.name }, c.id))) })] })] }));
}
// CardTiming is the drawer's answer to "how long has this been going?".
//
// Unlike the badge on the tile, this one may ask llm-bridge-server for the
// session's real last activity, because the drawer shows one card at a time.
// The same question asked from the board would be thousands of requests per
// poll; asked here it is one, on open.
function CardTiming({ card, fetchFn, }) {
    const placement = card.placement;
    const session = latestSessionLink(card);
    const { basePath } = useBridgeConfig();
    const [lastActivity, setLastActivity] = useState(null);
    const [state, setState] = useState(null);
    // Distinguishes "we have not asked yet" from "we asked and the bridge could
    // not say". Without it a failed lookup renders identically to a pending one
    // and the row just never fills in.
    const [unavailable, setUnavailable] = useState(false);
    useEffect(() => {
        if (!session)
            return;
        let cancelled = false;
        setUnavailable(false);
        setLastActivity(null);
        setState(null);
        fetchFn(`${basePath}/sessions/${encodeURIComponent(session.ref)}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(s => {
            if (cancelled)
                return;
            setLastActivity(typeof s?.updated_at === 'string' ? s.updated_at : null);
            setState(typeof s?.state === 'string' ? s.state : null);
        })
            .catch(() => { if (!cancelled)
            setUnavailable(true); });
        return () => { cancelled = true; };
    }, [session?.ref, basePath, fetchFn]);
    const boardAge = formatAgeCompact(placement.created_at);
    const dispatchAge = session ? formatAgeCompact(session.dispatchedAt) : null;
    const activityAge = lastActivity ? formatAgeCompact(lastActivity) : null;
    const activity = latestLinkedActivity(card);
    const activityAgeFromLink = activity ? formatAgeCompact(activity.at) : null;
    return (_jsxs("dl", { className: "bk-drawer-timing", children: [_jsxs("div", { children: [_jsx("dt", { children: activity?.kind === 'email' ? 'Last email' : activity ? 'Last dispatch' : 'Last activity' }), _jsx("dd", { title: activity ? new Date(activity.at).toLocaleString() : undefined, children: activityAgeFromLink ?? 'never' })] }), _jsxs("div", { children: [_jsx("dt", { children: "On this board" }), _jsx("dd", { title: new Date(placement.created_at).toLocaleString(), children: boardAge ?? '—' })] }), session && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("dt", { children: "Given to an agent" }), _jsx("dd", { title: new Date(session.dispatchedAt).toLocaleString(), children: dispatchAge ?? '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: "Last agent activity" }), _jsx("dd", { title: lastActivity ? new Date(lastActivity).toLocaleString() : undefined, children: activityAge
                                    ? `${activityAge}${state ? ` · ${state}` : ''}`
                                    : unavailable
                                        ? 'bridge did not answer'
                                        : '…' })] })] }))] }));
}
// AgentPromptPanel is the card's "hand this to an agent" control: the prompt it
// will be given, editable in place, and the button that starts it.
//
// The prompt shown when a card carries none is a suggestion, not a saved value —
// it renders in the box but is not written to the card until the drawer is
// saved. Writing it on open would put an agent prompt on every card anyone
// merely looked at.
function AgentPromptPanel({ cardID, title, body, linkedEmailCount, prompt, onPromptChange, existingSession, onAddLink, onOpenChat, fetchFn, }) {
    const { basePath } = useBridgeConfig();
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState(null);
    const suggestion = useMemo(() => suggestAgentPrompt({ cardID, title, body, linkedEmailCount }), [cardID, title, body, linkedEmailCount]);
    // What the box shows, and — importantly — what a dispatch would actually send.
    // These must be the same string, or the agent gets something the human never
    // read.
    const effective = prompt.trim() ? prompt : suggestion;
    const usingSuggestion = !prompt.trim();
    const start = async () => {
        setStarting(true);
        setError(null);
        try {
            const sessionID = await dispatchAgentOnCard({
                basePath, fetchFn, title, prompt: effective, addLink: onAddLink,
            });
            onOpenChat({ ref: sessionID, dispatchedAt: new Date().toISOString() });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setStarting(false);
        }
    };
    return (_jsxs("section", { className: "bk-agent-prompt", children: [_jsxs("div", { className: "bk-agent-prompt-head", children: [_jsx("label", { className: "bk-drawer-label", children: "Agent prompt" }), usingSuggestion && _jsx("span", { className: "bk-agent-prompt-note", children: "suggested \u2014 edit and save to keep" })] }), _jsx("textarea", { className: "bk-agent-prompt-text", rows: 10, value: effective, onChange: e => onPromptChange(e.target.value) }), _jsxs("div", { className: "bk-agent-prompt-actions", children: [_jsx("button", { type: "button", className: "bi-add-btn", disabled: starting || !effective.trim(), onClick: start, children: starting ? 'Starting…' : '▶ Start an agent on this' }), prompt.trim() && (_jsx("button", { type: "button", className: "bk-agent-prompt-reset", disabled: starting, onClick: () => onPromptChange(''), title: "Drop the saved prompt and go back to the suggested one. Takes effect on save.", children: "reset to suggested" })), existingSession && (_jsx("button", { type: "button", className: "bk-agent-prompt-reset", onClick: () => onOpenChat(existingSession), title: `This card already has session ${existingSession.ref}. Starting another adds a second one.`, children: "open current session \u2197" }))] }), existingSession && (_jsx("p", { className: "bk-agent-prompt-warn", children: "An agent already has this card. Starting another gives it a second session." })), error && _jsx("div", { className: "bridge-error", children: error })] }));
}
/** Every open signal raised against this card's todo, read and closed in the
 * drawer.
 *
 * This is the fourth surface `SignalCard` mounts on, and the one the `kanban`
 * surface was minted for: an autonomous worker's signal has carried
 * `surface:"kanban"` since the record existed, and until now nothing rendered
 * it anywhere it could be answered.
 *
 * A card id IS a noteboard item id, so the drawer knows its todo without a
 * lookup. It reads its own rows rather than indexing the board-wide map behind
 * `SignalBadge` — the badge and this are different things at different depths,
 * and the badge stays exactly as it is.
 *
 * Renders nothing at all when there is nothing open, including against a
 * bridge-server with no signals route: a drawer is a card editor first, and
 * every board would otherwise open onto an error until the gateway carries the
 * route. */
function CardSignals({ todoID }) {
    const signals = useOpenSignalsForTodo(todoID);
    if (signals.length === 0)
        return null;
    return (_jsxs("section", { className: "bk-drawer-signals", children: [_jsx("h4", { children: "Needs you" }), groupSignalsByRequest(signals).map(request => (_jsx(SignalRequestCard, { request: request, 
                // A worker's blocker can be answered here, or closed unanswered —
                // but never acknowledged. SignalCard offers Acknowledge for
                // notifications only, and the server refuses it for a question, so
                // an unanswered blocker can never read as handled.
                //
                // "Closed unanswered" was false until this flag started reaching
                // TOOL-raised blockers too. The button was gated on the signal
                // having no request id, so a worker that asked through
                // AskUserQuestion and then stopped left a card whose only control
                // was Decline — a deny addressed to a hook nobody was holding any
                // more. Nothing on the board could close it.
                allowDismissWithoutAnswer: true }, request.requestId || request.signals[0].id)))] }));
}
export function CardDetail({ card, boardID: _boardID, entityTypes, onClose, onPatch, onDetach, onArchive, onDelete, onAddLink, onDeleteLink, onOpenChat, onOpenInMail, mailBasePath, fetchFn, headerAction, }) {
    const item = card.item;
    const [title, setTitle] = useState(item?.title ?? '');
    // The prompt block is split out of the body here and recombined on save, so
    // the body box shows what the card says and the prompt box shows what the
    // agent is told. Left merged, every card body would open with a wall of
    // instructions aimed at an agent rather than at the reader.
    const [body, setBody] = useState(stripAgentPrompt(item?.body));
    const [agentPrompt, setAgentPrompt] = useState(readAgentPrompt(item?.body) ?? '');
    const [tags, setTags] = useState((item?.tags ?? []).join(', '));
    const [status, setStatus] = useState(item?.status ?? 'open');
    const [dirty, setDirty] = useState(false);
    const [showAllEmails, setShowAllEmails] = useState(false);
    // Escape closes the drawer. Until the stacking fix above it was the only way
    // out that could not misfire, and it stays because a modal that traps you
    // until you find the backdrop is a modal people stop opening.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    // Re-seed when the underlying card changes (e.g. after a refresh)
    useEffect(() => {
        setTitle(item?.title ?? '');
        setBody(stripAgentPrompt(item?.body));
        setAgentPrompt(readAgentPrompt(item?.body) ?? '');
        setTags((item?.tags ?? []).join(', '));
        setStatus(item?.status ?? 'open');
        setDirty(false);
        setShowAllEmails(false);
    }, [item?.id, item?.updated_at]);
    const links = card.links ?? [];
    const tagList = tags.split(',').map(s => s.trim()).filter(Boolean);
    // email_msgid and email_sender links are bookkeeping the classifier reads, not
    // something to show a human, so only the addressable email links are listed.
    const emailLinks = links.filter(l => l.entity_type === 'email');
    const otherLinks = links.filter(l => l.entity_type !== 'email');
    const shownEmailLinks = showAllEmails ? emailLinks : emailLinks.slice(0, EMAIL_LINKS_SHOWN);
    const save = async () => {
        const patch = {
            title,
            body: writeAgentPrompt(body, agentPrompt),
            status,
            tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        };
        const ok = await onPatch(patch);
        if (ok)
            setDirty(false);
    };
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "bk-drawer-head", children: [_jsx("h3", { children: "Card" }), headerAction, _jsx("button", { onClick: onClose, className: "bi-add-btn", children: "\u00D7" })] }), _jsx(CardTiming, { card: card, fetchFn: fetchFn }), item && (_jsx(AgentPromptPanel, { cardID: card.placement.card_id, title: title, body: body, linkedEmailCount: emailLinks.length, prompt: agentPrompt, onPromptChange: next => { setAgentPrompt(next); setDirty(true); }, existingSession: latestSessionLink(card), onAddLink: onAddLink, onOpenChat: onOpenChat, fetchFn: fetchFn })), !item ? (_jsxs("div", { className: "bridge-error", children: ["noteboard item is missing for placement ", card.placement.card_id] })) : (_jsxs(_Fragment, { children: [_jsx(CardSignals, { todoID: card.placement.card_id }), _jsx("label", { className: "bk-drawer-label", children: "Title" }), _jsx("input", { value: title, onChange: e => { setTitle(e.target.value); setDirty(true); } }), _jsx("label", { className: "bk-drawer-label", children: "Body (markdown)" }), _jsx("textarea", { rows: 8, value: body, onChange: e => { setBody(e.target.value); setDirty(true); } }), _jsxs("div", { className: "bk-drawer-row", children: [_jsxs("div", { children: [_jsx("label", { className: "bk-drawer-label", children: "Status" }), _jsxs("select", { value: status, onChange: e => { setStatus(e.target.value); setDirty(true); }, children: [_jsx("option", { value: "open", children: "open" }), _jsx("option", { value: "done", children: "done" }), _jsx("option", { value: "archived", children: "archived" })] })] }), _jsxs("div", { className: "bk-drawer-grow", children: [_jsx("label", { className: "bk-drawer-label", children: "Tags" }), _jsx("input", { value: tags, onChange: e => { setTags(e.target.value); setDirty(true); }, placeholder: "comma-separated" })] })] }), tagList.some(t => CARD_AXES.some(a => t.startsWith(a.prefix))) && (_jsx(CardAxisEditor, { tags: tagList, onChange: next => { setTags(next.join(', ')); setDirty(true); } })), _jsxs("div", { className: "bk-form-actions", children: [_jsx("button", { className: "bi-save-btn", disabled: !dirty, onClick: save, children: "Save" }), card.placement.board_id && (_jsx("button", { onClick: onDetach, title: "Take this card off the board. The todo stays in noteboard.", children: "Remove from board" })), _jsx("button", { onClick: onArchive, title: "Mark the work archived. It stays in noteboard and can be restored.", children: "Archive" }), _jsx("button", { onClick: () => {
                                    if (confirm('Delete the todo from noteboard?\n\nThe work itself goes away, not just this card. It can be restored from noteboard, and until then the card stays on this board as an orphan.\n\nTo take the card off the board without deleting the todo, use "Remove from board".')) {
                                        onDelete(false);
                                    }
                                }, children: "Delete todo" }), _jsx("button", { onClick: () => { if (confirm('Hard delete card from noteboard? Cannot be undone.'))
                                    onDelete(true); }, children: "Hard delete" })] }), _jsx("hr", {}), _jsx("h4", { children: "History" }), _jsx(CardTimelinePanel, { cardID: card.placement.card_id, boardID: card.placement.board_id || undefined }), _jsx("hr", {}), emailLinks.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("h4", { children: ["Linked emails (", emailLinks.length, ")"] }), _jsxs("ul", { className: "bk-link-list", children: [shownEmailLinks.map(l => (_jsx(LinkedEmailRow, { link: l, mailBasePath: mailBasePath, fetchFn: fetchFn, onOpenInMail: onOpenInMail, onDeleteLink: onDeleteLink }, l.id))), emailLinks.length > shownEmailLinks.length && (_jsx("li", { children: _jsxs("button", { type: "button", className: "bi-add-btn", onClick: () => setShowAllEmails(true), children: ["Show ", emailLinks.length - shownEmailLinks.length, " more"] }) }))] })] })), _jsx("h4", { children: "Entity links" }), _jsxs("ul", { className: "bk-link-list", children: [otherLinks.map(l => (_jsx(EntityLinkRow, { link: l, onOpenChat: onOpenChat, onDeleteLink: onDeleteLink }, l.id))), otherLinks.length === 0 && _jsx("li", { className: "bi-empty", children: "No links yet." })] }), _jsx(AddLinkForm, { entityTypes: entityTypes, onAdd: onAddLink })] }))] }));
}
/**
 * One linked email: its label, a deep link into the Mail page, and an expandable
 * preview of the message itself.
 *
 * The preview renders `body_text` as PLAIN TEXT, never `body_html`. Mail bodies
 * are attacker-controlled — anyone who can email this user can put markup in
 * them — and dash's Mail page only renders them safely because it uses a
 * sandboxed iframe with remote images stripped. Rebuilding that here would mean
 * maintaining a second sandbox; the deep link hands the job to the one that
 * already exists.
 *
 * The fetch is deliberate, not eager: mailstack caches nothing, so reading one
 * message is a live provider round trip. A bucket card can carry hundreds of
 * links, and expanding them all on open would be hundreds of Gmail calls.
 */
/**
 * One row in a card's "Entity links" list.
 *
 * Every link used to render as `<type> <raw uuid>`, with a click-through on
 * `session` alone. A card is linked to the sessions, subagent runs and todos
 * that did its work — all three ARE linkable today, via `session` and via
 * `note`, which resolves noteboard's `/api/items` and therefore covers todos —
 * but a todo showed as 36 characters of hex naming nothing. Measured on this
 * host: zero `note` links existed, which is what an unusable affordance looks
 * like from the data side.
 *
 * A `note` ref now resolves to its title and links to the host's notes page.
 * The resolution is `fetchNoteboardItemRef`, the same call the chat's reference chips
 * make — reused rather than re-derived, so a todo reads identically wherever it
 * is referenced.
 *
 * ⚠️ Resolution is per row and only for `note`. That is affordable HERE and
 * would not be in a virtualized list: a drawer shows one card with a handful of
 * links, where a transcript pane would issue one request per rendered row on
 * every scroll. Do not lift this into a list without changing how it fetches.
 *
 * A ref that will not resolve — a deleted todo, a hand-typed id — keeps its raw
 * value rather than disappearing or reading as an error. The link is still a
 * true record that someone attached that id; only the title is unknown.
 */
/**
 * The card drawer: `CardDetail` plus the overlay chrome that makes it a drawer.
 *
 * The split exists because the same content is now reachable two ways — as this
 * overlay on the board, and as a page of its own at the host's card route. Only
 * the chrome differs, so only the chrome is duplicated: a page rendering this
 * component would have drawn a modal floating over an empty document, and a
 * `variant` prop toggling the backdrop would have put two layouts inside one
 * component to avoid moving three lines.
 *
 * `CardDetail` keeps `.bk-drawer-head` and every other `bk-drawer-*` class, so
 * the stylesheet's descendant rules apply in both mounts and neither surface
 * ships CSS. The page supplies its own `.bk-drawer` wrapper for the same reason.
 */
function CardDrawer(props) {
    return (_jsx("div", { className: "bk-drawer-backdrop", onClick: props.onClose, children: _jsx("aside", { className: "bk-drawer", onClick: e => e.stopPropagation(), children: _jsx(CardDetail, { ...props, headerAction: _jsx(OpenCardPageLink, { cardID: props.card.placement.card_id }) }) }) }));
}
/** Link out to the host's standalone card page, when it mounts one. Absent
 *  rather than disabled on a host that does not (llmux) — an empty route is how
 *  a host says it has no such page. */
function OpenCardPageLink({ cardID }) {
    const { routes } = useBridgeConfig();
    if (!routes.card)
        return null;
    return (_jsx(Link, { className: "bk-link-ref-action", to: `${routes.card}/${encodeURIComponent(cardID)}`, title: "Open this card as a page", children: "open \u2197" }));
}
function EntityLinkRow({ link, onOpenChat, onDeleteLink, }) {
    const { routes, noteboardBasePath, fetch: fetchFn } = useBridgeConfig();
    const [title, setTitle] = useState(null);
    const isSessionLink = link.entity_type === 'session' && !!link.entity_ref;
    // A pull request, a commit or a remote repo is a real address. Resolving it
    // here rather than in kanban-store is deliberate: the store publishes an
    // entity-type registry and leaves resolution to whoever knows the service.
    const target = entityTarget(link.entity_type, link.entity_ref);
    // `note` is noteboard's whole item space, todos included — the registry entry
    // points at `/api/items`, not at a notes-only route.
    const isNoteLink = link.entity_type === 'note' && !!link.entity_ref;
    useEffect(() => {
        if (!isNoteLink || !noteboardBasePath)
            return;
        let cancelled = false;
        fetchNoteboardItemRef(fetchFn, noteboardBasePath, link.entity_ref)
            .then(ref => {
            if (!cancelled && ref?.title)
                setTitle(ref.title);
        })
            .catch(() => {
            // Unresolvable is a legible outcome — the raw ref stays on screen.
        });
        return () => {
            cancelled = true;
        };
    }, [isNoteLink, noteboardBasePath, fetchFn, link.entity_ref]);
    return (_jsxs("li", { children: [_jsx("span", { className: "bk-link-type", children: link.entity_type }), isSessionLink ? (_jsxs("button", { type: "button", className: "bk-link-ref bk-link-ref-action", title: `Open chat session ${link.entity_ref}`, onClick: () => onOpenChat({ ref: link.entity_ref, dispatchedAt: link.created_at }), children: [link.entity_ref, " \u2197"] })) : isNoteLink && routes.notes ? (_jsxs(Link, { className: "bk-link-ref bk-link-ref-action", to: `${routes.notes}?item=${encodeURIComponent(link.entity_ref)}`, 
                // The id stays reachable on hover: the title is the readable name, the
                // uuid is what the row actually records.
                title: `Open ${link.entity_ref} in notes`, children: [title ?? link.entity_ref, " \u2197"] })) : target ? (_jsxs("a", { className: "bk-link-ref bk-link-ref-action", href: target.href, target: "_blank", 
                // noreferrer as well as noopener: this opens a repository URL, and the
                // referrer would say which board the reader came from.
                rel: "noopener noreferrer", 
                // The full ref stays on hover. The label is the readable part — a
                // shortened sha or a PR number — and the ref is what the row records.
                title: link.entity_ref, children: [target.label, " \u2197"] })) : isLocalPathRef(link.entity_type) ? (
            // A path on this machine, shown as one. Not underlined and not
            // clickable, because there is nothing for a browser to open.
            _jsx("code", { className: "bk-link-ref bk-link-path", children: link.entity_ref })) : (_jsx("span", { className: "bk-link-ref", children: title ?? link.entity_ref })), link.label && _jsx("span", { className: "bk-link-label", children: link.label }), _jsx("button", { className: "bk-link-del", onClick: () => onDeleteLink(link.id), children: "\u00D7" })] }));
}
function LinkedEmailRow({ link, mailBasePath, fetchFn, onOpenInMail, onDeleteLink, }) {
    const parsed = parseEmailLocator(link.entity_ref);
    const [expanded, setExpanded] = useState(false);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const toggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        if (message || loading || !parsed || !mailBasePath)
            return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchFn(`${mailBasePath}/messages/${encodeURIComponent(parsed.messageID)}?account=${encodeURIComponent(parsed.accountID)}`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.error)
                throw new Error(String(data.error));
            setMessage(data);
        }
        catch (e) {
            // Reported in place rather than swallowed: a message can genuinely be
            // gone (deleted upstream), and a silently empty preview reads as "this
            // email had no content", which is a different and wrong claim.
            setError(String(e));
        }
        finally {
            setLoading(false);
        }
    };
    const canOpen = !!parsed && !!mailBasePath;
    return (_jsxs("li", { className: "bk-email-row", children: [_jsxs("div", { className: "bk-email-head", children: [_jsx("button", { type: "button", className: "bk-email-toggle", onClick: toggle, disabled: !canOpen, title: canOpen ? 'Show this email' : 'Mail service is not configured for this host', children: expanded ? '▾' : '▸' }), _jsx("span", { className: "bk-link-label", children: link.label || '(no label)' }), canOpen && (_jsx("button", { type: "button", className: "bk-link-ref bk-link-ref-action", title: `Open in Mail — account ${parsed.accountID}`, onClick: () => onOpenInMail(parsed.accountID, parsed.messageID), children: "open \u2197" })), _jsx("button", { className: "bk-link-del", onClick: () => onDeleteLink(link.id), title: "Unlink this email", children: "\u00D7" })] }), expanded && (_jsxs("div", { className: "bk-email-body", children: [loading && _jsx("span", { className: "bi-empty", children: "Loading\u2026" }), error && _jsx("span", { className: "bridge-error", children: error }), message && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bk-email-meta", children: [_jsx("strong", { children: message.meta?.subject || '(no subject)' }), _jsx("span", { children: message.meta?.from?.name || message.meta?.from?.email }), _jsx("span", { children: message.meta?.date ? new Date(message.meta.date).toLocaleString() : '' })] }), _jsx("pre", { className: "bk-email-text", children: cleanEmailBodyForPreview(message.body_text)
                                    || message.meta?.snippet
                                    || '(this message has only an HTML body — use “open ↗” to read it in Mail)' })] }))] }))] }));
}
function AddLinkForm({ entityTypes, onAdd, }) {
    const [type, setType] = useState(entityTypes[0]?.type ?? 'session');
    const [ref, setRef] = useState('');
    const [label, setLabel] = useState('');
    return (_jsxs("form", { className: "bk-new-form bk-link-form", onSubmit: async (e) => {
            e.preventDefault();
            if (!type || !ref.trim())
                return;
            const ok = await onAdd(type, ref.trim(), label.trim() || undefined);
            if (ok) {
                setRef('');
                setLabel('');
            }
        }, children: [_jsx("select", { value: type, onChange: e => setType(e.target.value), children: entityTypes.map(t => _jsx("option", { value: t.type, children: t.type }, t.type)) }), _jsx("input", { placeholder: "entity ref (id/url/path)", value: ref, onChange: e => setRef(e.target.value) }), _jsx("input", { placeholder: "label (optional)", value: label, onChange: e => setLabel(e.target.value) }), _jsx("button", { type: "submit", className: "bi-save-btn", children: "+ Link" })] }));
}
//# sourceMappingURL=BridgeKanban.js.map