import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo } from 'react';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { UsageLine } from './UsageLine';
import { formatHMS } from './utils';
function rowsToTurns(rows) {
    const out = [];
    for (const row of rows) {
        if (row.kind === 'user_message' && row.text) {
            out.push({
                key: `tv_user_${row.key}`,
                actor: 'user',
                text: row.text,
                ts: row.timestamp,
                turnId: row.turnId,
            });
        }
        else if (row.kind === 'result' && row.done) {
            const text = row.text || row.meta?.text;
            if (text) {
                out.push({
                    key: `tv_res_${row.key}`,
                    actor: 'assistant',
                    text,
                    ts: row.timestamp,
                    turnId: row.turnId,
                    usage: row.usage || row.meta?.usage,
                    isError: row.meta?.is_error,
                });
            }
        }
        else if (row.kind === 'error' && row.errorMessage) {
            out.push({
                key: `tv_err_${row.key}`,
                actor: 'assistant',
                text: row.errorMessage,
                ts: row.timestamp,
                turnId: row.turnId,
                isError: true,
            });
        }
    }
    return out;
}
export function TurnsView({ rows, agent, onToggleCollapse, style, paneKey }) {
    const { containerRef, endRef, isAtBottom, scrollToBottom } = useStickyBottomScroll();
    const items = useMemo(() => rowsToTurns(rows), [rows]);
    const onHeaderKey = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
        }
    }, [onToggleCollapse]);
    return (_jsxs("div", { className: "bc-turns-pane", style: style, "data-pane": paneKey, children: [_jsxs("div", { className: "bc-turns-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: onHeaderKey, role: "button", tabIndex: 0, title: "Hide turns", "aria-label": "Hide turns", children: [_jsx("span", { className: "bc-turns-title", children: "Turns" }), _jsx("span", { className: "bc-turns-count", children: items.length }), _jsx("span", { className: "bc-spacer" }), _jsx("span", { className: "bc-turns-collapse-btn", "aria-hidden": "true", children: "\u00D7" })] }), _jsxs("div", { ref: containerRef, className: "bc-turns-body", children: [items.length === 0 && _jsx("div", { className: "bc-turns-empty", children: "No messages yet" }), items.map(it => (_jsxs("div", { className: `bc-turns-item bc-turns-${it.actor}${it.isError ? ' bc-turns-error' : ''}`, title: it.text, children: [_jsxs("div", { className: "bc-turns-meta", children: [_jsx("span", { className: "bc-turns-actor", children: it.actor === 'user' ? 'You' : agent || 'assistant' }), _jsx("span", { className: "bc-turns-ts", children: formatHMS(it.ts) }), it.usage && _jsx(UsageLine, { usage: it.usage })] }), _jsx("div", { className: "bc-turns-text", children: it.text })] }, it.key))), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New messages" }))] }));
}
//# sourceMappingURL=TurnsView.js.map