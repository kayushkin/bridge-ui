import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatCost, formatTokens } from '../../utils';
import { EditableName } from './EditableName';
import { PaneToggles } from './PaneToggles';
export function SessionHeader({ chat, uiState, activity, rows, instance, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseAllPanes, onCloseWorkspace }) {
    if (!chat || uiState === 'empty')
        return null;
    const completed = rows.filter(r => r.actor === 'assistant' && r.done && r.meta);
    const last = completed[completed.length - 1];
    const meta = last?.meta;
    let totalCost = 0;
    for (const r of completed)
        totalCost += r.meta?.cost?.total_usd ?? 0;
    const contextTokens = meta?.usage?.context_tokens ?? 0;
    const contextLimit = meta?.usage?.context_limit ?? 0;
    const contextPct = contextTokens && contextLimit ? Math.round((contextTokens / contextLimit) * 100) : 0;
    const activityText = activity.kind !== 'idle' && uiState === 'running'
        ? (activity.kind === 'tool' ? `${activity.name}` : activity.kind === 'thinking' ? 'thinking' : 'streaming')
        : '';
    return (_jsx("div", { className: "bc-header", children: _jsxs("div", { className: "bc-header-row", children: [_jsxs("div", { className: "bc-nav-arrows", children: [_jsx("button", { className: "bc-nav-arrow", onClick: onPrev, disabled: !hasPrev, title: "Previous session", "aria-label": "Previous session", children: "\u2039" }), _jsx("button", { className: "bc-nav-arrow", onClick: onNext, disabled: !hasNext, title: "Next session", "aria-label": "Next session", children: "\u203A" })] }), _jsxs("span", { className: `bc-state-badge bc-state-${uiState}`, children: [uiState === 'running' && _jsx("span", { className: "bc-pulse" }), uiState.charAt(0).toUpperCase() + uiState.slice(1), activityText && _jsxs("span", { className: "bc-state-activity", children: ["\u00B7 ", activityText] })] }), _jsx(EditableName, { value: chat.displayName, onSave: onRename, className: "bc-session-name" }), meta?.model && _jsx("span", { className: "bc-model-badge", children: String(meta.model) }), instance && _jsxs("span", { className: "bc-instance-badge", children: [instance.name, " (", instance.transport, ")"] }), contextTokens > 0 && contextLimit > 0 && (_jsxs("span", { className: "bc-context-inline", title: `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens`, children: [_jsxs("span", { className: "bc-context-label", children: [formatTokens(contextTokens), "/", formatTokens(contextLimit), " (", contextPct, "%)"] }), _jsx("span", { className: "bc-context-bar", children: _jsx("span", { className: `bc-bar-fill ${contextPct >= 90 ? 'bc-bar-crit' : contextPct >= 70 ? 'bc-bar-warn' : ''}`, style: { width: `${Math.min(100, contextPct)}%` } }) })] })), totalCost > 0 && _jsx("span", { className: "bc-cost", children: formatCost(totalCost) }), _jsx("span", { className: "bc-spacer" }), _jsx(PaneToggles, { panesHidden: panesHidden, onToggleTurns: onToggleTurns, onToggleThread: onToggleThread, onToggleTimeline: onToggleTimeline, onToggleGit: onToggleGit, onCloseAll: onCloseAllPanes }), onCloseWorkspace && (_jsx("button", { className: "bc-workspace-close", onClick: onCloseWorkspace, title: "Close workspace", "aria-label": "Close workspace", children: "\u00D7" }))] }) }));
}
//# sourceMappingURL=SessionHeader.js.map