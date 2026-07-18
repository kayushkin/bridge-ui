import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { ARCHIVE_FOLDER } from '../../useBridgeFolders';
import { formatTokens } from '../../utils';
import { CostBreakdown } from './CostBreakdown';
import { EditableName } from './EditableName';
import { PaneToggles } from './PaneToggles';
import { StatusDot } from './StatusDot';
export function SessionHeader({ chat, session, harnessInfo, machine, machineReachable, basePath, uiState, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onToggleKanban, onToggleAttach, attachAvailable, onMarkDone, onCloseWorkspace, gitRepos, selectedRepo, onSelectRepo }) {
    const completed = chat ? rows.filter(r => r.actor === 'assistant' && r.done && r.meta) : [];
    const last = completed[completed.length - 1];
    const meta = last?.meta;
    let totalCost = 0;
    for (const r of completed)
        totalCost += r.meta?.cost?.total_usd ?? 0;
    const contextTokens = meta?.usage?.context_tokens ?? 0;
    const contextLimit = meta?.usage?.context_limit ?? 0;
    const contextPct = contextTokens && contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0;
    const contextTone = contextPct >= 90 ? 'crit' : contextPct >= 70 ? 'warn' : '';
    const dotState = chat && uiState !== 'empty' ? uiState : 'placeholder';
    const dotTitle = chat && uiState !== 'empty'
        ? uiState.charAt(0).toUpperCase() + uiState.slice(1)
        : 'No session';
    // All harness chrome (label / emoji / image / tint) comes from server-side
    // HarnessInfo. No client-side fallback maps — if a field is missing, fix
    // the server registration (llm-bridge-server harnessMetadata).
    const harness = chat?.harness ?? '';
    const harnessLabel = harnessInfo?.label || harness;
    const harnessEmoji = harnessInfo?.emoji || '';
    const harnessImage = harnessInfo?.image;
    const headerStyle = harnessInfo?.tint
        ? { ['--bc-harness']: harnessInfo.tint }
        : undefined;
    const currentRepo = gitRepos.find(r => r.path === selectedRepo) ?? gitRepos[0];
    const repoCount = gitRepos.length;
    const [detailsOpen, setDetailsOpen] = useState(false);
    const detailsRef = useRef(null);
    useEffect(() => {
        if (!detailsOpen)
            return;
        const onDocClick = (e) => {
            if (!detailsRef.current)
                return;
            if (!detailsRef.current.contains(e.target))
                setDetailsOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape')
            setDetailsOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [detailsOpen]);
    const sourceLabel = session?.purpose || 'chat';
    // A session is "done" once it has been marked and moved into the Archive
    // folder — the same signal the sidebar uses to flip its menu label.
    const isDone = session?.folder_name === ARCHIVE_FOLDER;
    return (_jsxs("div", { className: "bc-header", style: headerStyle, "data-harness": harness || undefined, children: [_jsxs("div", { className: "bc-header-row", children: [_jsxs("div", { className: "bc-nav-arrows", children: [_jsx("button", { className: "bc-nav-arrow", onClick: onPrev, disabled: !hasPrev, title: "Previous session", "aria-label": "Previous session", children: "\u2039" }), _jsx("button", { className: "bc-nav-arrow", onClick: onNext, disabled: !hasNext, title: "Next session", "aria-label": "Next session", children: "\u203A" })] }), _jsx(StatusDot, { state: dotState, title: dotTitle }), harness && (_jsx("span", { className: "bc-harness-chip", title: harnessLabel, "aria-label": harnessLabel, children: harnessImage
                            ? _jsx("img", { className: "bc-harness-chip-img", src: `${basePath}${harnessImage}`, alt: "" })
                            : harnessEmoji
                                ? _jsx("span", { className: "bc-harness-chip-emoji", "aria-hidden": true, children: harnessEmoji })
                                : _jsx("span", { className: "bc-harness-chip-label", children: harnessLabel }) })), machine && (_jsxs("span", { className: "bc-machine-chip", title: [
                            `${machine.name}${machine.hostname ? ` (${machine.hostname})` : ''}`,
                            `transport: ${machine.transport}`,
                            machineReachable === null ? 'reachability unknown' :
                                machineReachable ? 'reachable' : 'unreachable',
                        ].join('\n'), children: [_jsx("span", { className: "bc-machine-chip-emoji", "aria-hidden": true, children: machine.emoji || '🖥' }), _jsx("span", { className: "bc-machine-chip-label", children: machine.name }), _jsx("span", { className: 'bc-machine-chip-dot ' +
                                    (machineReachable === null
                                        ? 'bc-machine-chip-dot-unknown'
                                        : machineReachable
                                            ? 'bc-machine-chip-dot-ok'
                                            : 'bc-machine-chip-dot-fail'), "aria-hidden": true })] })), session && (_jsxs("div", { className: "bc-details-wrap", ref: detailsRef, children: [_jsxs("button", { type: "button", className: `bc-source-chip${detailsOpen ? ' bc-source-chip-open' : ''}`, onClick: () => setDetailsOpen(o => !o), "data-source": session.purpose || 'chat', title: `source: ${sourceLabel}\nclick for full session details`, "aria-expanded": detailsOpen, "aria-label": "Session details", children: [_jsx("span", { className: "bc-source-chip-label", children: sourceLabel }), _jsx("span", { className: "bc-source-chip-caret", "aria-hidden": true, children: "\u25BE" })] }), detailsOpen && _jsx(SessionDetailsPanel, { session: session })] })), chat
                        ? _jsx(EditableName, { value: chat.displayName, onSave: onRename, className: "bc-session-name" })
                        : _jsx("span", { className: "bc-session-name bc-session-name-empty", children: "\u2014" }), _jsx(CostBreakdown, { rows: rows, fallbackTotalUSD: totalCost, fallbackTitle: contextTokens && contextLimit ? `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens (${contextPct}%)` : undefined }), repoCount > 0 && currentRepo && (_jsxs("label", { className: "bc-repo-chip", title: `${currentRepo.path}${repoCount > 1 ? ` — ${repoCount} repos discovered` : ''}`, children: [_jsx("span", { className: "bc-repo-chip-icon", "aria-hidden": true, children: "\u25C6" }), _jsx("span", { className: "bc-repo-chip-name", children: currentRepo.name }), repoCount > 1 && _jsxs("span", { className: "bc-repo-chip-count", "aria-hidden": true, children: ["+", repoCount - 1] }), _jsx("select", { className: "bc-repo-chip-select", value: selectedRepo, onChange: e => onSelectRepo(e.target.value), "aria-label": "Switch repository", children: gitRepos.map(r => (_jsx("option", { value: r.path, children: r.name }, r.path))) }), _jsx("span", { className: "bc-repo-chip-caret", "aria-hidden": true, children: "\u25BE" })] })), _jsxs("div", { className: "bc-header-right", children: [_jsx(PaneToggles, { panesHidden: panesHidden, onToggleTurns: onToggleTurns, onToggleThread: onToggleThread, onToggleTimeline: onToggleTimeline, onToggleGit: onToggleGit, onToggleKanban: onToggleKanban, onToggleAttach: onToggleAttach, attachAvailable: attachAvailable }), session && onMarkDone && (_jsx("button", { className: `bc-mark-done${isDone ? ' bc-mark-done-active' : ''}`, onClick: () => onMarkDone(!isDone), title: isDone ? 'Reopen this session' : 'Mark this session done', "aria-label": isDone ? 'Reopen session' : 'Mark session done', "aria-pressed": isDone, children: isDone ? '↺ Reopen' : '✓ Done' })), onCloseWorkspace && (_jsx("button", { className: "bc-workspace-close", onClick: onCloseWorkspace, title: "Close workspace", "aria-label": "Close workspace", children: "\u00D7" }))] })] }), contextTokens > 0 && contextLimit > 0 && (_jsx("div", { className: `bc-header-context ${contextTone ? `bc-header-context-${contextTone}` : ''}`, style: { width: `${contextPct}%` } }))] }));
}
function SessionDetailsPanel({ session }) {
    const fmt = (v) => v && v.length ? v : '—';
    const fmtDate = (v) => {
        if (!v)
            return '—';
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
    };
    const rows = [
        ['type', fmt(session.type)],
        ['purpose', fmt(session.purpose)],
        ['origin', fmt(session.origin)],
        ['folder', fmt(session.folder_name)],
        ['state', fmt(session.state)],
        ['mode', session.mode || 'events'],
        ['harness', fmt(session.harness)],
        ['agent', fmt(session.agent_id)],
        ['instance', fmt(session.instance_id), true],
        ['session id', fmt(session.session_id), true],
        ['harness session', fmt(session.harness_session_id), true],
        ['parent', fmt(session.parent_id), true],
        ['spawned by', fmt(session.manager_session_id), true],
        ['pid', session.pid ? String(session.pid) : '—'],
        ['created', fmtDate(session.created_at)],
        ['updated', fmtDate(session.updated_at)],
    ];
    return (_jsx("div", { className: "bc-details-panel", role: "dialog", "aria-label": "Session details", children: _jsx("dl", { className: "bc-details-list", children: rows.map(([k, v, mono]) => (_jsxs("div", { className: "bc-details-row", children: [_jsx("dt", { children: k }), _jsx("dd", { className: mono ? 'bc-details-mono' : undefined, title: v, children: v })] }, k))) }) }));
}
//# sourceMappingURL=SessionHeader.js.map