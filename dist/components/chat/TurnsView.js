import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { UsageLine } from './UsageLine';
import { formatHMS } from './utils';
// Persisted on/off state for rendering assistant response bodies as markdown.
// Defaults to on; any value other than "off" is treated as enabled so the
// first-run default and unparseable values both render markdown.
const MD_PREF_KEY = 'bridge-turns-markdown';
function readMarkdownPref() {
    try {
        return localStorage.getItem(MD_PREF_KEY) !== 'off';
    }
    catch {
        return true;
    }
}
function ResponseBody({ text, markdown }) {
    if (markdown) {
        return (_jsx("div", { className: "bc-turns-text bc-turns-md", children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: text }) }));
    }
    return _jsx("div", { className: "bc-turns-text", children: text });
}
function rowsToTurns(rows) {
    // Within one assistant turn, the harness can emit several text blocks
    // separated by tool calls (e.g. "Let me check…" → tool → "Found it…" →
    // tool → "Done."). Each block is its own message_id, but they all share
    // a turn_id. Merge them into a single Turns item so the user sees one
    // assistant response per turn.
    //
    // Per-message dedup (text vs result) is preserved: while a message is
    // streaming we use its `text` row; once `result` lands we prefer the
    // result text for that message_id.
    // turnId -> set of message_ids that have a closed `result` row.
    const turnResultMsgIds = new Map();
    // turnId -> set of message_ids that contained at least one tool call.
    // Text in those messages is preamble/narration (the model talking before
    // or between tool invocations), not the final answer.
    const turnNarrationMsgIds = new Map();
    // Texts of user_message rows that have a canonical messageId. Used to drop
    // orphan optimistic rows when the SSE user_message arrived before /send's
    // response could patch the optimistic row's key into the same group.
    const canonicalUserTexts = new Set();
    for (const r of rows) {
        if (r.kind === 'result' && r.done && r.messageId && r.turnId) {
            let s = turnResultMsgIds.get(r.turnId);
            if (!s) {
                s = new Set();
                turnResultMsgIds.set(r.turnId, s);
            }
            s.add(r.messageId);
        }
        if (r.kind === 'tool' && r.messageId && r.turnId) {
            let s = turnNarrationMsgIds.get(r.turnId);
            if (!s) {
                s = new Set();
                turnNarrationMsgIds.set(r.turnId, s);
            }
            s.add(r.messageId);
        }
        if (r.kind === 'user_message' && r.messageId && r.text) {
            canonicalUserTexts.add(r.text);
        }
    }
    const out = [];
    const emittedTurns = new Set();
    for (const row of rows) {
        if (row.kind === 'user_message' && row.text) {
            if (!row.messageId && canonicalUserTexts.has(row.text))
                continue;
            // Collapse duplicate user_message rows for the same prompt. The
            // bridge records a user message from two independent ingestion
            // paths — stream-json / rollout tailer, and Claude Code's OTel
            // `user_prompt` log — so one prompt can land as two events with
            // different message_ids. Either source may be absent, so we don't
            // pick a winner: we drop a user_message whose text repeats the
            // immediately-preceding user item. The two duplicates always arrive
            // back-to-back (before the assistant responds), so an assistant or
            // system turn between two identical prompts breaks the run and a
            // genuine re-send of the same text still renders twice.
            const prevItem = out[out.length - 1];
            if (prevItem && prevItem.actor === 'user' && prevItem.text === row.text)
                continue;
            out.push({
                key: `tv_user_${row.key}`,
                actor: 'user',
                text: row.text,
                ts: row.timestamp,
                turnId: row.turnId,
            });
            continue;
        }
        if (row.kind === 'system' && row.subtype === 'compact_boundary') {
            out.push({
                key: `tv_compact_${row.key}`,
                actor: 'system',
                text: 'Context compacted',
                ts: row.timestamp,
                isMarker: true,
                markerKind: 'compact',
            });
            continue;
        }
        const isAssistantContent = row.kind === 'text' || row.kind === 'result' || row.kind === 'error' || row.kind === 'thinking';
        if (!isAssistantContent)
            continue;
        if (row.turnId) {
            if (emittedTurns.has(row.turnId))
                continue;
            emittedTurns.add(row.turnId);
            const dedup = turnResultMsgIds.get(row.turnId) ?? new Set();
            const narrationMsgIds = turnNarrationMsgIds.get(row.turnId) ?? new Set();
            const parts = [];
            const narrationParts = [];
            const thinkingParts = [];
            let hasError = false;
            let isStreaming = false;
            let turnDone = false;
            let lastUsage;
            for (const r of rows) {
                if (r.turnId !== row.turnId)
                    continue;
                if (r.kind === 'result' && r.done) {
                    const t = r.text || r.meta?.text;
                    if (t)
                        parts.push(t);
                    if (r.usage || r.meta?.usage)
                        lastUsage = r.usage || r.meta?.usage;
                    if (r.meta?.is_error)
                        hasError = true;
                    turnDone = true;
                }
                else if (r.kind === 'text' && r.text && !(r.messageId && dedup.has(r.messageId))) {
                    if (r.messageId && narrationMsgIds.has(r.messageId)) {
                        narrationParts.push(r.text);
                    }
                    else {
                        parts.push(r.text);
                    }
                    isStreaming = true;
                }
                else if (r.kind === 'thinking' && r.thinking) {
                    thinkingParts.push(r.thinking);
                }
                else if (r.kind === 'error' && r.errorMessage) {
                    parts.push(r.errorMessage);
                    hasError = true;
                    turnDone = true;
                }
            }
            const merged = parts.filter(Boolean).join('\n\n');
            const narration = narrationParts.filter(Boolean).join('\n\n');
            const thinking = thinkingParts.filter(Boolean).join('\n\n');
            if (merged || narration || thinking) {
                out.push({
                    key: `tv_turn_${row.turnId}`,
                    actor: 'assistant',
                    text: merged,
                    ts: row.timestamp,
                    turnId: row.turnId,
                    usage: lastUsage,
                    isError: hasError,
                    isStreaming,
                    thinking: thinking || undefined,
                    narration: narration || undefined,
                    turnDone,
                });
            }
            continue;
        }
        // No turnId — fall back to per-row emission (rare; old harnesses).
        if (row.kind === 'result' && row.done) {
            const text = row.text || row.meta?.text;
            if (text) {
                out.push({
                    key: `tv_res_${row.key}`,
                    actor: 'assistant',
                    text,
                    ts: row.timestamp,
                    usage: row.usage || row.meta?.usage,
                    isError: row.meta?.is_error,
                });
            }
        }
        else if (row.kind === 'text' && row.text) {
            out.push({
                key: `tv_txt_${row.key}`,
                actor: 'assistant',
                text: row.text,
                ts: row.timestamp,
                isStreaming: true,
            });
        }
        else if (row.kind === 'error' && row.errorMessage) {
            out.push({
                key: `tv_err_${row.key}`,
                actor: 'assistant',
                text: row.errorMessage,
                ts: row.timestamp,
                isError: true,
            });
        }
    }
    return out;
}
function TurnsAside({ variant, icon, label, text, live }) {
    const cls = `bc-turns-aside bc-turns-aside-${variant}${live ? ' bc-turns-aside-live' : ''}`;
    if (live) {
        return (_jsxs("div", { className: cls, children: [_jsxs("div", { className: "bc-turns-aside-label", children: [_jsx("span", { className: "bc-turns-aside-icon", "aria-hidden": true, children: icon }), _jsx("span", { children: label }), _jsx("span", { className: "bc-turns-aside-dots", "aria-hidden": true, children: "\u2026" })] }), _jsx("div", { className: "bc-turns-aside-text", children: text })] }));
    }
    return (_jsxs("details", { className: cls, children: [_jsxs("summary", { children: [_jsx("span", { className: "bc-turns-aside-icon", "aria-hidden": true, children: icon }), _jsx("span", { children: label })] }), _jsx("div", { className: "bc-turns-aside-text", children: text })] }));
}
export function TurnsView({ rows, agent, compacting, onToggleCollapse, style, paneKey }) {
    const { containerRef, endRef, isAtBottom, scrollToBottom } = useStickyBottomScroll();
    const items = useMemo(() => rowsToTurns(rows), [rows]);
    const [markdown, setMarkdown] = useState(readMarkdownPref);
    const onHeaderKey = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
        }
    }, [onToggleCollapse]);
    const toggleMarkdown = useCallback(() => {
        setMarkdown(prev => {
            const next = !prev;
            try {
                localStorage.setItem(MD_PREF_KEY, next ? 'on' : 'off');
            }
            catch { /* ignore */ }
            return next;
        });
    }, []);
    return (_jsxs("div", { className: "bc-turns-pane", style: style, "data-pane": paneKey, children: [_jsxs("div", { className: "bc-turns-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: onHeaderKey, role: "button", tabIndex: 0, title: "Hide turns", "aria-label": "Hide turns", children: [_jsx("span", { className: "bc-turns-title", children: "Turns" }), _jsx("span", { className: "bc-turns-count", children: items.length }), _jsx("span", { className: "bc-spacer" }), _jsx("button", { type: "button", className: "bc-turns-md-toggle", onClick: e => { e.stopPropagation(); toggleMarkdown(); }, title: markdown ? 'Rendering markdown — click to show raw text' : 'Showing raw text — click to render markdown', "aria-label": "Toggle markdown rendering", "aria-pressed": markdown, children: markdown ? 'MD' : 'TXT' }), _jsx("span", { className: "bc-turns-collapse-btn", "aria-hidden": "true", children: "\u00D7" })] }), _jsxs("div", { ref: containerRef, className: "bc-turns-body", children: [items.length === 0 && _jsx("div", { className: "bc-turns-empty", children: "No messages yet" }), items.map(it => {
                        if (it.isMarker) {
                            return (_jsxs("div", { className: `bc-turns-marker bc-turns-marker-${it.markerKind}`, role: "separator", children: [_jsx("span", { className: "bc-turns-marker-line", "aria-hidden": true }), _jsx("span", { className: "bc-turns-marker-text", children: it.text }), _jsx("span", { className: "bc-turns-marker-ts", children: formatHMS(it.ts) }), _jsx("span", { className: "bc-turns-marker-line", "aria-hidden": true })] }, it.key));
                        }
                        const hasAside = !!(it.thinking || it.narration);
                        const asideLive = hasAside && !it.turnDone;
                        return (_jsxs("div", { className: `bc-turns-item bc-turns-${it.actor}${it.isError ? ' bc-turns-error' : ''}${it.isStreaming ? ' bc-turns-streaming' : ''}`, children: [_jsxs("div", { className: "bc-turns-meta", children: [_jsx("span", { className: "bc-turns-actor", children: it.actor === 'user' ? 'You' : agent || 'assistant' }), _jsx("span", { className: "bc-turns-ts", children: formatHMS(it.ts) }), it.usage && _jsx(UsageLine, { usage: it.usage }), asideLive && it.thinking && _jsx("span", { className: "bc-turns-aside-tag bc-turns-aside-reasoning", children: "reasoning\u2026" }), asideLive && it.narration && _jsx("span", { className: "bc-turns-aside-tag bc-turns-aside-narration", children: "narration\u2026" }), it.isStreaming && !asideLive && _jsx("span", { className: "bc-turns-streaming-tag", children: "streaming\u2026" })] }), it.thinking && (_jsx(TurnsAside, { variant: "reasoning", icon: "\uD83D\uDCAD", label: "Reasoning", text: it.thinking, live: asideLive })), it.narration && (_jsx(TurnsAside, { variant: "narration", icon: "\uD83D\uDCAC", label: "Narration", text: it.narration, live: asideLive })), it.text && _jsx(ResponseBody, { text: it.text, markdown: markdown && it.actor === 'assistant' })] }, it.key));
                    }), compacting && (_jsxs("div", { className: "bc-turns-compacting", role: "status", "aria-live": "polite", children: [_jsx("span", { className: "bc-turns-compacting-bar", "aria-hidden": true }), _jsx("span", { className: "bc-turns-compacting-text", children: "Compacting context\u2026" })] })), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New messages" }))] }));
}
//# sourceMappingURL=TurnsView.js.map