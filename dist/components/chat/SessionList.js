import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ARCHIVE_FOLDER } from '../../useBridgeFolders';
import { EditableName } from './EditableName';
import { HarnessFilterBar, sessionMode, sessionStatusGroup } from './HarnessFilterBar';
import { NewSessionMenu } from './NewSessionMenu';
import { SplitButtons } from './SplitButtons';
import { StatusDot } from './StatusDot';
import { loadExcludedHarnesses, loadExcludedMachines, loadFolderCollapsed, loadExcludedTypes, loadExcludedPurposes, loadExcludedModes, loadExcludedStatuses, loadFilterCollapsed, saveExcludedHarnesses, saveExcludedMachines, saveFolderCollapsed, saveExcludedTypes, saveExcludedPurposes, saveExcludedModes, saveExcludedStatuses, saveFilterCollapsed, } from './persistence';
export function SessionList({ sessions, instances, machines, harnesses, basePath, apiFetch, instancesPath, defaultInstanceId, openSessionIds, focusedSessionId, onSelect, onOpenInSplit, onNewSession, connected, getDisplayName, getSessionUIState, onRename, folders, onAfterFolderChange, onToggleCollapse }) {
    const [collapsed, setCollapsed] = useState(loadFolderCollapsed);
    const [ctxMenu, setCtxMenu] = useState(null);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const newFolderRef = useRef(null);
    const [excludedHarnesses, setExcludedHarnesses] = useState(loadExcludedHarnesses);
    const [excludedMachines, setExcludedMachines] = useState(loadExcludedMachines);
    const [excludedTypes, setExcludedTypes] = useState(loadExcludedTypes);
    const [excludedPurposes, setExcludedPurposes] = useState(loadExcludedPurposes);
    const [excludedModes, setExcludedModes] = useState(loadExcludedModes);
    const [excludedStatuses, setExcludedStatuses] = useState(loadExcludedStatuses);
    const [filterCollapsed, setFilterCollapsed] = useState(loadFilterCollapsed);
    const [showNewMenu, setShowNewMenu] = useState(false);
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
    const harnessMap = useMemo(() => {
        const m = new Map();
        for (const h of harnesses)
            m.set(h.name, h);
        return m;
    }, [harnesses]);
    const instanceMap = useMemo(() => {
        const m = new Map();
        for (const i of instances)
            m.set(i.id, i);
        return m;
    }, [instances]);
    const instanceMachineByID = useMemo(() => {
        const m = new Map();
        for (const i of instances)
            m.set(i.id, i.machine_id);
        return m;
    }, [instances]);
    // Status is a derived dimension: bucket each session's canonical UI state
    // (the same getSessionUIState that drives the status dot) into a coarse group.
    const statusOf = useCallback((s) => sessionStatusGroup(getSessionUIState(s)), [getSessionUIState]);
    const filtered = useMemo(() => sessions.filter(s => {
        if (excludedHarnesses.has(s.harness))
            return false;
        const machineID = s.instance_id ? instanceMachineByID.get(s.instance_id) : undefined;
        if (machineID && excludedMachines.has(machineID))
            return false;
        if (s.type && excludedTypes.has(s.type))
            return false;
        if (s.purpose && excludedPurposes.has(s.purpose))
            return false;
        if (excludedModes.has(sessionMode(s)))
            return false;
        const status = statusOf(s);
        if (status && excludedStatuses.has(status))
            return false;
        return true;
    }), [sessions, excludedHarnesses, excludedMachines, excludedTypes, excludedPurposes, excludedModes, excludedStatuses, statusOf, instanceMachineByID]);
    const sorted = useMemo(() => [...filtered].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [filtered]);
    // Free-text search over the sidebar. Matches instantly on display name or
    // session id (client-side); a debounced call to the same message-content
    // search the Sessions page uses (/sessions/search) unions in sessions whose
    // transcript text matches. When a query is active we search ALL sessions —
    // ignoring the exclude-chips and folder grouping — so a hit can never hide
    // inside a collapsed or archived folder.
    const [searchText, setSearchText] = useState('');
    const [contentHits, setContentHits] = useState(null);
    const [searching, setSearching] = useState(false);
    const query = searchText.trim();
    const searchActive = query.length > 0;
    useEffect(() => {
        if (!query) {
            setContentHits(null);
            setSearching(false);
            return;
        }
        let cancelled = false;
        setSearching(true);
        const t = setTimeout(() => {
            apiFetch(`${basePath}/sessions/search?q=${encodeURIComponent(query)}`)
                .then(async (r) => {
                if (!r.ok)
                    throw new Error(`search failed: ${r.status}`);
                const hits = (await r.json()) ?? [];
                if (!cancelled)
                    setContentHits(new Set(hits.map(h => h.session_id)));
            })
                .catch(() => { if (!cancelled)
                setContentHits(new Set()); })
                .finally(() => { if (!cancelled)
                setSearching(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query, apiFetch, basePath]);
    const searchResults = useMemo(() => {
        if (!searchActive)
            return [];
        const q = query.toLowerCase();
        // Rank so a name/id match always outranks a content-only match, and an
        // exact session-id lands at the very top — otherwise pasting a br_… id
        // buries the intended session under transcripts that merely mention it.
        const rankOf = (s) => {
            const id = s.session_id.toLowerCase();
            if (id === q)
                return 0;
            if (getDisplayName(s).toLowerCase().includes(q) || id.includes(q))
                return 1;
            return 2;
        };
        return sessions
            .filter(s => getDisplayName(s).toLowerCase().includes(q) ||
            s.session_id.toLowerCase().includes(q) ||
            (contentHits ? contentHits.has(s.session_id) : false))
            .map(s => ({ s, rank: rankOf(s) }))
            .sort((a, b) => a.rank - b.rank || b.s.updated_at.localeCompare(a.s.updated_at))
            .map(x => x.s);
    }, [searchActive, query, sessions, getDisplayName, contentHits]);
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
    const toggleHarness = (name) => {
        setExcludedHarnesses(prev => {
            const next = new Set(prev);
            if (next.has(name))
                next.delete(name);
            else
                next.add(name);
            saveExcludedHarnesses(next);
            return next;
        });
    };
    const toggleMachine = (id) => {
        setExcludedMachines(prev => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            saveExcludedMachines(next);
            return next;
        });
    };
    const toggleClass = (dim, value) => {
        const [setter, saver] = dim === 'type'
            ? [setExcludedTypes, saveExcludedTypes]
            : dim === 'purpose'
                ? [setExcludedPurposes, saveExcludedPurposes]
                : dim === 'mode'
                    ? [setExcludedModes, saveExcludedModes]
                    : [setExcludedStatuses, saveExcludedStatuses];
        setter(prev => {
            const next = new Set(prev);
            if (next.has(value))
                next.delete(value);
            else
                next.add(value);
            saver(next);
            return next;
        });
    };
    const toggleFilterCollapsed = () => {
        setFilterCollapsed(prev => {
            const next = !prev;
            saveFilterCollapsed(next);
            return next;
        });
    };
    const clearSessionFilter = () => {
        const reset = (setter, saver) => setter(prev => {
            if (prev.size > 0)
                saver(new Set());
            return prev.size === 0 ? prev : new Set();
        });
        reset(setExcludedHarnesses, saveExcludedHarnesses);
        reset(setExcludedMachines, saveExcludedMachines);
        reset(setExcludedTypes, saveExcludedTypes);
        reset(setExcludedPurposes, saveExcludedPurposes);
        reset(setExcludedModes, saveExcludedModes);
        reset(setExcludedStatuses, saveExcludedStatuses);
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
    const handleMarkDone = async (sessionId, done) => {
        setCtxMenu(null);
        setShowNewFolder(false);
        await folders.markSessionDone(sessionId, done);
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
    const handlePickInstance = (id, mode) => {
        setShowNewMenu(false);
        onNewSession(id, mode);
    };
    const renderSession = (s) => {
        const isOpen = openSessionIds.has(s.session_id);
        const isFocused = focusedSessionId === s.session_id;
        const tierClass = isFocused
            ? 'bc-session-item-selected'
            : isOpen
                ? 'bc-session-item-open'
                : '';
        const hinfo = harnessMap.get(s.harness);
        const instance = s.instance_id ? instanceMap.get(s.instance_id) : undefined;
        const harnessTitle = instance ? `${hinfo?.label || s.harness} — ${instance.name}` : (hinfo?.label || s.harness);
        const sessUIState = getSessionUIState(s);
        const sessTitle = sessUIState.charAt(0).toUpperCase() + sessUIState.slice(1);
        return (_jsxs("div", { className: `bc-session-item ${tierClass}`, onContextMenu: e => openSessionMenu(e, s.session_id), children: [_jsxs("button", { className: "bc-session-item-main", onClick: () => onSelect(s.session_id), children: [_jsx("span", { className: "bc-session-harness", title: harnessTitle, children: hinfo?.image
                                ? _jsx("img", { src: `${basePath}${hinfo.image}`, alt: "" })
                                : _jsx("span", { className: "bc-session-harness-emoji", children: hinfo?.emoji || '·' }) }), _jsx(StatusDot, { state: sessUIState, title: sessTitle }), _jsx(EditableName, { value: getDisplayName(s), onSave: name => onRename(s.session_id, name), className: "bc-session-label" })] }), _jsx(SplitButtons, { onSplit: mode => onOpenInSplit(s.session_id, mode), autoTitle: "Open session in a new split (auto direction)", chooseTitle: "Choose split direction for this session" }), _jsx("span", { className: "bc-session-menu-btn", role: "button", tabIndex: 0, onClick: e => openSessionMenu(e, s.session_id), title: "Move to folder", children: "\u22EF" })] }, s.session_id));
    };
    const enabledInstanceCount = useMemo(() => instances.filter(i => i.enabled).length, [instances]);
    return (_jsxs("div", { className: "bc-session-list", children: [_jsxs("div", { className: "bc-new-session", children: [_jsxs("div", { className: "bc-new-session-wrap", children: [_jsxs("button", { className: "bc-new-session-btn", onClick: () => setShowNewMenu(s => !s), disabled: !connected || enabledInstanceCount === 0, "aria-haspopup": "menu", "aria-expanded": showNewMenu, children: ["+ New Session ", _jsx("span", { className: "bc-new-session-caret", children: "\u25BE" })] }), showNewMenu && (_jsx(NewSessionMenu, { instances: instances, harnesses: harnesses, defaultInstanceId: defaultInstanceId, basePath: basePath, instancesPath: instancesPath, onPick: handlePickInstance, onClose: () => setShowNewMenu(false) }))] }), _jsx("button", { className: "bc-sidebar-collapse-btn", onClick: onToggleCollapse, title: "Collapse sessions", "aria-label": "Collapse sessions", children: "\u25C2" })] }), _jsxs("div", { className: "bc-session-search", children: [_jsx("input", { type: "search", className: "bc-session-search-input", placeholder: "Search name, id, or message text\u2026", value: searchText, onChange: e => setSearchText(e.target.value) }), searchActive && (_jsx("span", { className: "bc-session-search-status", children: searching ? 'searching…' : `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}` }))] }), _jsx(HarnessFilterBar, { machines: machines, harnesses: harnesses, sessions: sessions, instanceMachineByID: instanceMachineByID, excludedHarnesses: excludedHarnesses, excludedMachines: excludedMachines, excludedTypes: excludedTypes, excludedPurposes: excludedPurposes, excludedModes: excludedModes, excludedStatuses: excludedStatuses, statusOf: statusOf, onToggleHarness: toggleHarness, onToggleMachine: toggleMachine, onToggleClass: toggleClass, onClear: clearSessionFilter, basePath: basePath, collapsed: filterCollapsed, onToggleCollapsed: toggleFilterCollapsed }), searchActive ? (searchResults.length === 0 ? (_jsx("div", { className: "bc-session-list-empty", children: searching ? 'Searching…' : 'No sessions match this search' })) : (searchResults.map(renderSession))) : (_jsxs(_Fragment, { children: [sorted.length === 0 && (_jsx("div", { className: "bc-session-list-empty", children: !connected ? 'Connecting...' : (sessions.length === 0 ? 'No sessions yet' : 'No sessions match the active filter') })), unfiled.map(renderSession), grouped.map(({ name, sessions: entries }) => {
                        const isCollapsed = collapsed[name] ?? false;
                        const hasActive = entries.some(s => openSessionIds.has(s.session_id));
                        return (_jsxs("div", { children: [_jsxs("button", { className: `bc-folder-header ${hasActive ? 'bc-folder-header-active' : ''}`, onClick: () => toggleFolder(name), onContextMenu: e => openFolderMenu(e, name), children: [_jsx("span", { className: "bc-folder-chevron", children: isCollapsed ? '▸' : '▾' }), _jsx("span", { className: "bc-folder-icon", children: "\uD83D\uDCC1" }), _jsx("span", { className: "bc-folder-name", children: name }), _jsx("span", { className: "bc-folder-count", children: entries.length })] }), !isCollapsed && entries.map(renderSession)] }, name));
                    })] })), ctxMenu && (_jsxs("div", { className: "bc-ctx-menu", style: { top: ctxMenu.y, left: ctxMenu.x }, onClick: e => e.stopPropagation(), children: [ctxMenu.type === 'session' && (_jsxs(_Fragment, { children: [(() => {
                                const sess = sessions.find(s => s.session_id === ctxMenu.id);
                                const current = sess?.folder_name ?? '';
                                const isDone = current === ARCHIVE_FOLDER;
                                return (_jsxs(_Fragment, { children: [_jsx("button", { className: "bc-ctx-menu-item", onClick: () => handleMarkDone(ctxMenu.id, !isDone), children: isDone ? '↺ Unmark / unarchive' : '✓ Mark done' }), _jsx("div", { className: "bc-ctx-menu-divider" }), _jsx("div", { className: "bc-ctx-menu-label", children: "Move to folder" }), current && !isDone && (_jsx("button", { className: "bc-ctx-menu-item", onClick: () => moveToFolder(ctxMenu.id, ''), children: "\u21A9 Remove from folder" })), folders.folderOrder.map(f => (_jsxs("button", { className: `bc-ctx-menu-item ${current === f ? 'bc-ctx-menu-item-active' : ''}`, onClick: () => moveToFolder(ctxMenu.id, f), children: ["\uD83D\uDCC1 ", f] }, f)))] }));
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