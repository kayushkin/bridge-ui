import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useMemo } from 'react';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { formatTokens } from '../../utils';
import { formatHMS, oneLine, sameItemFields, toolFullText, toolSnippet } from './utils';
function rowsToTimeline(rows) {
    const out = [];
    const seenTurn = new Set();
    const taskIdxByScope = new Map();
    let currentTurnId;
    let currentTaskId;
    for (const row of rows) {
        if (row.turnId !== currentTurnId) {
            currentTurnId = row.turnId;
            currentTaskId = undefined;
            taskIdxByScope.clear();
        }
        if (row.kind === 'user_message') {
            currentTaskId = undefined;
            const turnMark = row.turnId && !seenTurn.has(row.turnId);
            if (row.turnId)
                seenTurn.add(row.turnId);
            out.push({
                key: `tl_turn_${row.key}`,
                turnId: row.turnId,
                icon: turnMark ? '▶' : '»',
                label: 'Turn',
                detail: row.text ? oneLine(row.text) : undefined,
                fullText: row.text,
                ts: row.timestamp,
                tone: 'turn',
            });
            continue;
        }
        if (row.kind === 'system' && row.subtype && row.subtype.startsWith('task_')) {
            const raw = row.events[0]?.raw;
            const explicitId = row.systemFields?.task_id
                || (typeof raw?.task_id === 'string' ? raw.task_id : undefined);
            const isStart = row.subtype === 'task_started';
            if (isStart) {
                currentTaskId = explicitId || `task_${row.key}`;
            }
            else if (explicitId && !currentTaskId) {
                currentTaskId = explicitId;
            }
            const description = row.systemFields?.description
                || (typeof raw?.description === 'string' ? raw.description : undefined);
            const lastTool = row.systemFields?.last_tool_name
                || (typeof raw?.last_tool_name === 'string' ? raw.last_tool_name : undefined);
            const taskType = typeof raw?.task_type === 'string' ? raw.task_type : undefined;
            const full = description || row.systemMessage || lastTool || taskType || '';
            if (currentTaskId && taskIdxByScope.has(currentTaskId)) {
                const idx = taskIdxByScope.get(currentTaskId);
                const existing = out[idx];
                if (!existing.detail && full) {
                    existing.detail = oneLine(full);
                    existing.fullText = full;
                }
                continue;
            }
            out.push({
                key: `tl_task_${row.key}`,
                turnId: row.turnId,
                taskId: currentTaskId,
                icon: '▣',
                label: 'Task',
                detail: full ? oneLine(full) : undefined,
                fullText: full || undefined,
                ts: row.timestamp,
                tone: 'task-start',
            });
            if (currentTaskId)
                taskIdxByScope.set(currentTaskId, out.length - 1);
            continue;
        }
        if (row.kind === 'thinking' && row.thinking) {
            out.push({
                key: `tl_think_${row.key}`,
                turnId: row.turnId,
                taskId: currentTaskId,
                icon: '💭',
                label: 'Thinking',
                detail: oneLine(row.thinking),
                fullText: row.thinking,
                ts: row.timestamp,
                tone: 'thinking',
            });
            continue;
        }
        if (row.kind === 'tool' && row.tools && row.tools.length > 0) {
            for (const t of row.tools) {
                const done = t.output !== undefined;
                const err = !!t.error;
                out.push({
                    key: `tl_tool_${row.key}_${t.tool_id || t.tool}`,
                    turnId: row.turnId,
                    taskId: currentTaskId,
                    icon: err ? '✗' : done ? '✓' : '⚙',
                    label: t.tool || 'tool',
                    detail: toolSnippet(t),
                    fullText: toolFullText(t),
                    ts: row.timestamp,
                    tone: err ? 'tool-err' : done ? 'tool-done' : 'tool',
                });
            }
            continue;
        }
        if (row.kind === 'result' && row.done) {
            currentTaskId = undefined;
            const u = row.usage || row.meta?.usage;
            let detail;
            if (u) {
                const parts = [];
                if (u.input_tokens)
                    parts.push(`in ${formatTokens(u.input_tokens)}`);
                if (u.output_tokens)
                    parts.push(`out ${formatTokens(u.output_tokens)}`);
                detail = parts.join(' · ') || undefined;
            }
            out.push({
                key: `tl_res_${row.key}`,
                turnId: row.turnId,
                icon: '■',
                label: 'Done',
                detail,
                fullText: row.text || row.meta?.text,
                ts: row.timestamp,
                tone: 'result',
            });
            continue;
        }
        if (row.kind === 'error' || row.errorMessage) {
            out.push({
                key: `tl_err_${row.key}`,
                turnId: row.turnId,
                taskId: currentTaskId,
                icon: '⚠',
                label: 'Error',
                detail: row.errorMessage ? oneLine(row.errorMessage) : undefined,
                fullText: row.errorMessage,
                ts: row.timestamp,
                tone: 'error',
            });
            continue;
        }
        if (row.kind === 'text' && row.text) {
            out.push({
                key: `tl_text_${row.key}`,
                turnId: row.turnId,
                taskId: currentTaskId,
                icon: '✎',
                label: 'Text',
                detail: oneLine(row.text),
                fullText: row.text,
                ts: row.timestamp,
                tone: 'text',
            });
            continue;
        }
    }
    return out;
}
// Memoized on the item's fields rather than its identity: `rowsToTimeline`
// rebuilds every item on every delta, so identity always differs, but an item
// derived from a row no event touched has identical fields. Measured with
// `npm run pane-cost`, the worst session on this host puts 11,510 elements in
// this pane — all of them re-rendered per delta without this.
const TimelineItemRow = memo(function TimelineItemRow({ item }) {
    const tip = item.fullText || item.detail || item.label;
    return (_jsxs("div", { className: `bc-tl-item bc-tl-${item.tone}`, title: tip, children: [_jsx("span", { className: "bc-tl-ts", children: formatHMS(item.ts) }), _jsx("span", { className: "bc-tl-icon", children: item.icon }), _jsx("span", { className: "bc-tl-label", children: item.label }), item.detail && _jsx("span", { className: "bc-tl-detail", children: item.detail })] }));
}, (prev, next) => sameItemFields(prev.item, next.item));
function renderTurnChildren(items) {
    const out = [];
    let i = 0;
    while (i < items.length) {
        const it = items[i];
        if (!it.taskId) {
            out.push(_jsx(TimelineItemRow, { item: it }, it.key));
            i++;
            continue;
        }
        const taskId = it.taskId;
        const start = i;
        while (i < items.length && items[i].taskId === taskId)
            i++;
        const [header, ...rest] = items.slice(start, i);
        out.push(_jsxs("div", { className: "bc-tl-task-group", children: [_jsx("div", { className: "bc-tl-task-header", children: _jsx(TimelineItemRow, { item: header }, header.key) }), rest.length > 0 && (_jsx("div", { className: "bc-tl-task-body", children: rest.map(t => _jsx(TimelineItemRow, { item: t }, t.key)) }))] }, `tk_${taskId}_${start}`));
    }
    return out;
}
function renderTimelineNodes(items) {
    const out = [];
    let i = 0;
    while (i < items.length) {
        const it = items[i];
        if (!it.turnId) {
            out.push(_jsx(TimelineItemRow, { item: it }, it.key));
            i++;
            continue;
        }
        const turnId = it.turnId;
        const start = i;
        while (i < items.length && items[i].turnId === turnId)
            i++;
        const [header, ...rest] = items.slice(start, i);
        out.push(_jsxs("div", { className: "bc-tl-turn-group", children: [_jsx("div", { className: "bc-tl-turn-header", children: _jsx(TimelineItemRow, { item: header }, header.key) }), rest.length > 0 && (_jsx("div", { className: "bc-tl-turn-body", children: renderTurnChildren(rest) }))] }, `tg_${turnId}_${start}`));
    }
    return out;
}
export function Timeline({ rows, onToggleCollapse, style, paneKey }) {
    const { containerRef, endRef, isAtBottom, scrollToBottom } = useStickyBottomScroll();
    const items = useMemo(() => rowsToTimeline(rows), [rows]);
    const onHeaderKey = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
        }
    }, [onToggleCollapse]);
    return (_jsxs("div", { className: "bc-timeline", style: style, "data-pane": paneKey, children: [_jsxs("div", { className: "bc-timeline-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: onHeaderKey, role: "button", tabIndex: 0, title: "Hide timeline", "aria-label": "Hide timeline", children: [_jsx("span", { className: "bc-timeline-title", children: "Timeline" }), _jsx("span", { className: "bc-timeline-count", children: items.length }), _jsx("span", { className: "bc-spacer" }), _jsx("span", { className: "bc-timeline-collapse-btn", "aria-hidden": "true", children: "\u00D7" })] }), _jsxs("div", { ref: containerRef, className: "bc-timeline-body", children: [items.length === 0 && _jsx("div", { className: "bc-timeline-empty", children: "No events yet" }), renderTimelineNodes(items), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New events" }))] }));
}
//# sourceMappingURL=Timeline.js.map