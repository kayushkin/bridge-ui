import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { ToolContext } from '../tools';
import { FilterBar } from './FilterBar';
import { LogRowView, TurnGroupView, groupRowsByTurn } from './LogRowView';
import { loadHiddenTypes, saveHiddenTypes } from './persistence';
import { THREAD_WINDOW_INITIAL_ROWS, THREAD_WINDOW_STEP_ROWS, rowsBeforeWindow, threadBlockKey, threadWindowStart, } from './threadWindow';
import { typesInRow } from './utils';
// The scroll restore below has to run before the browser paints, or the user
// sees the content jump and then correct itself. On the server there is no
// layout to run before, and React warns about the layout variant there — and
// `npm run pane-cost` and `npm run check` both render this pane through
// react-dom/server, so the warning would land in the instrument's output.
const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
export function Thread({ rows, loading, error, agent, sessionId }) {
    const { containerRef, endRef, isAtBottom, scrollToBottom } = useStickyBottomScroll();
    const [hidden, setHidden] = useState(() => loadHiddenTypes());
    const [rowBudget, setRowBudget] = useState(THREAD_WINDOW_INITIAL_ROWS);
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
    // A different log to look at is a different window: another session, or the
    // same one with different types filtered out.
    useEffect(() => { setRowBudget(THREAD_WINDOW_INITIAL_ROWS); }, [sessionId, hidden]);
    const budgetStart = useMemo(() => threadWindowStart(blocks, rowBudget), [blocks, rowBudget]);
    // While the user is pinned to the bottom the window slides forward with the
    // log and dropping the oldest blocks off the top is invisible. While they
    // are scrolled up it must not slide: rows arriving at the bottom would push
    // blocks out of the top of the window and move the content under their eyes,
    // which is a regression the un-windowed pane cannot have. So when they are
    // not at the bottom, hold whichever block is currently first.
    //
    // Held by key rather than by index because the list is the thing that is
    // changing. If that block is gone — a filter toggle rebuilt the list — the
    // hold lapses and the budget decides again, so this can never wedge the
    // window onto content that no longer exists.
    const heldTopKeyRef = useRef(null);
    let windowStart = budgetStart;
    if (!isAtBottom && heldTopKeyRef.current !== null) {
        const held = blocks.findIndex(b => threadBlockKey(b) === heldTopKeyRef.current);
        if (held >= 0)
            windowStart = Math.min(held, budgetStart);
    }
    heldTopKeyRef.current = blocks.length > 0 ? threadBlockKey(blocks[windowStart]) : null;
    const windowedBlocks = windowStart > 0 ? blocks.slice(windowStart) : blocks;
    const earlierRowCount = rowsBeforeWindow(blocks, windowStart);
    // Revealing earlier blocks inserts them ABOVE the viewport. The browser
    // keeps scrollTop where it was, so the content the user was reading slides
    // down out of view. The distance from the bottom is the one quantity that
    // adding rows at the top leaves unchanged, so record it before the reveal
    // and restore it after layout.
    const bottomDistanceRef = useRef(null);
    const revealEarlier = useCallback((nextBudget) => {
        const c = containerRef.current;
        bottomDistanceRef.current = c ? c.scrollHeight - c.scrollTop : null;
        setRowBudget(nextBudget);
    }, [containerRef]);
    useBeforePaintEffect(() => {
        const c = containerRef.current;
        const distance = bottomDistanceRef.current;
        bottomDistanceRef.current = null;
        if (c && distance !== null)
            c.scrollTop = c.scrollHeight - distance;
    }, [rowBudget, containerRef]);
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
    return (_jsx(ToolContext.Provider, { value: { sessionId }, children: _jsxs("div", { className: "bc-thread-wrap", children: [_jsxs("div", { ref: containerRef, className: "bc-thread", children: [_jsx(FilterBar, { types: allTypes, hidden: hidden, onToggle: toggleType }), error && _jsx("div", { className: "bridge-error", children: error }), windowStart > 0 && (_jsxs("div", { className: "bc-thread-earlier", children: [_jsxs("span", { className: "bc-thread-earlier-count", children: [earlierRowCount.toLocaleString(), " earlier event", earlierRowCount === 1 ? '' : 's', " not rendered"] }), _jsx("button", { type: "button", className: "bc-thread-earlier-btn", onClick: () => revealEarlier(b => b + THREAD_WINDOW_STEP_ROWS), children: "\u2191 Show earlier" }), _jsx("button", { type: "button", className: "bc-thread-earlier-btn bc-thread-earlier-all", onClick: () => revealEarlier(() => Number.POSITIVE_INFINITY), title: "Render the whole log \u2014 needed to find text with the browser's own search", children: "Show all" })] })), windowedBlocks.map((b, i) => b.kind === 'turn'
                            ? _jsx(TurnGroupView, { turnId: b.turnId, rows: b.rows, agent: agent }, `turn_${b.turnId}`)
                            : _jsx(LogRowView, { row: b.row, agent: agent }, `row_${b.row.key}_${windowStart + i}`)), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New messages" }))] }) }));
}
//# sourceMappingURL=Thread.js.map