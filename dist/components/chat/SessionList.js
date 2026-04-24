import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditableName } from './EditableName';
import { loadFolderCollapsed, saveFolderCollapsed } from './persistence';
export function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }) {
    const [collapsed, setCollapsed] = useState(loadFolderCollapsed);
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
            saveFolderCollapsed(next);
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
//# sourceMappingURL=SessionList.js.map