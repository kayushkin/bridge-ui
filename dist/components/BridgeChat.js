import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useBridgeSession } from '../useBridgeSession';
import { useBridgePrefs } from '../useBridgePrefs';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeFolders } from '../useBridgeFolders';
import { HARNESS_EMOJI, TRANSPORT_LABEL } from '../constants';
import { formatTokens, formatCost } from '../utils';
import { ToolsSection } from './tools';
function generateFrontendId() {
    return `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function generateDefaultAgent(harness) {
    return `${harness}-agent`;
}
/* ── Collapse state persistence ── */
const COLLAPSE_KEY = 'bridge-ui-collapse';
function loadCollapseState() {
    try {
        const s = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}');
        return { harnessBar: !!s.harnessBar, sessionList: !!s.sessionList };
    }
    catch {
        return { harnessBar: false, sessionList: false };
    }
}
function saveCollapseState(s) {
    try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s));
    }
    catch { /* ignore */ }
}
/* ── Inline Editable Name ── */
function EditableName({ value, onSave, className }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef(null);
    useEffect(() => { if (editing)
        inputRef.current?.focus(); }, [editing]);
    useEffect(() => { setDraft(value); }, [value]);
    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value)
            onSave(trimmed);
        setEditing(false);
    };
    if (!editing) {
        return _jsx("span", { className: className, onDoubleClick: () => setEditing(true), title: "Double-click to rename", children: value });
    }
    return (_jsx("input", { ref: inputRef, className: "bc-inline-edit", value: draft, onChange: e => setDraft(e.target.value), onBlur: commit, onKeyDown: e => { if (e.key === 'Enter')
            commit(); if (e.key === 'Escape')
            setEditing(false); } }));
}
/* ── Message Stats Dropdown ── */
function renderValue(v) {
    if (v == null)
        return '-';
    if (typeof v === 'boolean')
        return v ? 'yes' : 'no';
    if (typeof v === 'number')
        return `${v}`;
    if (typeof v === 'string')
        return v;
    return JSON.stringify(v);
}
function flattenToRows(obj, prefix = '') {
    const rows = [];
    for (const [key, val] of Object.entries(obj)) {
        const label = prefix ? `${prefix}.${key}` : key;
        if (val != null && typeof val === 'object' && !Array.isArray(val)) {
            rows.push(...flattenToRows(val, label));
        }
        else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                const item = val[i];
                if (item != null && typeof item === 'object') {
                    rows.push(...flattenToRows(item, `${label}[${i}]`));
                }
                else {
                    rows.push([`${label}[${i}]`, renderValue(item)]);
                }
            }
        }
        else {
            rows.push([label, renderValue(val)]);
        }
    }
    return rows;
}
function MessageStats({ meta }) {
    const [open, setOpen] = useState(false);
    const rows = flattenToRows(meta);
    return (_jsxs("div", { className: "bc-stats-wrapper", children: [_jsxs("button", { className: "bc-stats-toggle", onClick: () => setOpen(v => !v), children: [open ? '\u25BE' : '\u25B8', " Stats (", rows.length, ")"] }), open && (_jsx("div", { className: "bc-stats-dropdown", children: rows.map(([label, val], i) => (_jsxs("div", { className: "bc-stats-row", children: [_jsx("span", { className: "bc-stats-label", children: label }), _jsx("span", { className: "bc-stats-value", children: val })] }, `${label}-${i}`))) }))] }));
}
function isResultRow(row) {
    return !!row.meta || row.eventType === 'result';
}
function groupEventsByType(events) {
    const order = [];
    const buckets = {};
    for (const e of events) {
        const t = String(e.type ?? 'unknown') || 'unknown';
        if (!(t in buckets)) {
            buckets[t] = [];
            order.push(t);
        }
        buckets[t].push(e);
    }
    return order.map(t => ({ type: t, events: buckets[t] }));
}
function formatHMS(ts) {
    try {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }
    catch {
        return ts;
    }
}
function idTail(id, n = 10) {
    return id.length > n ? `…${id.slice(-n)}` : id;
}
function UsageLine({ usage }) {
    const parts = [];
    if (usage.input_tokens)
        parts.push(`in ${formatTokens(usage.input_tokens)}`);
    if (usage.output_tokens)
        parts.push(`out ${formatTokens(usage.output_tokens)}`);
    if (usage.cache_read_tokens)
        parts.push(`cache-read ${formatTokens(usage.cache_read_tokens)}`);
    if (usage.cache_write_tokens)
        parts.push(`cache-write ${formatTokens(usage.cache_write_tokens)}`);
    if (parts.length === 0)
        return null;
    return _jsx("div", { className: "bc-row-usage", children: parts.join(' · ') });
}
/* ── Inline LogRow ── */
function LogRowView({ row, agent }) {
    const actorLabel = row.actor === 'user' ? 'You' : row.actor === 'system' ? 'system' : agent;
    const eventTypes = Array.from(new Set(row.events.map(e => String(e.type ?? '')).filter(Boolean)));
    const typeLabel = eventTypes.length > 1
        ? eventTypes.join('+')
        : row.subtype ? `${row.eventType}.${row.subtype}` : row.eventType;
    const hasStructuredBody = !!(row.text || row.thinking || (row.tools && row.tools.length > 0)
        || row.usage || row.meta || row.systemMessage || row.systemFields
        || row.stateTransition || row.sessionInfo || row.errorMessage);
    const hasRaw = !!(row.events && row.events.length > 0);
    const canExpand = hasStructuredBody || hasRaw;
    // Only the result row is expanded by default; everything else collapses
    // so the log stays compact.
    const [collapsed, setCollapsed] = useState(() => !isResultRow(row));
    // When a row has no structured body, expanding it auto-reveals raw —
    // otherwise the user would have to click twice to see anything.
    const [showRaw, setShowRaw] = useState(() => !hasStructuredBody && hasRaw);
    return (_jsxs("div", { className: `bc-row bc-row-${row.actor}`, children: [_jsxs("div", { className: "bc-row-header", onClick: () => canExpand && setCollapsed(c => !c), children: [_jsx("span", { className: "bc-row-ts", children: formatHMS(row.timestamp) }), _jsx("span", { className: "bc-row-type", children: typeLabel }), _jsx("span", { className: "bc-row-actor", children: actorLabel }), _jsxs("span", { className: "bc-row-ids", children: [row.clientId && _jsxs("code", { title: "client id", className: "bc-row-id bc-row-id-cli", children: ["cli:", idTail(row.clientId)] }), row.clientRequestId && _jsxs("code", { title: "caller's per-turn request id", className: "bc-row-id bc-row-id-req", children: ["req:", idTail(row.clientRequestId)] }), row.messageId && _jsxs("code", { title: "bridge-server message_id", className: "bc-row-id bc-row-id-srv", children: ["srv:", idTail(row.messageId)] }), row.harnessMessageId && _jsxs("code", { title: "harness completion id", className: "bc-row-id bc-row-id-hid", children: ["hid:", idTail(row.harnessMessageId)] })] }), canExpand && _jsx("span", { className: "bc-row-collapse", children: collapsed ? '▸' : '▾' })] }), !collapsed && (_jsxs("div", { className: "bc-row-body", children: [row.text && _jsx("div", { className: "bc-row-text", children: row.text }), row.thinking && (_jsxs("details", { className: "bc-row-thinking", children: [_jsx("summary", { children: "thinking" }), _jsx("div", { className: "bc-row-thinking-text", children: row.thinking })] })), row.tools && row.tools.length > 0 && (_jsx(ToolsSection, { tools: row.tools, turnDone: !!row.done })), row.usage && _jsx(UsageLine, { usage: row.usage }), row.meta && _jsx(MessageStats, { meta: row.meta }), row.systemMessage && _jsx("div", { className: "bc-row-system", children: row.systemMessage }), row.systemFields && (_jsx("pre", { className: "bc-row-json", children: JSON.stringify(row.systemFields, null, 2) })), row.stateTransition && (_jsxs("div", { className: "bc-row-state", children: [row.stateTransition.from ?? '—', " \u2192 ", _jsx("strong", { children: row.stateTransition.to }), row.stateTransition.reason ? ` (${row.stateTransition.reason})` : ''] })), row.sessionInfo && (_jsxs("details", { className: "bc-row-info", children: [_jsx("summary", { children: "session info" }), _jsx("pre", { className: "bc-row-json", children: JSON.stringify(row.sessionInfo, null, 2) })] })), row.errorMessage && _jsx("div", { className: "bc-row-error", children: row.errorMessage }), hasRaw && (_jsxs("div", { className: "bc-row-raw-wrap", children: [_jsx("button", { className: "bc-row-raw-toggle", onClick: e => { e.stopPropagation(); setShowRaw(s => !s); }, children: showRaw ? 'hide raw' : `raw (${row.events.length})` }), showRaw && (_jsx("div", { className: "bc-row-raw-groups", children: groupEventsByType(row.events).map(g => (_jsxs("details", { className: "bc-row-raw-group", children: [_jsxs("summary", { children: [g.type, " (", g.events.length, ")"] }), _jsx("pre", { className: "bc-row-json", children: JSON.stringify(g.events, null, 2) })] }, g.type))) }))] }))] }))] }));
}
/* ── Type filter ── */
const FILTER_KEY = 'bridge-ui-type-filter';
function loadHiddenTypes() {
    try {
        const raw = localStorage.getItem(FILTER_KEY);
        if (!raw)
            return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    }
    catch {
        return new Set();
    }
}
function saveHiddenTypes(s) {
    try {
        localStorage.setItem(FILTER_KEY, JSON.stringify([...s]));
    }
    catch { /* ignore */ }
}
function typesInRow(row) {
    const set = new Set();
    for (const e of row.events) {
        const t = e.type;
        if (typeof t === 'string' && t)
            set.add(t);
    }
    if (set.size === 0 && row.eventType)
        set.add(row.eventType);
    return [...set];
}
function FilterBar({ types, hidden, onToggle }) {
    if (types.length === 0)
        return null;
    return (_jsxs("div", { className: "bc-filter-bar", children: [_jsx("span", { className: "bc-filter-label", children: "show:" }), types.map(t => {
                const on = !hidden.has(t);
                return (_jsx("button", { type: "button", className: `bc-filter-chip${on ? ' bc-filter-chip-on' : ''}`, onClick: () => onToggle(t), children: t }, t));
            })] }));
}
/* ── Inline Thread ── */
function Thread({ rows, loading, uiState, activity, error, agent }) {
    const endRef = useRef(null);
    const [hidden, setHidden] = useState(() => loadHiddenTypes());
    const allTypes = useMemo(() => {
        const set = new Set();
        for (const r of rows)
            for (const t of typesInRow(r))
                set.add(t);
        return [...set].sort();
    }, [rows]);
    const visibleRows = useMemo(() => {
        if (hidden.size === 0)
            return rows;
        return rows.filter(r => typesInRow(r).some(t => !hidden.has(t)));
    }, [rows, hidden]);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [visibleRows]);
    const toggleType = useCallback((t) => {
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(t))
                next.delete(t);
            else
                next.add(t);
            saveHiddenTypes(next);
            return next;
        });
    }, []);
    if (loading)
        return _jsx("div", { className: "bc-thread", children: _jsx("div", { className: "bc-loading", children: "Loading history..." }) });
    if (rows.length === 0 && !error)
        return _jsx("div", { className: "bc-thread", children: _jsx("div", { className: "bc-empty", children: "Send a message to start" }) });
    return (_jsxs("div", { className: "bc-thread", children: [_jsx(FilterBar, { types: allTypes, hidden: hidden, onToggle: toggleType }), error && _jsx("div", { className: "bridge-error", children: error }), visibleRows.map(row => _jsx(LogRowView, { row: row, agent: agent }, row.key)), uiState === 'running' && (_jsxs("div", { className: "bc-activity", children: [_jsx("span", { className: "bc-activity-dot" }), activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'] })), _jsx("div", { ref: endRef })] }));
}
/* ── Inline Composer ── */
function Composer({ connected, streaming, paused, onSend, onStop, onResume }) {
    const [text, setText] = useState('');
    const inputRef = useRef(null);
    const handleSubmit = () => {
        const t = text.trim();
        if (!t || !connected || streaming)
            return;
        onSend(t);
        setText('');
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };
    useEffect(() => { if (connected && !streaming)
        inputRef.current?.focus(); }, [connected, streaming]);
    return (_jsxs("div", { className: "bc-composer", children: [_jsx("textarea", { ref: inputRef, className: "bc-composer-input", value: text, onChange: e => setText(e.target.value), onKeyDown: handleKeyDown, placeholder: connected ? 'Send a message...' : 'Select a session', disabled: !connected || streaming, rows: 1 }), streaming ? (_jsx("button", { className: "bc-composer-btn bc-btn-stop", onClick: onStop, children: "Stop" })) : paused ? (_jsx("button", { className: "bc-composer-btn bc-btn-resume", onClick: onResume, children: "Resume" })) : (_jsx("button", { className: "bc-composer-btn", onClick: handleSubmit, disabled: !text.trim() || !connected, children: "Send" }))] }));
}
/* ── Inline Session Header ── */
function SessionHeader({ chat, uiState, activity, rows, instance, onRename, onPrev, onNext, hasPrev, hasNext }) {
    if (!chat || uiState === 'empty')
        return null;
    const completed = rows.filter(r => r.actor === 'assistant' && r.done && r.meta);
    const last = completed[completed.length - 1];
    const meta = last?.meta;
    let totalCost = 0;
    for (const r of completed)
        totalCost += r.meta?.cost?.total_usd ?? 0;
    const contextTokens = meta?.usage?.context_tokens ?? 0;
    const contextLimit = meta?.usage?.context_limit ?? 200_000;
    const contextPct = contextTokens && contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0;
    return (_jsxs("div", { className: "bc-header", children: [_jsxs("div", { className: "bc-header-row", children: [_jsxs("div", { className: "bc-nav-arrows", children: [_jsx("button", { className: "bc-nav-arrow", onClick: onPrev, disabled: !hasPrev, title: "Previous session", "aria-label": "Previous session", children: "\u2039" }), _jsx("button", { className: "bc-nav-arrow", onClick: onNext, disabled: !hasNext, title: "Next session", "aria-label": "Next session", children: "\u203A" })] }), _jsxs("span", { className: `bc-state-badge bc-state-${uiState}`, children: [uiState === 'running' && _jsx("span", { className: "bc-pulse" }), uiState.charAt(0).toUpperCase() + uiState.slice(1)] }), _jsx(EditableName, { value: chat.displayName, onSave: onRename, className: "bc-session-name" }), meta?.model && _jsx("span", { className: "bc-model-badge", children: String(meta.model) }), instance && _jsxs("span", { className: "bc-instance-badge", children: [instance.name, " (", instance.transport, ")"] }), _jsx("span", { className: "bc-spacer" }), totalCost > 0 && _jsx("span", { className: "bc-cost", children: formatCost(totalCost) })] }), contextTokens > 0 && (_jsxs("div", { className: "bc-context-row", children: [_jsxs("span", { className: "bc-context-label", children: [formatTokens(contextTokens), " / ", formatTokens(contextLimit), " (", contextPct, "%)"] }), _jsx("div", { className: "bc-context-bar", children: _jsx("div", { className: `bc-bar-fill ${contextPct >= 90 ? 'bc-bar-crit' : contextPct >= 70 ? 'bc-bar-warn' : ''}`, style: { width: `${contextPct}%` } }) })] })), activity.kind !== 'idle' && uiState === 'running' && (_jsxs("div", { className: "bc-activity-row", children: [_jsx("span", { className: "bc-activity-dot" }), activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'] }))] }));
}
/* ── Inline HarnessTabBar ── */
function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath, onToggleCollapse }) {
    const harnessMap = useMemo(() => {
        const map = new Map();
        for (const h of harnesses)
            map.set(h.name, h);
        return map;
    }, [harnesses]);
    const groups = useMemo(() => {
        const groupMap = new Map();
        for (const inst of instances) {
            if (!inst.enabled)
                continue;
            const list = groupMap.get(inst.harness_type) || [];
            list.push(inst);
            groupMap.set(inst.harness_type, list);
        }
        const order = harnesses.map(h => h.name);
        return Array.from(groupMap.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    }, [instances, harnesses]);
    const instanceMeta = useMemo(() => {
        const meta = new Map();
        for (const inst of instances) {
            const s = sessions.filter(s => s.instance_id === inst.id);
            meta.set(inst.id, { running: s.filter(s => s.state === 'running').length, total: s.length });
        }
        return meta;
    }, [instances, sessions]);
    if (groups.length === 0) {
        return (_jsxs("div", { className: "htb-wrapper", children: [_jsx("button", { className: "htb-collapse-btn", onClick: onToggleCollapse, title: "Collapse harness bar", "aria-label": "Collapse harness bar", children: "\u25B4" }), _jsxs("div", { className: "htb-empty", children: ["No harness instances configured. ", _jsx(Link, { to: instancesPath, children: "Add an instance" }), " to get started."] }), _jsx("button", { className: "htb-new-instance", onClick: onNewInstance, title: "Add new instance", children: "+" })] }));
    }
    return (_jsxs("div", { className: "htb-wrapper", children: [_jsx("button", { className: "htb-collapse-btn", onClick: onToggleCollapse, title: "Collapse harness bar", "aria-label": "Collapse harness bar", children: "\u25B4" }), _jsxs("div", { className: "htb-tabs", children: [groups.map(([harnessType, groupInstances], gi) => {
                        const info = harnessMap.get(harnessType);
                        return (_jsxs("div", { className: "htb-group", children: [gi > 0 && _jsx("div", { className: "htb-sep" }), groups.length > 1 && (_jsx("div", { className: "htb-group-label", children: info?.image
                                        ? _jsx("img", { className: "htb-group-img", src: `${basePath}${info.image}`, alt: info?.label || harnessType })
                                        : _jsx("span", { children: info?.emoji || HARNESS_EMOJI[harnessType] || '' }) })), groupInstances.map(inst => {
                                    const m = instanceMeta.get(inst.id);
                                    const isActive = selectedInstance === inst.id;
                                    const available = info?.available ?? false;
                                    return (_jsxs("button", { className: `htb-tab ${isActive ? 'htb-tab-active' : ''} ${!available ? 'htb-tab-disabled' : ''}`, onClick: () => available && onSelect(inst.id), disabled: !available, title: `${inst.name} (${TRANSPORT_LABEL[inst.transport] || inst.transport} - ${inst.host})`, children: [_jsxs("div", { className: "htb-tab-line1", children: [_jsx("span", { className: `htb-avail ${available ? 'htb-avail-on' : 'htb-avail-off'}` }), groups.length <= 1 && (info?.image
                                                        ? _jsx("img", { className: "htb-tab-img", src: `${basePath}${info.image}`, alt: "" })
                                                        : _jsx("span", { className: "htb-tab-emoji", children: info?.emoji || HARNESS_EMOJI[harnessType] || '' })), _jsx("span", { className: "htb-tab-name", children: inst.name }), _jsx("span", { className: "htb-transport", children: TRANSPORT_LABEL[inst.transport] || inst.transport })] }), m && (_jsx("div", { className: "htb-tab-line2", children: m.running > 0 ? `${m.running} running` : m.total > 0 ? `${m.total} sess` : 'no sessions' }))] }, inst.id));
                                })] }, harnessType));
                    }), _jsx("button", { className: "htb-new-instance", onClick: onNewInstance, title: "Add new instance", children: "+" })] })] }));
}
/* ── Inline Session List ── */
const COLLAPSED_KEY = 'bridge-folder-collapsed';
function loadCollapsed() {
    try {
        return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}');
    }
    catch {
        return {};
    }
}
function saveCollapsed(next) {
    try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    }
    catch { /* ignore */ }
}
function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }) {
    const [collapsed, setCollapsed] = useState(loadCollapsed);
    const [ctxMenu, setCtxMenu] = useState(null);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const newFolderRef = useRef(null);
    useEffect(() => {
        if (!ctxMenu)
            return;
        const close = () => { setCtxMenu(null); setShowNewFolder(false); };
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [ctxMenu]);
    useEffect(() => {
        if (showNewFolder)
            newFolderRef.current?.focus();
    }, [showNewFolder]);
    const sorted = useMemo(() => [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [sessions]);
    const { unfiled, grouped } = useMemo(() => {
        const known = new Set(folders.folderOrder);
        const buckets = new Map();
        for (const f of folders.folderOrder)
            buckets.set(f, []);
        const unfiled = [];
        for (const s of sorted) {
            const fn = s.folder_name ?? '';
            if (fn && known.has(fn))
                buckets.get(fn).push(s);
            else
                unfiled.push(s);
        }
        const grouped = folders.folderOrder.map(name => ({ name, sessions: buckets.get(name) }));
        return { unfiled, grouped };
    }, [sorted, folders.folderOrder]);
    const toggleFolder = (name) => {
        setCollapsed(prev => {
            const next = { ...prev, [name]: !prev[name] };
            saveCollapsed(next);
            return next;
        });
    };
    const openSessionMenu = (e, sessionId) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ type: 'session', id: sessionId, x: e.clientX, y: e.clientY });
        setShowNewFolder(false);
    };
    const openFolderMenu = (e, name) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ type: 'folder', id: name, x: e.clientX, y: e.clientY });
        setShowNewFolder(false);
    };
    const moveToFolder = async (sessionId, folder) => {
        setCtxMenu(null);
        setShowNewFolder(false);
        await folders.setSessionFolder(sessionId, folder);
        onAfterFolderChange();
    };
    const handleCreateFolder = async () => {
        const name = newFolderName.trim();
        if (!name)
            return;
        const targetSession = ctxMenu?.type === 'session' ? ctxMenu.id : null;
        setCtxMenu(null);
        setShowNewFolder(false);
        setNewFolderName('');
        await folders.createFolder(name);
        if (targetSession) {
            await folders.setSessionFolder(targetSession, name);
            onAfterFolderChange();
        }
    };
    const handleDeleteFolder = async (name) => {
        setCtxMenu(null);
        await folders.deleteFolder(name);
        onAfterFolderChange();
    };
    const renderSession = (s) => (_jsxs("button", { className: `bc-session-item ${s.bridge_id === activeSession ? 'bc-session-item-active' : ''}`, onClick: () => onSelect(s.bridge_id), onContextMenu: e => openSessionMenu(e, s.bridge_id), children: [_jsx("span", { className: `bc-sdot bc-sdot-${s.state}` }), _jsx(EditableName, { value: getDisplayName(s), onSave: name => onRename(s.bridge_id, name), className: "bc-session-label" }), _jsx("span", { className: "bc-session-menu-btn", role: "button", tabIndex: 0, onClick: e => openSessionMenu(e, s.bridge_id), title: "Move to folder", children: "\u22EF" })] }, s.bridge_id));
    return (_jsxs("div", { className: "bc-session-list", children: [_jsxs("div", { className: "bc-new-session", children: [_jsx("button", { className: "bc-new-session-btn", onClick: onNewSession, disabled: !connected, children: "+ New Session" }), _jsx("button", { className: "bc-sidebar-collapse-btn", onClick: onToggleCollapse, title: "Collapse sessions", "aria-label": "Collapse sessions", children: "\u25C2" })] }), sorted.length === 0 && (_jsx("div", { className: "bc-session-list-empty", children: connected ? 'No sessions yet' : 'Connecting...' })), unfiled.map(renderSession), grouped.map(({ name, sessions: entries }) => {
                const isCollapsed = collapsed[name] ?? false;
                const hasActive = entries.some(s => s.bridge_id === activeSession);
                return (_jsxs("div", { children: [_jsxs("button", { className: `bc-folder-header ${hasActive ? 'bc-folder-header-active' : ''}`, onClick: () => toggleFolder(name), onContextMenu: e => openFolderMenu(e, name), children: [_jsx("span", { className: "bc-folder-chevron", children: isCollapsed ? '▸' : '▾' }), _jsx("span", { className: "bc-folder-icon", children: "\uD83D\uDCC1" }), _jsx("span", { className: "bc-folder-name", children: name }), _jsx("span", { className: "bc-folder-count", children: entries.length })] }), !isCollapsed && entries.map(renderSession)] }, name));
            }), ctxMenu && (_jsxs("div", { className: "bc-ctx-menu", style: { top: ctxMenu.y, left: ctxMenu.x }, onClick: e => e.stopPropagation(), children: [ctxMenu.type === 'session' && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-ctx-menu-label", children: "Move to folder" }), (() => {
                                const sess = sessions.find(s => s.bridge_id === ctxMenu.id);
                                const current = sess?.folder_name ?? '';
                                return (_jsxs(_Fragment, { children: [current && (_jsx("button", { className: "bc-ctx-menu-item", onClick: () => moveToFolder(ctxMenu.id, ''), children: "\u21A9 Remove from folder" })), folders.folderOrder.map(f => (_jsxs("button", { className: `bc-ctx-menu-item ${current === f ? 'bc-ctx-menu-item-active' : ''}`, onClick: () => moveToFolder(ctxMenu.id, f), children: ["\uD83D\uDCC1 ", f] }, f)))] }));
                            })(), showNewFolder ? (_jsxs("div", { className: "bc-ctx-new-folder", children: [_jsx("input", { ref: newFolderRef, className: "bc-ctx-new-folder-input", value: newFolderName, onChange: e => setNewFolderName(e.target.value), onKeyDown: e => {
                                            if (e.key === 'Enter')
                                                handleCreateFolder();
                                            if (e.key === 'Escape') {
                                                setShowNewFolder(false);
                                                setNewFolderName('');
                                            }
                                        }, placeholder: "Folder name" }), _jsx("button", { className: "bc-ctx-new-folder-btn", onClick: handleCreateFolder, children: "\u2713" })] })) : (_jsx("button", { className: "bc-ctx-menu-item", onClick: () => setShowNewFolder(true), children: "+ New folder" }))] })), ctxMenu.type === 'folder' && (_jsxs("button", { className: "bc-ctx-menu-item bc-ctx-menu-item-danger", onClick: () => handleDeleteFolder(ctxMenu.id), children: ["Delete folder \"", ctxMenu.id, "\""] }))] }))] }));
}
/* ── System Prompt Modal ── */
function SystemPromptModal({ info, onClose }) {
    const hasPrompt = !!info.system_prompt || !!info.append_system_prompt;
    return (_jsx("div", { className: "bc-modal-overlay", onClick: onClose, children: _jsxs("div", { className: "bc-modal", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "bc-modal-header", children: [_jsx("h3", { children: "System Prompt" }), _jsx("button", { className: "bc-modal-close", onClick: onClose, "aria-label": "Close", children: "\u00D7" })] }), _jsxs("div", { className: "bc-modal-body", children: [info.working_dir && (_jsxs("div", { className: "bc-info-row", children: [_jsx("span", { className: "bc-info-label", children: "Working directory" }), _jsx("code", { children: info.working_dir })] })), info.model && (_jsxs("div", { className: "bc-info-row", children: [_jsx("span", { className: "bc-info-label", children: "Model" }), _jsx("code", { children: info.model })] })), info.permission_mode && (_jsxs("div", { className: "bc-info-row", children: [_jsx("span", { className: "bc-info-label", children: "Permission mode" }), _jsx("code", { children: info.permission_mode })] })), info.system_prompt && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-info-label", children: "System prompt (replaces default)" }), _jsx("pre", { className: "bc-prompt-block", children: info.system_prompt })] })), info.append_system_prompt && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-info-label", children: "Appended to default system prompt" }), _jsx("pre", { className: "bc-prompt-block", children: info.append_system_prompt })] })), !hasPrompt && (_jsx("div", { className: "bc-info-empty", children: "No custom system prompt was set at session start. The agent is running with its default prompt plus any CLAUDE.md files it discovers in the working directory." }))] })] }) }));
}
/* ── Tools Panel ── */
function ToolsPanel({ info }) {
    const tools = info.tools ?? [];
    const slashCommands = info.slash_commands ?? [];
    const agents = info.agents ?? [];
    const skills = info.skills ?? [];
    const mcpServers = info.mcp_servers ?? [];
    if (tools.length === 0 && slashCommands.length === 0 && agents.length === 0 && skills.length === 0 && mcpServers.length === 0) {
        return _jsx("div", { className: "bc-tools-panel", children: _jsx("div", { className: "bc-info-empty", children: "No tools reported yet. The harness will emit this after its first init." }) });
    }
    return (_jsxs("div", { className: "bc-tools-panel", children: [tools.length > 0 && (_jsxs("div", { className: "bc-tools-section", children: [_jsxs("div", { className: "bc-tools-section-header", children: ["Tools (", tools.length, ")"] }), _jsx("div", { className: "bc-tools-grid", children: tools.map(t => (_jsx("span", { className: "bc-tool-chip", title: t.description || undefined, children: t.name }, t.name))) })] })), slashCommands.length > 0 && (_jsxs("div", { className: "bc-tools-section", children: [_jsxs("div", { className: "bc-tools-section-header", children: ["Slash commands (", slashCommands.length, ")"] }), _jsx("div", { className: "bc-tools-grid", children: slashCommands.map(c => _jsxs("span", { className: "bc-tool-chip", children: ["/", c] }, c)) })] })), agents.length > 0 && (_jsxs("div", { className: "bc-tools-section", children: [_jsxs("div", { className: "bc-tools-section-header", children: ["Sub-agents (", agents.length, ")"] }), _jsx("div", { className: "bc-tools-grid", children: agents.map(a => _jsx("span", { className: "bc-tool-chip", children: a }, a)) })] })), skills.length > 0 && (_jsxs("div", { className: "bc-tools-section", children: [_jsxs("div", { className: "bc-tools-section-header", children: ["Skills (", skills.length, ")"] }), _jsx("div", { className: "bc-tools-grid", children: skills.map(s => _jsx("span", { className: "bc-tool-chip", children: s }, s)) })] })), mcpServers.length > 0 && (_jsxs("div", { className: "bc-tools-section", children: [_jsxs("div", { className: "bc-tools-section-header", children: ["MCP servers (", mcpServers.length, ")"] }), _jsx("div", { className: "bc-tools-grid", children: mcpServers.map(m => (_jsxs("span", { className: "bc-tool-chip", title: m.status || undefined, children: [m.name, m.status ? ` · ${m.status}` : ''] }, m.name))) })] }))] }));
}
/* ── New Instance Modal ── */
function NewInstanceForm({ harnesses, onCreate, onCancel }) {
    const [form, setForm] = useState({
        name: '', harness_type: harnesses[0]?.name || 'claude_code', host: 'localhost',
        transport: 'local', working_dir: '', max_concurrent_sessions: 1,
    });
    return (_jsx("div", { className: "bc-new-inst-overlay", onClick: onCancel, children: _jsxs("div", { className: "bc-new-inst-form", onClick: e => e.stopPropagation(), children: [_jsx("h3", { children: "New Instance" }), _jsxs("label", { children: [_jsx("span", { children: "Name" }), _jsx("input", { value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })), placeholder: "my-instance" })] }), _jsxs("label", { children: [_jsx("span", { children: "Harness" }), _jsx("select", { value: form.harness_type, onChange: e => setForm(f => ({ ...f, harness_type: e.target.value })), children: harnesses.map(h => _jsx("option", { value: h.name, children: h.label || h.name }, h.name)) })] }), _jsxs("label", { children: [_jsx("span", { children: "Host" }), _jsx("input", { value: form.host, onChange: e => setForm(f => ({ ...f, host: e.target.value })), placeholder: "localhost" })] }), _jsxs("label", { children: [_jsx("span", { children: "Transport" }), _jsxs("select", { value: form.transport, onChange: e => setForm(f => ({ ...f, transport: e.target.value })), children: [_jsx("option", { value: "local", children: "Local" }), _jsx("option", { value: "ssh", children: "SSH" })] })] }), _jsxs("label", { children: [_jsx("span", { children: "Working Dir" }), _jsx("input", { value: form.working_dir, onChange: e => setForm(f => ({ ...f, working_dir: e.target.value })), placeholder: "/home/user/project" })] }), _jsxs("label", { children: [_jsx("span", { children: "Max Sessions" }), _jsx("input", { type: "number", value: form.max_concurrent_sessions, onChange: e => setForm(f => ({ ...f, max_concurrent_sessions: parseInt(e.target.value) || 1 })), min: 1 })] }), _jsxs("div", { className: "bc-new-inst-actions", children: [_jsx("button", { onClick: () => { if (form.name.trim())
                                onCreate(form); }, disabled: !form.name.trim(), children: "Create" }), _jsx("button", { onClick: onCancel, children: "Cancel" })] })] }) }));
}
/* ── Main BridgeChat ── */
export function BridgeChat() {
    const { fetch: apiFetch, basePath, routes } = useBridgeConfig();
    const bridge = useBridgeSession();
    const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` });
    const instances = useBridgeInstances();
    const folders = useBridgeFolders();
    const [harnesses, setHarnesses] = useState([]);
    const [selectedInstance, setSelectedInstance] = useState('');
    const [storeModels, setStoreModels] = useState([]);
    const [configModel, setConfigModel] = useState('');
    const [configEffort, setConfigEffort] = useState('');
    const [showNewInstance, setShowNewInstance] = useState(false);
    const [showSystemPrompt, setShowSystemPrompt] = useState(false);
    const [showTools, setShowTools] = useState(false);
    const [activeChat, setActiveChat] = useState(null);
    const [collapseState, setCollapseState] = useState(loadCollapseState);
    const pendingConfigRef = useRef(null);
    const toggleHarnessBar = useCallback(() => {
        setCollapseState(s => { const next = { ...s, harnessBar: !s.harnessBar }; saveCollapseState(next); return next; });
    }, []);
    const toggleSessionList = useCallback(() => {
        setCollapseState(s => { const next = { ...s, sessionList: !s.sessionList }; saveCollapseState(next); return next; });
    }, []);
    useEffect(() => {
        apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data) => {
            setStoreModels(data.filter(m => m.enabled));
        }).catch(() => { });
    }, [apiFetch, basePath]);
    const selectedHarness = useMemo(() => {
        if (!selectedInstance)
            return '';
        return instances.instanceMap.get(selectedInstance)?.harness_type ?? '';
    }, [selectedInstance, instances.instanceMap]);
    useEffect(() => {
        const config = {};
        if (configModel)
            config.model = configModel;
        if (configEffort)
            config.effort = configEffort;
        pendingConfigRef.current = (configModel || configEffort) ? config : null;
    }, [configModel, configEffort]);
    useEffect(() => {
        if (selectedInstance || instances.loading)
            return;
        const lastInstanceId = bridgePrefs.prefs.last_instance_id;
        if (lastInstanceId && instances.instanceMap.has(lastInstanceId)) {
            setSelectedInstance(lastInstanceId);
        }
        else {
            const first = instances.instances.find(i => i.enabled);
            if (first)
                setSelectedInstance(first.id);
        }
    }, [bridgePrefs.prefs.last_instance_id, selectedInstance, instances.instances, instances.instanceMap, instances.loading]);
    useEffect(() => {
        if (!selectedInstance || bridge.activeSession)
            return;
        const lastId = bridgePrefs.getLastSession(selectedInstance);
        if (lastId)
            bridge.selectSession(lastId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedInstance, bridge.activeSession?.bridge_id]);
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
    }, [apiFetch, basePath]);
    useEffect(() => {
        const sess = bridge.activeSession;
        if (!sess) {
            setActiveChat(null);
            return;
        }
        const agent = sess.agent_id ? sess.agent_id : generateDefaultAgent(sess.harness);
        setActiveChat({
            frontendId: sess.client_id || `fe_${sess.bridge_id}`,
            sessionId: sess.bridge_id,
            harness: sess.harness,
            agent,
            displayName: sess.display_name || agent,
        });
    }, [bridge.activeSession]);
    const getDisplayName = useCallback((session) => {
        if (session.display_name)
            return session.display_name;
        if (session.agent_id)
            return session.agent_id;
        return generateDefaultAgent(session.harness);
    }, []);
    const selectInstance = useCallback((instanceId) => {
        setSelectedInstance(instanceId);
        bridgePrefs.setLastInstanceId(instanceId);
        bridge.selectSession('');
        const lastId = bridgePrefs.getLastSession(instanceId);
        if (lastId)
            setTimeout(() => bridge.selectSession(lastId), 0);
    }, [bridge, bridgePrefs]);
    const handleSelectSession = useCallback((id) => {
        bridge.selectSession(id);
        if (id && selectedInstance)
            bridgePrefs.setLastSession(selectedInstance, id);
    }, [bridge, bridgePrefs, selectedInstance]);
    const handleCreate = useCallback(async () => {
        if (!selectedInstance || !selectedHarness)
            return;
        const frontendId = generateFrontendId();
        const agentId = generateDefaultAgent(selectedHarness);
        setActiveChat({
            frontendId,
            sessionId: null,
            harness: selectedHarness,
            agent: agentId,
            displayName: agentId,
        });
        const sess = await bridge.createSession({
            harness: selectedHarness,
            instanceId: selectedInstance,
            agentId,
            displayName: '',
            clientId: frontendId,
        });
        if (sess) {
            bridgePrefs.setLastSession(selectedInstance, sess.bridge_id);
            const defaults = bridgePrefs.getDefaults(selectedHarness);
            if (defaults.model || defaults.effort || defaults.max_budget || defaults.disabled_tools?.length) {
                bridge.sendConfig({
                    model: defaults.model,
                    effort: defaults.effort,
                    max_budget: defaults.max_budget,
                    disabled_tools: defaults.disabled_tools,
                });
            }
        }
        else {
            setActiveChat(null);
        }
    }, [bridge, bridgePrefs, selectedInstance, selectedHarness]);
    const harnessAvailable = useMemo(() => {
        if (!selectedHarness)
            return false;
        return harnesses.find(h => h.name === selectedHarness)?.available ?? false;
    }, [harnesses, selectedHarness]);
    const filteredSessions = useMemo(() => bridge.sessions.filter(s => s.instance_id === selectedInstance), [bridge.sessions, selectedInstance]);
    const navOrder = useMemo(() => [...filteredSessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [filteredSessions]);
    const navIndex = useMemo(() => {
        const id = bridge.activeSession?.bridge_id;
        if (!id)
            return -1;
        return navOrder.findIndex(s => s.bridge_id === id);
    }, [navOrder, bridge.activeSession]);
    const handlePrevSession = useCallback(() => {
        if (navIndex <= 0)
            return;
        const target = navOrder[navIndex - 1];
        bridge.selectSession(target.bridge_id);
        if (selectedInstance)
            bridgePrefs.setLastSession(selectedInstance, target.bridge_id);
    }, [navIndex, navOrder, bridge, bridgePrefs, selectedInstance]);
    const handleNextSession = useCallback(() => {
        if (navIndex < 0 || navIndex >= navOrder.length - 1)
            return;
        const target = navOrder[navIndex + 1];
        bridge.selectSession(target.bridge_id);
        if (selectedInstance)
            bridgePrefs.setLastSession(selectedInstance, target.bridge_id);
    }, [navIndex, navOrder, bridge, bridgePrefs, selectedInstance]);
    const activeInstance = useMemo(() => {
        if (!bridge.activeSession?.instance_id)
            return null;
        return instances.instanceMap.get(bridge.activeSession.instance_id) ?? null;
    }, [bridge.activeSession, instances.instanceMap]);
    const capabilities = useMemo(() => {
        const harness = activeChat?.harness ?? selectedHarness;
        const info = harnesses.find(h => h.name === harness);
        return new Set(info?.capabilities ?? []);
    }, [harnesses, activeChat, selectedHarness]);
    const harnessModels = useMemo(() => {
        const harness = harnesses.find(h => h.name === (activeChat?.harness ?? selectedHarness));
        const providers = harness?.supported_providers;
        const filtered = providers?.length ? storeModels.filter(m => providers.includes(m.provider)) : storeModels;
        return filtered.map(m => ({ value: m.id, label: `${m.name || m.id} ($${m.input_cost}/$${m.output_cost})` }));
    }, [storeModels, harnesses, activeChat, selectedHarness]);
    const handleCompact = useCallback(() => bridge.compact(), [bridge]);
    const handleFork = useCallback(() => bridge.fork(), [bridge]);
    const handleSend = useCallback((text) => {
        if (pendingConfigRef.current) {
            bridge.sendConfig(pendingConfigRef.current);
            if (selectedHarness) {
                bridgePrefs.setHarnessDefaults(selectedHarness, pendingConfigRef.current);
            }
            pendingConfigRef.current = null;
        }
        bridge.send(text);
    }, [bridge, bridgePrefs, selectedHarness]);
    const handleRenameSession = useCallback((id, name) => {
        bridge.renameSession(id, name);
    }, [bridge]);
    const handleCreateInstance = useCallback(async (data) => {
        const inst = await instances.createInstance(data);
        if (inst) {
            setSelectedInstance(inst.id);
            bridgePrefs.setLastInstanceId(inst.id);
        }
        setShowNewInstance(false);
    }, [instances, bridgePrefs]);
    const currentInstanceName = useMemo(() => {
        if (!selectedInstance)
            return '';
        return instances.instanceMap.get(selectedInstance)?.name ?? '';
    }, [selectedInstance, instances.instanceMap]);
    return (_jsxs("div", { className: `bc-container ${collapseState.harnessBar ? 'bc-harness-collapsed' : ''} ${collapseState.sessionList ? 'bc-sidebar-collapsed' : ''}`, children: [collapseState.harnessBar ? (_jsx("div", { className: "htb-wrapper htb-wrapper-collapsed", children: _jsxs("button", { className: "htb-expand-btn", onClick: toggleHarnessBar, title: "Expand harness bar", "aria-label": "Expand harness bar", children: [_jsx("span", { className: "htb-expand-chevron", children: "\u25BE" }), _jsxs("span", { className: "htb-expand-label", children: ["Harness: ", currentInstanceName || 'none selected'] })] }) })) : (_jsx(HarnessTabBar, { instances: instances.instances, harnesses: harnesses, sessions: bridge.sessions, selectedInstance: selectedInstance, onSelect: selectInstance, onNewInstance: () => setShowNewInstance(true), basePath: basePath, instancesPath: routes.instances, onToggleCollapse: toggleHarnessBar })), _jsxs("div", { className: "bc-main", children: [collapseState.sessionList ? (_jsxs("button", { className: "bc-sidebar-strip", onClick: toggleSessionList, title: "Show sessions", "aria-label": "Show sessions", children: [_jsx("span", { className: "bc-sidebar-strip-chevron", children: "\u25B8" }), _jsx("span", { className: "bc-sidebar-strip-label", children: "Sessions" })] })) : (_jsx(SessionList, { sessions: filteredSessions, activeSession: bridge.activeSession?.bridge_id ?? '', onSelect: handleSelectSession, onNewSession: handleCreate, connected: bridge.connected && harnessAvailable, getDisplayName: getDisplayName, onRename: handleRenameSession, folders: folders, onAfterFolderChange: bridge.refreshSessions, onToggleCollapse: toggleSessionList })), _jsxs("div", { className: "bc-chat-area", children: [_jsx(SessionHeader, { chat: activeChat, uiState: bridge.uiState, activity: bridge.activity, rows: bridge.logRows, instance: activeInstance, onRename: name => activeChat?.sessionId && handleRenameSession(activeChat.sessionId, name), onPrev: handlePrevSession, onNext: handleNextSession, hasPrev: navIndex > 0, hasNext: navIndex >= 0 && navIndex < navOrder.length - 1 }), _jsx(Thread, { rows: bridge.logRows, loading: bridge.loadingHistory, uiState: bridge.uiState, activity: bridge.activity, error: bridge.error, agent: activeChat?.agent ?? '' }), _jsx("div", { className: "bc-controls-bar", children: bridge.activeSession && (_jsxs(_Fragment, { children: [capabilities.has('model') && harnessModels.length > 0 && (_jsxs("select", { className: "bc-ctrl-select", value: configModel, onChange: e => setConfigModel(e.target.value), title: "Model", children: [_jsx("option", { value: "", children: "Model" }), harnessModels.map(m => _jsx("option", { value: m.value, children: m.label }, m.value))] })), capabilities.has('effort') && (_jsxs("select", { className: "bc-ctrl-select", value: configEffort, onChange: e => setConfigEffort(e.target.value), title: "Effort", children: [_jsx("option", { value: "", children: "Effort" }), _jsx("option", { value: "low", children: "Low" }), _jsx("option", { value: "medium", children: "Medium" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "xhigh", children: "XHigh" }), _jsx("option", { value: "max", children: "Max" })] })), capabilities.has('compact') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleCompact, title: "Compact context", children: "Compact" })), capabilities.has('fork') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleFork, title: "Fork session", children: "Fork" })), capabilities.has('system_prompt') && (_jsx("button", { className: "bc-ctrl-btn", onClick: () => setShowSystemPrompt(true), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'View system prompt' : 'System prompt will be available after the session starts', children: "System Prompt" })), capabilities.has('tools') && (_jsxs("button", { className: `bc-ctrl-btn ${showTools ? 'bc-ctrl-btn-active' : ''}`, onClick: () => setShowTools(s => !s), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'Toggle available tools' : 'Tools will be available after the session starts', children: ["Tools", bridge.activeSession.info?.tools?.length ? ` (${bridge.activeSession.info.tools.length})` : ''] }))] })) }), showTools && bridge.activeSession?.info && _jsx(ToolsPanel, { info: bridge.activeSession.info }), _jsx(Composer, { connected: bridge.connected && !!bridge.activeSession, streaming: bridge.uiState === 'running', paused: bridge.uiState === 'paused', onSend: handleSend, onStop: bridge.interrupt, onResume: bridge.resume })] })] }), showNewInstance && (_jsx(NewInstanceForm, { harnesses: harnesses, onCreate: handleCreateInstance, onCancel: () => setShowNewInstance(false) })), showSystemPrompt && bridge.activeSession?.info && (_jsx(SystemPromptModal, { info: bridge.activeSession.info, onClose: () => setShowSystemPrompt(false) }))] }));
}
//# sourceMappingURL=BridgeChat.js.map