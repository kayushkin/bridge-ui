import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { ToolContext } from '../tools';
import { FilterBar } from './FilterBar';
import { LogRowView, TurnGroupView, groupRowsByTurn } from './LogRowView';
import { loadHiddenTypes, saveHiddenTypes } from './persistence';
import { typesInRow } from './utils';
export function Thread({ rows, loading, error, agent, sessionId }) {
    const { containerRef, endRef, isAtBottom, scrollToBottom } = useStickyBottomScroll();
    const [hidden, setHidden] = useState(() => loadHiddenTypes());
    const allTypes = useMemo(() => {
        const set = new Set();
        for (const r of rows)
            for (const t of typesInRow(r))
                set.add(t);
        return [...set].sort();
    }, [rows]);
    const visibleRows = useMemo(() => {
        if (hidden.size === 0)
            return rows;
        return rows.filter(r => typesInRow(r).some(t => !hidden.has(t)));
    }, [rows, hidden]);
    const blocks = useMemo(() => groupRowsByTurn(visibleRows), [visibleRows]);
    const toggleType = useCallback((t) => {
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(t))
                next.delete(t);
            else
                next.add(t);
            saveHiddenTypes(next);
            return next;
        });
    }, []);
    if (loading)
        return _jsx("div", { className: "bc-thread", children: _jsx("div", { className: "bc-loading", children: "Loading history..." }) });
    if (rows.length === 0 && !error)
        return _jsx("div", { className: "bc-thread", children: _jsx("div", { className: "bc-empty", children: "Send a message to start" }) });
    return (_jsx(ToolContext.Provider, { value: { sessionId }, children: _jsxs("div", { className: "bc-thread-wrap", children: [_jsxs("div", { ref: containerRef, className: "bc-thread", children: [_jsx(FilterBar, { types: allTypes, hidden: hidden, onToggle: toggleType }), error && _jsx("div", { className: "bridge-error", children: error }), blocks.map((b, i) => b.kind === 'turn'
                            ? _jsx(TurnGroupView, { turnId: b.turnId, rows: b.rows, agent: agent }, `turn_${b.turnId}`)
                            : _jsx(LogRowView, { row: b.row, agent: agent }, `row_${b.row.key}_${i}`)), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New messages" }))] }) }));
}
//# sourceMappingURL=Thread.js.map