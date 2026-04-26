import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatCost, formatTokens } from '../../utils';
import { EditableName } from './EditableName';
import { PaneToggles } from './PaneToggles';
export function SessionHeader({ chat, harnessInfo, machine, machineReachable, basePath, uiState, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseWorkspace, gitRepos, selectedRepo, onSelectRepo }) {
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
    return (_jsxs("div", { className: "bc-header", style: headerStyle, "data-harness": harness || undefined, children: [_jsxs("div", { className: "bc-header-row", children: [_jsxs("div", { className: "bc-nav-arrows", children: [_jsx("button", { className: "bc-nav-arrow", onClick: onPrev, disabled: !hasPrev, title: "Previous session", "aria-label": "Previous session", children: "\u2039" }), _jsx("button", { className: "bc-nav-arrow", onClick: onNext, disabled: !hasNext, title: "Next session", "aria-label": "Next session", children: "\u203A" })] }), _jsx("span", { className: `bc-status-dot bc-status-dot-${dotState}`, title: dotTitle, "aria-label": dotTitle }), harness && (_jsxs("span", { className: "bc-harness-chip", title: harnessLabel, children: [harnessImage
                                ? _jsx("img", { className: "bc-harness-chip-img", src: `${basePath}${harnessImage}`, alt: "" })
                                : harnessEmoji && _jsx("span", { className: "bc-harness-chip-emoji", "aria-hidden": true, children: harnessEmoji }), _jsx("span", { className: "bc-harness-chip-label", children: harnessLabel })] })), machine && (_jsxs("span", { className: "bc-machine-chip", title: [
                            `${machine.name}${machine.hostname ? ` (${machine.hostname})` : ''}`,
                            `transport: ${machine.transport}`,
                            machineReachable === null ? 'reachability unknown' :
                                machineReachable ? 'reachable' : 'unreachable',
                        ].join('\n'), children: [_jsx("span", { className: "bc-machine-chip-emoji", "aria-hidden": true, children: machine.emoji || '🖥' }), _jsx("span", { className: "bc-machine-chip-label", children: machine.name }), _jsx("span", { className: 'bc-machine-chip-dot ' +
                                    (machineReachable === null
                                        ? 'bc-machine-chip-dot-unknown'
                                        : machineReachable
                                            ? 'bc-machine-chip-dot-ok'
                                            : 'bc-machine-chip-dot-fail'), "aria-hidden": true })] })), chat
                        ? _jsx(EditableName, { value: chat.displayName, onSave: onRename, className: "bc-session-name" })
                        : _jsx("span", { className: "bc-session-name bc-session-name-empty", children: "\u2014" }), totalCost > 0 && (_jsx("span", { className: "bc-cost", title: contextTokens && contextLimit ? `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens (${contextPct}%)` : undefined, children: formatCost(totalCost) })), repoCount > 0 && currentRepo && (_jsxs("label", { className: "bc-repo-chip", title: `${currentRepo.path}${repoCount > 1 ? ` — ${repoCount} repos discovered` : ''}`, children: [_jsx("span", { className: "bc-repo-chip-icon", "aria-hidden": true, children: "\u25C6" }), _jsx("span", { className: "bc-repo-chip-name", children: currentRepo.name }), repoCount > 1 && _jsxs("span", { className: "bc-repo-chip-count", "aria-hidden": true, children: ["+", repoCount - 1] }), _jsx("select", { className: "bc-repo-chip-select", value: selectedRepo, onChange: e => onSelectRepo(e.target.value), "aria-label": "Switch repository", children: gitRepos.map(r => (_jsx("option", { value: r.path, children: r.name }, r.path))) }), _jsx("span", { className: "bc-repo-chip-caret", "aria-hidden": true, children: "\u25BE" })] })), _jsx("span", { className: "bc-spacer" }), _jsx(PaneToggles, { panesHidden: panesHidden, onToggleTurns: onToggleTurns, onToggleThread: onToggleThread, onToggleTimeline: onToggleTimeline, onToggleGit: onToggleGit }), onCloseWorkspace && (_jsx("button", { className: "bc-workspace-close", onClick: onCloseWorkspace, title: "Close workspace", "aria-label": "Close workspace", children: "\u00D7" }))] }), contextTokens > 0 && contextLimit > 0 && (_jsx("div", { className: `bc-header-context ${contextTone ? `bc-header-context-${contextTone}` : ''}`, style: { width: `${contextPct}%` } }))] }));
}
//# sourceMappingURL=SessionHeader.js.map