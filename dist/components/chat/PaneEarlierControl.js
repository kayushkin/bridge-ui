import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * The top of a windowed pane: what is above the window, and the two ways to
 * bring it in.
 *
 * Shared by Thread and Timeline, which window the same way and count
 * different units — Thread counts log rows, Timeline counts timeline items —
 * so the noun is the caller's.
 */
export function PaneEarlierControl({ hiddenCount, unitNoun, onRevealMore, onRevealAll }) {
    return (_jsxs("div", { className: "bc-pane-earlier", children: [_jsxs("span", { className: "bc-pane-earlier-count", children: [hiddenCount.toLocaleString(), " earlier ", unitNoun, hiddenCount === 1 ? '' : 's', " not rendered"] }), _jsx("button", { type: "button", className: "bc-pane-earlier-btn", onClick: onRevealMore, children: "\u2191 Show earlier" }), _jsx("button", { type: "button", className: "bc-pane-earlier-btn bc-pane-earlier-all", onClick: onRevealAll, title: "Render the whole log \u2014 needed to find text with the browser's own search", children: "Show all" })] }));
}
//# sourceMappingURL=PaneEarlierControl.js.map