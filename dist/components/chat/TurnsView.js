import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo } from 'react';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { UsageLine } from './UsageLine';
import { formatHMS } from './utils';
function rowsToTurns(rows) {
    // A given assistant message yields up to two rows that both carry the same
    // text: a `text` row that grows as `stream` deltas land, and a `result` row
    // that arrives with the final text once the turn closes. Prefer the
    // `result` when present; otherwise fall back to the in-flight `text` row so
    // the user sees their answer scroll in instead of staring at a stale count.
    const resultMessageIds = new Set();
    for (const row of rows) {
        if (row.kind === 'result' && row.done && row.messageId) {
            resultMessageIds.add(row.messageId);
        }
    }
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
        else if (row.kind === 'text' && row.text && !(row.messageId && resultMessageIds.has(row.messageId))) {
            out.push({
                key: `tv_txt_${row.key}`,
                actor: 'assistant',
                text: row.text,
                ts: row.timestamp,
                turnId: row.turnId,
                isStreaming: true,
            });
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
        else if (row.kind === 'system' && row.subtype === 'compact_boundary') {
            out.push({
                key: `tv_compact_${row.key}`,
                actor: 'system',
                text: 'Context compacted',
                ts: row.timestamp,
                isMarker: true,
                markerKind: 'compact',
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
    return (_jsxs("div", { className: "bc-turns-pane", style: style, "data-pane": paneKey, children: [_jsxs("div", { className: "bc-turns-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: onHeaderKey, role: "button", tabIndex: 0, title: "Hide turns", "aria-label": "Hide turns", children: [_jsx("span", { className: "bc-turns-title", children: "Turns" }), _jsx("span", { className: "bc-turns-count", children: items.length }), _jsx("span", { className: "bc-spacer" }), _jsx("span", { className: "bc-turns-collapse-btn", "aria-hidden": "true", children: "\u00D7" })] }), _jsxs("div", { ref: containerRef, className: "bc-turns-body", children: [items.length === 0 && _jsx("div", { className: "bc-turns-empty", children: "No messages yet" }), items.map(it => {
                        if (it.isMarker) {
                            return (_jsxs("div", { className: `bc-turns-marker bc-turns-marker-${it.markerKind}`, role: "separator", children: [_jsx("span", { className: "bc-turns-marker-line", "aria-hidden": true }), _jsx("span", { className: "bc-turns-marker-text", children: it.text }), _jsx("span", { className: "bc-turns-marker-ts", children: formatHMS(it.ts) }), _jsx("span", { className: "bc-turns-marker-line", "aria-hidden": true })] }, it.key));
                        }
                        return (_jsxs("div", { className: `bc-turns-item bc-turns-${it.actor}${it.isError ? ' bc-turns-error' : ''}${it.isStreaming ? ' bc-turns-streaming' : ''}`, title: it.text, children: [_jsxs("div", { className: "bc-turns-meta", children: [_jsx("span", { className: "bc-turns-actor", children: it.actor === 'user' ? 'You' : agent || 'assistant' }), _jsx("span", { className: "bc-turns-ts", children: formatHMS(it.ts) }), it.usage && _jsx(UsageLine, { usage: it.usage }), it.isStreaming && _jsx("span", { className: "bc-turns-streaming-tag", children: "streaming\u2026" })] }), _jsx("div", { className: "bc-turns-text", children: it.text })] }, it.key));
                    }), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New messages" }))] }));
}
//# sourceMappingURL=TurnsView.js.map