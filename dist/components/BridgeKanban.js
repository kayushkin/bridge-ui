import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useKanban } from '../useKanban';
function sessionLink(card) {
    for (const l of card.links ?? []) {
        if (!l.entity_ref)
            continue;
        if (l.entity_type === 'session')
            return { ref: l.entity_ref };
    }
    return null;
}
const LAYOUT_KEY = 'bk:layout';
const LAST_BOARD_KEY = 'bk:lastBoardId';
const COLLAPSED_COLUMNS_KEY = 'bk:collapsedColumns';
const DEFAULT_BOARD_NAME = 'Agent runs';
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
    const [drawerCardID, setDrawerCardID] = useState(null);
    const [showNewBoard, setShowNewBoard] = useState(false);
    const [showNewColumn, setShowNewColumn] = useState(false);
    const [composeColumn, setComposeColumn] = useState(null);
    const [layout, setLayout] = useState(() => {
        if (typeof localStorage === 'undefined')
            return 'horizontal';
        return localStorage.getItem(LAYOUT_KEY) === 'vertical' ? 'vertical' : 'horizontal';
    });
    const [collapsedColumns, setCollapsedColumns] = useState(loadCollapsedColumns);
    const { routes } = useBridgeConfig();
    const navigate = useNavigate();
    const openSessionLink = (link) => {
        navigate(`${routes.chat}?session=${encodeURIComponent(link.ref)}`);
    };
    const k = useKanban(selectedBoardID);
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
                                }, onCancel: () => setShowNewColumn(false) })), _jsx("div", { className: `bk-columns bk-columns-${layout}`, children: k.view.columns.map(cv => (_jsx(ColumnPane, { cv: cv, boardColumns: k.view.columns.map(c => c.column), collapsed: collapsedColumns.has(cv.column.id), onToggleCollapse: () => toggleColumnCollapsed(cv.column.id), onCompose: () => setComposeColumn(cv.column.id), composeOpen: composeColumn === cv.column.id, onCancelCompose: () => setComposeColumn(null), onCreateCard: async (args) => {
                                        const ok = await k.createCard({ ...args, column_id: cv.column.id });
                                        if (ok)
                                            setComposeColumn(null);
                                    }, onMoveCard: (cardID, columnID) => k.moveCard(cardID, columnID), onOpenCard: (cardID) => setDrawerCardID(cardID), onOpenChat: openSessionLink, onStopCard: async (cardID) => {
                                        // Parking work nobody is doing yet is cheap and reversible, so
                                        // it just happens. Interrupting an agent mid-turn is not the
                                        // same act, and the card's own session link is what tells the
                                        // two apart — so only that case asks.
                                        const card = cv.cards?.find(c => c.placement.card_id === cardID);
                                        if (card && sessionLink(card)) {
                                            if (!confirm('This card has a running session. Stop will pause the agent mid-turn (resumable) and park the work. Continue?'))
                                                return false;
                                        }
                                        return k.stopCard(cardID);
                                    }, onPlayCard: (cardID) => k.playCard(cardID), onDeleteColumn: async () => {
                                        if ((cv.cards?.length ?? 0) > 0) {
                                            if (!confirm(`Column "${cv.column.name}" has ${cv.cards.length} cards. Delete column AND detach those cards?`))
                                                return;
                                        }
                                        await k.deleteColumn(cv.column.id);
                                    } }, cv.column.id))) }), k.view.orphans && k.view.orphans.length > 0 && (_jsxs("div", { className: "bk-orphans", children: [_jsxs("h3", { children: ["Orphaned placements (", k.view.orphans.length, ")"] }), _jsx("p", { className: "bk-orphan-note", children: "These cards have placements in this board but their noteboard items were deleted. Detach them in /api/cards/:id?hard=true." })] }))] }))] }), drawerCard && k.view && (_jsx(CardDrawer, { card: drawerCard, boardID: k.view.board.id, entityTypes: k.entityTypes, onClose: () => setDrawerCardID(null), onPatch: (patch) => k.patchCard(drawerCard.placement.card_id, patch), onDelete: async (hard) => {
                    const ok = await k.deleteCard(drawerCard.placement.card_id, hard);
                    if (ok)
                        setDrawerCardID(null);
                }, onAddLink: (et, er, label) => k.addCardLink(drawerCard.placement.card_id, et, er, label), onDeleteLink: (linkID) => k.deleteCardLink(linkID), onOpenChat: openSessionLink }))] }));
}
// ============================ Sub-components ============================
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
function ColumnPane({ cv, boardColumns, collapsed, onToggleCollapse, onCompose, composeOpen, onCancelCompose, onCreateCard, onMoveCard, onOpenCard, onOpenChat, onStopCard, onPlayCard, onDeleteColumn, }) {
    const cards = cv.cards ?? [];
    const wip = cv.column.wip_limit;
    const overWIP = wip != null && cards.length > wip;
    const className = [
        'bk-column',
        overWIP ? 'bk-column-over-wip' : '',
        collapsed ? 'bk-column-collapsed' : '',
    ].filter(Boolean).join(' ');
    return (_jsxs("section", { className: className, children: [_jsxs("header", { className: "bk-column-head", style: cv.column.color ? { borderTopColor: cv.column.color } : undefined, children: [_jsxs("div", { className: "bk-column-title", children: [_jsx("button", { className: "bk-column-collapse-btn", onClick: onToggleCollapse, title: collapsed ? 'Expand column' : 'Collapse column', "aria-label": collapsed ? 'Expand column' : 'Collapse column', children: collapsed ? '▸' : '▾' }), _jsx("strong", { children: cv.column.name }), _jsxs("span", { className: "bk-column-count", children: [cards.length, wip != null ? ` / ${wip}` : ''] })] }), !collapsed && (_jsxs("div", { className: "bk-column-actions", children: [_jsx("button", { className: "bi-add-btn", onClick: onCompose, children: "+" }), _jsx("button", { className: "bi-add-btn", onClick: onDeleteColumn, title: "Delete column", children: "\u00D7" })] })), cv.column.auto_status && !collapsed && (_jsxs("div", { className: "bk-column-meta", children: ["auto-status: ", cv.column.auto_status] }))] }), !collapsed && composeOpen && (_jsx(NewCardForm, { onCreate: onCreateCard, onCancel: onCancelCompose })), !collapsed && (_jsxs("div", { className: "bk-card-list", children: [cards.map(c => (_jsx(CardTile, { card: c, currentColumn: cv.column.id, boardColumns: boardColumns, onMove: onMoveCard, onOpen: () => onOpenCard(c.placement.card_id), onOpenChat: onOpenChat, onStop: onStopCard, onPlay: onPlayCard }, c.placement.card_id))), cards.length === 0 && (_jsx("div", { className: "bk-card-empty", children: "no cards" }))] }))] }));
}
function NewCardForm({ onCreate, onCancel, }) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [tags, setTags] = useState('');
    return (_jsxs("form", { className: "bk-new-form bk-new-card", onSubmit: e => {
            e.preventDefault();
            if (!title.trim())
                return;
            onCreate({
                title: title.trim(),
                body: body.trim() || undefined,
                tags: tags.split(',').map(s => s.trim()).filter(Boolean),
            });
        }, children: [_jsx("input", { autoFocus: true, placeholder: "Card title", value: title, onChange: e => setTitle(e.target.value) }), _jsx("textarea", { placeholder: "Body (markdown, optional)", rows: 3, value: body, onChange: e => setBody(e.target.value) }), _jsx("input", { placeholder: "tags (comma-separated)", value: tags, onChange: e => setTags(e.target.value) }), _jsxs("div", { className: "bk-form-actions", children: [_jsx("button", { type: "submit", className: "bi-save-btn", children: "Add card" }), _jsx("button", { type: "button", onClick: onCancel, children: "Cancel" })] })] }));
}
function CardTile({ card, currentColumn, boardColumns, onMove, onOpen, onOpenChat, onStop, onPlay, }) {
    const item = card.item;
    if (!item) {
        return (_jsxs("div", { className: "bk-card bk-card-orphan", onClick: onOpen, children: [_jsx("em", { children: "missing noteboard item" }), _jsx("small", { children: card.placement.card_id })] }));
    }
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const status = item.status;
    const session = sessionLink(card);
    // The gate is a property of the work, not of the column it sits in — so the
    // button renders on every card in every column, not just in a gate column.
    const held = !!item.held_at;
    return (_jsxs("div", { className: `bk-card${held ? ' bk-card-held' : ''}`, onClick: onOpen, children: [_jsx("div", { className: "bk-card-title", children: item.title }), held && (_jsxs("div", { className: "bk-card-hold", title: item.hold_reason || 'No reason given', children: ["\u23F8 held \u2014 no agent will pick this up", item.hold_reason ? `: ${item.hold_reason}` : ''] })), tags.length > 0 && (_jsx("div", { className: "bk-card-tags", children: tags.map(t => _jsx("span", { className: "bk-tag", children: t }, t)) })), _jsxs("div", { className: "bk-card-foot", children: [_jsx("span", { className: `bk-status bk-status-${status}`, children: status }), _jsx("button", { type: "button", className: held ? 'bk-card-play' : 'bk-card-stop', title: held
                            ? 'Play — clear the hold so agents may work this, and resume its session if it was paused'
                            : 'Stop — park this work so no agent picks it up, and pause any session already running it', onClick: e => {
                            e.stopPropagation();
                            held ? onPlay(card.placement.card_id) : onStop(card.placement.card_id);
                        }, children: held ? '▶' : '⏸' }), session && (_jsx("button", { type: "button", className: "bk-card-chat", title: `Open chat session ${session.ref}`, onClick: e => { e.stopPropagation(); onOpenChat(session); }, children: "chat \u2197" })), _jsx("select", { value: currentColumn, onClick: e => e.stopPropagation(), onChange: e => onMove(card.placement.card_id, e.target.value), title: "Move to column", children: boardColumns.map(c => (_jsx("option", { value: c.id, children: c.name }, c.id))) })] })] }));
}
function CardDrawer({ card, boardID: _boardID, entityTypes, onClose, onPatch, onDelete, onAddLink, onDeleteLink, onOpenChat, }) {
    const item = card.item;
    const [title, setTitle] = useState(item?.title ?? '');
    const [body, setBody] = useState(item?.body ?? '');
    const [tags, setTags] = useState((item?.tags ?? []).join(', '));
    const [status, setStatus] = useState(item?.status ?? 'open');
    const [dirty, setDirty] = useState(false);
    // Re-seed when the underlying card changes (e.g. after a refresh)
    useEffect(() => {
        setTitle(item?.title ?? '');
        setBody(item?.body ?? '');
        setTags((item?.tags ?? []).join(', '));
        setStatus(item?.status ?? 'open');
        setDirty(false);
    }, [item?.id, item?.updated_at]);
    const links = card.links ?? [];
    const save = async () => {
        const patch = {
            title,
            body,
            status,
            tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        };
        const ok = await onPatch(patch);
        if (ok)
            setDirty(false);
    };
    return (_jsx("div", { className: "bk-drawer-backdrop", onClick: onClose, children: _jsxs("aside", { className: "bk-drawer", onClick: e => e.stopPropagation(), children: [_jsxs("header", { className: "bk-drawer-head", children: [_jsx("h3", { children: "Card" }), _jsx("button", { onClick: onClose, className: "bi-add-btn", children: "\u00D7" })] }), !item ? (_jsxs("div", { className: "bridge-error", children: ["noteboard item is missing for placement ", card.placement.card_id] })) : (_jsxs(_Fragment, { children: [_jsx("label", { className: "bk-drawer-label", children: "Title" }), _jsx("input", { value: title, onChange: e => { setTitle(e.target.value); setDirty(true); } }), _jsx("label", { className: "bk-drawer-label", children: "Body (markdown)" }), _jsx("textarea", { rows: 8, value: body, onChange: e => { setBody(e.target.value); setDirty(true); } }), _jsxs("div", { className: "bk-drawer-row", children: [_jsxs("div", { children: [_jsx("label", { className: "bk-drawer-label", children: "Status" }), _jsxs("select", { value: status, onChange: e => { setStatus(e.target.value); setDirty(true); }, children: [_jsx("option", { value: "open", children: "open" }), _jsx("option", { value: "done", children: "done" }), _jsx("option", { value: "archived", children: "archived" })] })] }), _jsxs("div", { className: "bk-drawer-grow", children: [_jsx("label", { className: "bk-drawer-label", children: "Tags" }), _jsx("input", { value: tags, onChange: e => { setTags(e.target.value); setDirty(true); }, placeholder: "comma-separated" })] })] }), _jsxs("div", { className: "bk-form-actions", children: [_jsx("button", { className: "bi-save-btn", disabled: !dirty, onClick: save, children: "Save" }), _jsx("button", { onClick: () => onDelete(false), children: "Archive" }), _jsx("button", { onClick: () => { if (confirm('Hard delete card from noteboard? Cannot be undone.'))
                                        onDelete(true); }, children: "Hard delete" })] }), _jsx("hr", {}), _jsx("h4", { children: "Entity links" }), _jsxs("ul", { className: "bk-link-list", children: [links.map(l => {
                                    const isSessionLink = l.entity_type === 'session' && !!l.entity_ref;
                                    return (_jsxs("li", { children: [_jsx("span", { className: "bk-link-type", children: l.entity_type }), isSessionLink ? (_jsxs("button", { type: "button", className: "bk-link-ref bk-link-ref-action", title: `Open chat session ${l.entity_ref}`, onClick: () => onOpenChat({ ref: l.entity_ref }), children: [l.entity_ref, " \u2197"] })) : (_jsx("span", { className: "bk-link-ref", children: l.entity_ref })), l.label && _jsx("span", { className: "bk-link-label", children: l.label }), _jsx("button", { className: "bk-link-del", onClick: () => onDeleteLink(l.id), children: "\u00D7" })] }, l.id));
                                }), links.length === 0 && _jsx("li", { className: "bi-empty", children: "No links yet." })] }), _jsx(AddLinkForm, { entityTypes: entityTypes, onAdd: onAddLink })] }))] }) }));
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