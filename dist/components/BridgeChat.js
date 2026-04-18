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
import { ToolItem, ToolsSection } from './tools';
function generateFrontendId() {
    return `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function generateDefaultAgent(harness) {
    return `${harness}-agent`;
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
/* ── Inline Thread ── */
function Thread({ messages, loading, uiState, activity, error, agent }) {
    const endRef = useRef(null);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    if (loading)
        return _jsx("div", { className: "bc-thread", children: _jsx("div", { className: "bc-loading", children: "Loading history..." }) });
    if (messages.length === 0 && !error)
        return _jsx("div", { className: "bc-thread", children: _jsx("div", { className: "bc-empty", children: "Send a message to start" }) });
    return (_jsxs("div", { className: "bc-thread", children: [error && _jsx("div", { className: "bridge-error", children: error }), messages.map((m, i) => {
                const tools = m.meta?.tools || [];
                const isStreaming = m.role === 'assistant' && !m.done;
                return (_jsxs("div", { className: `bc-msg bc-msg-${m.role}`, children: [_jsx("div", { className: "bc-msg-role", children: m.role === 'user' ? 'You' : agent }), m.thinking && _jsx("div", { className: "bc-msg-thinking", children: m.thinking }), isStreaming && tools.length > 0 ? (_jsxs("div", { className: "bc-msg-split", children: [_jsx("div", { className: "bc-msg-split-text", children: m.content ? _jsx("div", { className: "bc-msg-content", children: m.content }) : _jsx("span", { className: "bc-typing", children: "..." }) }), _jsxs("div", { className: "bc-msg-split-tools", children: [_jsx("div", { className: "bc-split-tools-header", children: "Tools" }), tools.map((t, ti) => _jsx(ToolItem, { tool: t, running: !t.output && !t.error, turnDone: false }, ti))] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-msg-content", children: m.content }), tools.length > 0 && (_jsx(ToolsSection, { tools: tools, turnDone: !!m.done }))] })), m.meta && m.role === 'assistant' && m.done && (_jsx(MessageStats, { meta: m.meta }))] }, m.id || i));
            }), uiState === 'running' && (_jsxs("div", { className: "bc-activity", children: [_jsx("span", { className: "bc-activity-dot" }), activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'] })), _jsx("div", { ref: endRef })] }));
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
function SessionHeader({ chat, uiState, activity, messages, instance, onRename }) {
    if (!chat || uiState === 'empty')
        return null;
    const completed = messages.filter(m => m.role === 'assistant' && m.done && m.meta);
    const last = completed[completed.length - 1];
    const meta = last?.meta;
    let totalCost = 0;
    for (const m of completed)
        totalCost += m.meta?.cost?.total_usd ?? 0;
    const contextTokens = meta?.usage?.context_tokens ?? 0;
    const contextLimit = meta?.usage?.context_limit ?? 200_000;
    const contextPct = contextTokens && contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0;
    return (_jsxs("div", { className: "bc-header", children: [_jsxs("div", { className: "bc-header-row", children: [_jsxs("span", { className: `bc-state-badge bc-state-${uiState}`, children: [uiState === 'running' && _jsx("span", { className: "bc-pulse" }), uiState.charAt(0).toUpperCase() + uiState.slice(1)] }), _jsx(EditableName, { value: chat.displayName, onSave: onRename, className: "bc-session-name" }), meta?.model && _jsx("span", { className: "bc-model-badge", children: String(meta.model) }), instance && _jsxs("span", { className: "bc-instance-badge", children: [instance.name, " (", instance.transport, ")"] }), _jsx("span", { className: "bc-spacer" }), totalCost > 0 && _jsx("span", { className: "bc-cost", children: formatCost(totalCost) })] }), contextTokens > 0 && (_jsxs("div", { className: "bc-context-row", children: [_jsxs("span", { className: "bc-context-label", children: [formatTokens(contextTokens), " / ", formatTokens(contextLimit), " (", contextPct, "%)"] }), _jsx("div", { className: "bc-context-bar", children: _jsx("div", { className: `bc-bar-fill ${contextPct >= 90 ? 'bc-bar-crit' : contextPct >= 70 ? 'bc-bar-warn' : ''}`, style: { width: `${contextPct}%` } }) })] })), activity.kind !== 'idle' && uiState === 'running' && (_jsxs("div", { className: "bc-activity-row", children: [_jsx("span", { className: "bc-activity-dot" }), activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'] }))] }));
}
/* ── Inline HarnessTabBar ── */
function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath }) {
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
        return (_jsxs("div", { className: "htb-wrapper", children: [_jsxs("div", { className: "htb-empty", children: ["No harness instances configured. ", _jsx(Link, { to: instancesPath, children: "Add an instance" }), " to get started."] }), _jsx("button", { className: "htb-new-instance", onClick: onNewInstance, title: "Add new instance", children: "+" })] }));
    }
    return (_jsx("div", { className: "htb-wrapper", children: _jsxs("div", { className: "htb-tabs", children: [groups.map(([harnessType, groupInstances], gi) => {
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
                }), _jsx("button", { className: "htb-new-instance", onClick: onNewInstance, title: "Add new instance", children: "+" })] }) }));
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
function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange }) {
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
    return (_jsxs("div", { className: "bc-session-list", children: [_jsx("div", { className: "bc-new-session", children: _jsx("button", { className: "bc-new-session-btn", onClick: onNewSession, disabled: !connected, children: "+ New Session" }) }), sorted.length === 0 && (_jsx("div", { className: "bc-session-list-empty", children: connected ? 'No sessions yet' : 'Connecting...' })), unfiled.map(renderSession), grouped.map(({ name, sessions: entries }) => {
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
    const pendingConfigRef = useRef(null);
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
    return (_jsxs("div", { className: "bc-container", children: [_jsx(HarnessTabBar, { instances: instances.instances, harnesses: harnesses, sessions: bridge.sessions, selectedInstance: selectedInstance, onSelect: selectInstance, onNewInstance: () => setShowNewInstance(true), basePath: basePath, instancesPath: routes.instances }), _jsxs("div", { className: "bc-main", children: [_jsx(SessionList, { sessions: filteredSessions, activeSession: bridge.activeSession?.bridge_id ?? '', onSelect: handleSelectSession, onNewSession: handleCreate, connected: bridge.connected && harnessAvailable, getDisplayName: getDisplayName, onRename: handleRenameSession, folders: folders, onAfterFolderChange: bridge.refreshSessions }), _jsxs("div", { className: "bc-chat-area", children: [_jsx(SessionHeader, { chat: activeChat, uiState: bridge.uiState, activity: bridge.activity, messages: bridge.messages, instance: activeInstance, onRename: name => activeChat?.sessionId && handleRenameSession(activeChat.sessionId, name) }), _jsx(Thread, { messages: bridge.messages, loading: bridge.loadingHistory, uiState: bridge.uiState, activity: bridge.activity, error: bridge.error, agent: activeChat?.agent ?? '' }), _jsx("div", { className: "bc-controls-bar", children: bridge.activeSession && (_jsxs(_Fragment, { children: [capabilities.has('model') && harnessModels.length > 0 && (_jsxs("select", { className: "bc-ctrl-select", value: configModel, onChange: e => setConfigModel(e.target.value), title: "Model", children: [_jsx("option", { value: "", children: "Model" }), harnessModels.map(m => _jsx("option", { value: m.value, children: m.label }, m.value))] })), capabilities.has('effort') && (_jsxs("select", { className: "bc-ctrl-select", value: configEffort, onChange: e => setConfigEffort(e.target.value), title: "Effort", children: [_jsx("option", { value: "", children: "Effort" }), _jsx("option", { value: "low", children: "Low" }), _jsx("option", { value: "medium", children: "Medium" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "xhigh", children: "XHigh" }), _jsx("option", { value: "max", children: "Max" })] })), capabilities.has('compact') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleCompact, title: "Compact context", children: "Compact" })), capabilities.has('fork') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleFork, title: "Fork session", children: "Fork" })), capabilities.has('system_prompt') && (_jsx("button", { className: "bc-ctrl-btn", onClick: () => setShowSystemPrompt(true), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'View system prompt' : 'System prompt will be available after the session starts', children: "System Prompt" })), capabilities.has('tools') && (_jsxs("button", { className: `bc-ctrl-btn ${showTools ? 'bc-ctrl-btn-active' : ''}`, onClick: () => setShowTools(s => !s), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'Toggle available tools' : 'Tools will be available after the session starts', children: ["Tools", bridge.activeSession.info?.tools?.length ? ` (${bridge.activeSession.info.tools.length})` : ''] }))] })) }), showTools && bridge.activeSession?.info && _jsx(ToolsPanel, { info: bridge.activeSession.info }), _jsx(Composer, { connected: bridge.connected && !!bridge.activeSession, streaming: bridge.uiState === 'running', paused: bridge.uiState === 'paused', onSend: handleSend, onStop: bridge.interrupt, onResume: bridge.resume })] })] }), showNewInstance && (_jsx(NewInstanceForm, { harnesses: harnesses, onCreate: handleCreateInstance, onCancel: () => setShowNewInstance(false) })), showSystemPrompt && bridge.activeSession?.info && (_jsx(SystemPromptModal, { info: bridge.activeSession.info, onClose: () => setShowSystemPrompt(false) }))] }));
}
//# sourceMappingURL=BridgeChat.js.map