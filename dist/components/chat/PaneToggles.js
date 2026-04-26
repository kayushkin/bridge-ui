import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PaneToggles({ panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseAll }) {
    const allClosed = panesHidden.turns && panesHidden.thread && panesHidden.timeline && panesHidden.git;
    const pill = (key, label, onClick) => {
        const visible = !panesHidden[key];
        return (_jsx("button", { className: `bc-pane-toggle ${visible ? 'bc-pane-toggle-on' : ''}`, onClick: onClick, title: `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`, "aria-pressed": visible, children: label }));
    };
    return (_jsxs("div", { className: "bc-pane-toggles", role: "group", "aria-label": "Pane visibility", children: [pill('turns', 'Turns', onToggleTurns), pill('thread', 'Thread', onToggleThread), pill('timeline', 'Timeline', onToggleTimeline), pill('git', 'Git', onToggleGit), _jsx("button", { className: "bc-pane-close-all", onClick: onCloseAll, disabled: allClosed, title: "Close all panes", "aria-label": "Close all panes", children: "\u00D7" })] }));
}
//# sourceMappingURL=PaneToggles.js.map