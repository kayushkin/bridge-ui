import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatCost, formatTokens } from '../../utils';
import { EditableName } from './EditableName';
import { PaneToggles } from './PaneToggles';
export function SessionHeader({ chat, uiState, activity, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseWorkspace }) {
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
    const activityText = activity.kind !== 'idle' && uiState === 'running'
        ? (activity.kind === 'tool' ? `${activity.name}` : activity.kind === 'thinking' ? 'thinking' : 'streaming')
        : '';
    const showState = !!chat && uiState !== 'empty';
    return (_jsxs("div", { className: "bc-header", children: [_jsxs("div", { className: "bc-header-row", children: [_jsxs("div", { className: "bc-nav-arrows", children: [_jsx("button", { className: "bc-nav-arrow", onClick: onPrev, disabled: !hasPrev, title: "Previous session", "aria-label": "Previous session", children: "\u2039" }), _jsx("button", { className: "bc-nav-arrow", onClick: onNext, disabled: !hasNext, title: "Next session", "aria-label": "Next session", children: "\u203A" })] }), showState ? (_jsxs("span", { className: `bc-state-badge bc-state-${uiState}`, children: [uiState === 'running' && _jsx("span", { className: "bc-pulse" }), uiState.charAt(0).toUpperCase() + uiState.slice(1), activityText && _jsxs("span", { className: "bc-state-activity", children: ["\u00B7 ", activityText] })] })) : (_jsx("span", { className: "bc-state-badge bc-state-placeholder", children: "No session" })), chat
                        ? _jsx(EditableName, { value: chat.displayName, onSave: onRename, className: "bc-session-name" })
                        : _jsx("span", { className: "bc-session-name bc-session-name-empty", children: "\u2014" }), contextTokens > 0 && contextLimit > 0 && (_jsxs("span", { className: "bc-context-label", title: `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens`, children: [formatTokens(contextTokens), "/", formatTokens(contextLimit), " (", contextPct, "%)"] })), totalCost > 0 && _jsx("span", { className: "bc-cost", children: formatCost(totalCost) }), _jsx("span", { className: "bc-spacer" }), _jsx(PaneToggles, { panesHidden: panesHidden, onToggleTurns: onToggleTurns, onToggleThread: onToggleThread, onToggleTimeline: onToggleTimeline, onToggleGit: onToggleGit }), onCloseWorkspace && (_jsx("button", { className: "bc-workspace-close", onClick: onCloseWorkspace, title: "Close workspace", "aria-label": "Close workspace", children: "\u00D7" }))] }), contextTokens > 0 && contextLimit > 0 && (_jsx("div", { className: `bc-header-context ${contextTone ? `bc-header-context-${contextTone}` : ''}`, style: { width: `${contextPct}%` } }))] }));
}
//# sourceMappingURL=SessionHeader.js.map