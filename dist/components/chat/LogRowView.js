import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { ToolsSection } from '../tools';
import { MessageStats } from './MessageStats';
import { UsageLine } from './UsageLine';
import { formatHMS, groupEventsByType, idTail, shouldExpandByDefault } from './utils';
export function LogRowView({ row, agent, onResolveHook }) {
    const actorLabel = row.actor === 'user' ? 'You' : row.actor === 'system' ? 'system' : agent;
    const typeLabel = row.subtype ? `${row.kind}.${row.subtype}` : row.kind;
    const hasStructuredBody = !!(row.text || row.thinking || (row.tools && row.tools.length > 0)
        || row.usage || row.meta || row.systemMessage || row.systemFields
        || row.stateTransition || row.sessionInfo || row.errorMessage);
    const hasRaw = !!(row.events && row.events.length > 0);
    const canExpand = hasStructuredBody || hasRaw;
    const [collapsed, setCollapsed] = useState(() => !shouldExpandByDefault(row));
    const [showRaw, setShowRaw] = useState(() => !hasStructuredBody && hasRaw);
    return (_jsxs("div", { className: `bc-row bc-row-${row.actor}`, children: [_jsxs("div", { className: "bc-row-header", onClick: () => canExpand && setCollapsed(c => !c), children: [_jsx("span", { className: "bc-row-ts", children: formatHMS(row.timestamp) }), _jsx("span", { className: "bc-row-type", children: typeLabel }), _jsx("span", { className: "bc-row-actor", children: actorLabel }), _jsxs("span", { className: "bc-row-ids", children: [row.clientId && _jsxs("code", { title: "client id", className: "bc-row-id bc-row-id-cli", children: ["cli:", idTail(row.clientId)] }), row.clientRequestId && _jsxs("code", { title: "caller's per-turn request id", className: "bc-row-id bc-row-id-req", children: ["req:", idTail(row.clientRequestId)] }), row.turnId && _jsxs("code", { title: "bridge-server turn_id", className: "bc-row-id bc-row-id-turn", children: ["turn:", idTail(row.turnId)] }), row.messageId && _jsxs("code", { title: "bridge-server message_id", className: "bc-row-id bc-row-id-srv", children: ["srv:", idTail(row.messageId)] }), row.harnessMessageId && _jsxs("code", { title: "harness completion id", className: "bc-row-id bc-row-id-hid", children: ["hid:", idTail(row.harnessMessageId)] }), row.toolUseId && _jsxs("code", { title: "harness tool_use id", className: "bc-row-id bc-row-id-tu", children: ["tu:", idTail(row.toolUseId)] })] }), canExpand && _jsx("span", { className: "bc-row-collapse", children: collapsed ? '▸' : '▾' })] }), !collapsed && (_jsxs("div", { className: "bc-row-body", children: [row.text && _jsx("div", { className: "bc-row-text", children: row.text }), row.thinking && (_jsxs("details", { className: "bc-row-thinking", children: [_jsx("summary", { children: "thinking" }), _jsx("div", { className: "bc-row-thinking-text", children: row.thinking })] })), row.tools && row.tools.length > 0 && (_jsx(ToolsSection, { tools: row.tools, turnDone: !!row.done })), row.usage && _jsx(UsageLine, { usage: row.usage }), row.meta && _jsx(MessageStats, { meta: row.meta }), row.systemMessage && _jsx("div", { className: "bc-row-system", children: row.systemMessage }), row.systemFields && (_jsx("pre", { className: "bc-row-json", children: JSON.stringify(row.systemFields, null, 2) })), row.stateTransition && (_jsxs("div", { className: "bc-row-state", children: [row.stateTransition.from ?? '—', " \u2192 ", _jsx("strong", { children: row.stateTransition.to }), row.stateTransition.reason ? ` (${row.stateTransition.reason})` : ''] })), row.sessionInfo && (_jsxs("details", { className: "bc-row-info", children: [_jsx("summary", { children: "session info" }), _jsx("pre", { className: "bc-row-json", children: JSON.stringify(row.sessionInfo, null, 2) })] })), row.errorMessage && _jsx("div", { className: "bc-row-error", children: row.errorMessage }), row.hook && (_jsx(HookPanel, { hook: row.hook, onResolve: onResolveHook })), hasRaw && (_jsxs("div", { className: "bc-row-raw-wrap", children: [_jsx("button", { className: "bc-row-raw-toggle", onClick: e => { e.stopPropagation(); setShowRaw(s => !s); }, children: showRaw ? 'hide raw' : `raw (${row.events.length})` }), showRaw && (_jsx("div", { className: "bc-row-raw-groups", children: groupEventsByType(row.events).map(g => (_jsxs("details", { className: "bc-row-raw-group", children: [_jsxs("summary", { children: [g.type, " (", g.events.length, ")"] }), _jsx("pre", { className: "bc-row-json", children: JSON.stringify(g.events, null, 2) })] }, g.type))) }))] }))] }))] }));
}
// HookPanel renders the awaiting_resolution UI (allow/deny + optional input
// editor) for HookEvents whose phase is still pending. For completed hooks
// it shows a compact summary of the decision.
function HookPanel({ hook, onResolve }) {
    const phase = hook.phase;
    const requestID = hook.request_id || '';
    const initialInput = useMemo(() => hook.input ? JSON.stringify(hook.input, null, 2) : '', [hook.input]);
    const [edited, setEdited] = useState(initialInput);
    const [busy, setBusy] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const isPending = phase === 'awaiting_resolution' && !!requestID && !!onResolve;
    const submit = async (behavior) => {
        if (!onResolve || !requestID)
            return;
        setBusy(true);
        try {
            let updatedInput;
            if (showEdit && edited.trim() && edited.trim() !== initialInput.trim()) {
                try {
                    updatedInput = JSON.parse(edited);
                }
                catch (err) {
                    alert('Edited input is not valid JSON: ' + err.message);
                    setBusy(false);
                    return;
                }
            }
            await onResolve({ requestId: requestID, behavior, updatedInput, resolvedBy: 'user' });
        }
        finally {
            setBusy(false);
        }
    };
    if (!isPending) {
        return (_jsxs("div", { className: "bc-row-hook bc-row-hook-completed", children: [_jsx("span", { className: "bc-row-hook-label", children: phase }), hook.event && _jsx("code", { className: "bc-row-hook-event", children: hook.event }), hook.tool_name && _jsx("code", { className: "bc-row-hook-tool", children: hook.tool_name }), hook.decision && _jsx("strong", { className: "bc-row-hook-decision", children: hook.decision }), hook.resolution?.message && (_jsx("span", { className: "bc-row-hook-msg", children: hook.resolution.message }))] }));
    }
    return (_jsxs("div", { className: "bc-row-hook bc-row-hook-pending", children: [_jsxs("div", { className: "bc-row-hook-header", children: [_jsx("strong", { className: "bc-row-hook-label", children: "awaiting approval" }), hook.source && _jsx("code", { className: "bc-row-hook-source", children: hook.source }), hook.event && _jsx("code", { className: "bc-row-hook-event", children: hook.event }), hook.tool_name && _jsx("code", { className: "bc-row-hook-tool", children: hook.tool_name })] }), initialInput && (_jsxs("details", { className: "bc-row-hook-input", open: showEdit, onToggle: (e) => setShowEdit(e.target.open), children: [_jsxs("summary", { children: ["tool input (", showEdit ? 'editable' : 'view', ")"] }), showEdit ? (_jsx("textarea", { className: "bc-row-hook-editor", value: edited, onChange: (e) => setEdited(e.target.value), spellCheck: false, rows: Math.min(20, Math.max(4, edited.split('\n').length)) })) : (_jsx("pre", { className: "bc-row-json", children: initialInput }))] })), _jsxs("div", { className: "bc-row-hook-actions", children: [_jsx("button", { type: "button", className: "bc-row-hook-allow", disabled: busy, onClick: () => submit('allow'), children: busy ? '…' : 'Allow' }), _jsx("button", { type: "button", className: "bc-row-hook-deny", disabled: busy, onClick: () => submit('deny'), children: busy ? '…' : 'Deny' })] })] }));
}
export function groupRowsByTurn(rows) {
    const out = [];
    let current = null;
    for (const r of rows) {
        if (r.turnId) {
            if (current && current.turnId === r.turnId) {
                current.rows.push(r);
            }
            else {
                if (current)
                    out.push(current);
                current = { kind: 'turn', turnId: r.turnId, rows: [r] };
            }
        }
        else {
            if (current) {
                out.push(current);
                current = null;
            }
            out.push({ kind: 'standalone', row: r });
        }
    }
    if (current)
        out.push(current);
    return out;
}
function turnSummary(rows) {
    let userText;
    let toolCount = 0;
    let done = false;
    let errored = false;
    let totalUsage;
    for (const r of rows) {
        if (r.actor === 'user' && !userText && r.text)
            userText = r.text;
        if (r.tools)
            toolCount += r.tools.length;
        if (r.eventType === 'result' && r.done) {
            done = true;
            totalUsage = r.usage ?? r.meta?.usage ?? totalUsage;
        }
        if (r.errorMessage) {
            errored = true;
            done = true;
        }
    }
    return { userText, toolCount, done, errored, totalUsage };
}
export function TurnGroupView({ turnId, rows, agent, onResolveHook }) {
    const [collapsed, setCollapsed] = useState(false);
    const summary = useMemo(() => turnSummary(rows), [rows]);
    const snippet = summary.userText
        ? (summary.userText.length > 80 ? summary.userText.slice(0, 80) + '…' : summary.userText)
        : '(no user text)';
    return (_jsxs("div", { className: `bc-turn${summary.errored ? ' bc-turn-error' : summary.done ? ' bc-turn-done' : ' bc-turn-live'}`, children: [_jsxs("div", { className: "bc-turn-header", onClick: () => setCollapsed(c => !c), children: [_jsx("span", { className: "bc-turn-chevron", children: collapsed ? '▸' : '▾' }), _jsx("span", { className: "bc-turn-label", children: "Turn" }), _jsxs("code", { className: "bc-row-id bc-row-id-turn", title: "bridge-server turn_id", children: ["turn:", idTail(turnId)] }), _jsx("span", { className: "bc-turn-snippet", children: snippet }), _jsx("span", { className: "bc-turn-spacer" }), _jsxs("span", { className: "bc-turn-count", children: [rows.length, " event", rows.length === 1 ? '' : 's'] }), summary.toolCount > 0 && _jsxs("span", { className: "bc-turn-tools", children: [summary.toolCount, " tool", summary.toolCount === 1 ? '' : 's'] }), summary.totalUsage && _jsx(UsageLine, { usage: summary.totalUsage }), !summary.done && _jsxs("span", { className: "bc-turn-running", children: [_jsx("span", { className: "bc-pulse" }), " running"] })] }), !collapsed && (_jsx("div", { className: "bc-turn-body", children: rows.map(row => _jsx(LogRowView, { row: row, agent: agent, onResolveHook: onResolveHook }, row.key)) }))] }));
}
//# sourceMappingURL=LogRowView.js.map