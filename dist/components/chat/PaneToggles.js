import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PaneToggles({ panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit }) {
    const pill = (key, label, icon, onClick) => {
        const visible = !panesHidden[key];
        return (_jsx("button", { className: `bc-pane-toggle ${visible ? 'bc-pane-toggle-on' : ''}`, onClick: onClick, title: `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`, "aria-pressed": visible, "aria-label": label, children: _jsx("span", { className: "bc-pane-toggle-icon", "aria-hidden": "true", children: icon }) }));
    };
    return (_jsxs("div", { className: "bc-pane-toggles", role: "group", "aria-label": "Pane visibility", children: [pill('turns', 'Turns', '📋', onToggleTurns), pill('thread', 'Thread', '💬', onToggleThread), pill('timeline', 'Timeline', '⏱', onToggleTimeline), pill('git', 'Git', '🌿', onToggleGit)] }));
}
//# sourceMappingURL=PaneToggles.js.map