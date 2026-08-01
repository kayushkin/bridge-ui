import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStickyBottomScroll } from '../../useStickyBottomScroll';
import { UsageLine } from './UsageLine';
import { formatHMS, sameItemFields } from './utils';
import { remarkRefChips } from './refChips/remarkRefChips';
import { RefChip } from './refChips/RefChip';
// remark plugins and the components map are module constants so react-markdown
// sees stable references across renders. `ref-chip` is the custom hast element
// remarkRefChips emits for a detected session/todo id; react-markdown routes it
// to the RefChip component. The cast lets the map carry a non-HTML tag name.
const REMARK_PLUGINS = [remarkGfm, remarkRefChips];
const MD_COMPONENTS = { 'ref-chip': RefChip };
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
        return (_jsx("div", { className: "bc-turns-text bc-turns-md", children: _jsx(ReactMarkdown, { remarkPlugins: REMARK_PLUGINS, components: MD_COMPONENTS, children: text }) }));
    }
    return _jsx("div", { className: "bc-turns-text", children: text });
}
// Claude Code reports every prompt twice: once through the stream-json /
// rollout parser, and once through its OTel `user_prompt` log. The two land as
// separate events with distinct message_ids AND distinct turn_ids, so there is
// no shared id to correlate them by — but llm-bridge-claudecode tags the OTel
// copy `extensions.source = "otel"` (otel.go tagOTelSource) precisely so
// consumers can tell the copies apart. Read that tag rather than guessing.
function isOTelSourced(row) {
    return row.events.some((e) => {
        const source = e.extensions?.source;
        return source === 'otel';
    });
}
// Claude Code injects internal notifications into the conversation as
// user-role messages (e.g. the "no completion record was found for this
// background shell command" note emitted on session resume). CC marks them
// with `origin.kind: "task-notification"`, but the history-replay path
// materializes them as plain user_message rows, so they surface in Turns as
// if the user had typed them. Their content is exactly a single
// `<task-notification>…</task-notification>` block — match that sentinel to
// drop them from the conversation view without touching the raw event log.
// Anchored start+end so a real prompt that merely *quotes* a notification
// (as opposed to being one) still renders.
function isHarnessNotification(text) {
    const t = text.trim();
    return t.startsWith('<task-notification>') && t.endsWith('</task-notification>');
}
// Assistant responses can reach the render edge from two sources, exactly like
// user prompts. The stream-json / rollout parser is authoritative for the
// assistant's text on the healthy path; llm-bridge-claudecode additionally
// carries Claude Code's OTel `assistant_response` log as a last-resort recovery
// for turns where stream-json emits no `result` (the drainUntilResult hang —
// parent todo a367a8d1). That OTel copy is tagged `extensions.source = "otel"`
// with the same tag `tagOTelSource` stamps on the user_prompt copy, and — like
// the prompt copies — it carries its own message_id / turn_id with no shared
// correlation id, so text is the only key.
//
// When both copies exist the OTel one is redundant and must not double-render;
// when only the OTel copy exists (stream-json dropped the final turn) it must
// still render, because that is the recovery. Absorb OTel assistant copies
// against a per-text COUNT of harness-sourced copies — never by adjacency (the
// OTel exporter batches ~1s, so the copy can land after the reply) and never
// with a Set (N harness copies absorb N OTel copies; any surplus OTel copy
// still renders, keeping the two sources genuinely redundant). This mirrors the
// user_message dedup inside rowsToTurns below.
//
// Exported for isolated unit testing: the mechanism must be provable without a
// live dual-emit, because the OTel assistant_response emit (sibling child todo)
// has not landed yet — this is defensive infra ahead of its consumer.
export function dedupOTelAssistantRows(rows) {
    // Count harness-sourced (non-OTel) assistant text per exact text value.
    const harnessAssistantTextCounts = new Map();
    for (const r of rows) {
        if (r.actor !== 'assistant')
            continue;
        if (r.kind !== 'text' && r.kind !== 'result')
            continue;
        const t = r.text || r.meta?.text;
        if (!t)
            continue;
        if (!isOTelSourced(r)) {
            harnessAssistantTextCounts.set(t, (harnessAssistantTextCounts.get(t) ?? 0) + 1);
        }
    }
    if (harnessAssistantTextCounts.size === 0)
        return rows;
    return rows.filter((r) => {
        if (r.actor !== 'assistant')
            return true;
        if (r.kind !== 'text' && r.kind !== 'result')
            return true;
        const t = r.text || r.meta?.text;
        if (!t)
            return true;
        if (!isOTelSourced(r))
            return true;
        const remaining = harnessAssistantTextCounts.get(t) ?? 0;
        if (remaining > 0) {
            // A harness copy stands in for this OTel copy — drop it.
            harnessAssistantTextCounts.set(t, remaining - 1);
            return false;
        }
        // Unmatched OTel copy — keep it; this is the recovered final turn.
        return true;
    });
}
// Exported so the grouping can be measured and diffed outside React. This runs
// on every render of every open pane, and a chat pane re-renders once per SSE
// delta, so its cost is the single hottest thing in the chat surface.
export function rowsToTurns(inputRows) {
    // Drop the redundant OTel copy of an assistant response before anything else
    // consumes the rows, so turn detection, merging, and the fallback per-row
    // path all see the deduped view. User-prompt dedup stays inline below.
    const rows = dedupOTelAssistantRows(inputRows);
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
    // How many harness-sourced (non-OTel) user_message rows exist per prompt text.
    // Used to absorb the redundant OTel copy of the same prompt. This counts
    // rather than using a Set so the two sources stay genuinely redundant: N
    // harness copies absorb N OTel copies, and any surplus OTel copy still
    // renders. So if either source drops an event in transit, the prompt still
    // appears exactly once — and a real re-send of identical text still appears
    // twice, because it contributes its own harness copy to the count.
    const harnessUserTextCounts = new Map();
    // turnId -> every row carrying that turnId, in document order. Merging a turn
    // needs all of its rows, and they are scattered through the log; collecting
    // them in this pass costs one walk of the rows for the whole log. Rescanning
    // the full log per turn instead — which is what this did before — is
    // rows × turns work on every render, and both factors grow with the session.
    const rowsByTurnId = new Map();
    for (const r of rows) {
        if (r.turnId) {
            const turnRows = rowsByTurnId.get(r.turnId);
            if (turnRows)
                turnRows.push(r);
            else
                rowsByTurnId.set(r.turnId, [r]);
        }
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
            if (!isOTelSourced(r)) {
                harnessUserTextCounts.set(r.text, (harnessUserTextCounts.get(r.text) ?? 0) + 1);
            }
        }
    }
    const out = [];
    const emittedTurns = new Set();
    for (const row of rows) {
        if (row.kind === 'user_message' && row.text) {
            // Harness-injected notifications aren't user turns — drop them.
            if (isHarnessNotification(row.text))
                continue;
            if (!row.messageId && canonicalUserTexts.has(row.text))
                continue;
            // Drop the OTel copy of a prompt only when a harness-sourced copy exists
            // to stand in for it. This cannot be a positional check: Claude Code's
            // OTel exporter batches on a ~1s interval, so when the assistant starts
            // replying before that batch flushes, the OTel copy lands *after* the
            // reply and is no longer adjacent to the prompt it duplicates.
            // Unmatched OTel rows must still render — in PTY mode the OTel log is
            // the only source for what the user typed (keystrokes go through the pty
            // fd, never through /send), so there is no harness copy to pair with.
            if (isOTelSourced(row)) {
                const unabsorbed = harnessUserTextCounts.get(row.text) ?? 0;
                if (unabsorbed > 0) {
                    harnessUserTextCounts.set(row.text, unabsorbed - 1);
                    continue;
                }
            }
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
            let hasStreamedText = false;
            let turnDone = false;
            let lastUsage;
            for (const r of rowsByTurnId.get(row.turnId) ?? []) {
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
                    hasStreamedText = true;
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
                    hasStreamedText,
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
                hasStreamedText: true,
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
    // Only the last assistant turn can still be running. Every earlier one is
    // finished by construction — another turn started after it — and that fact
    // holds whatever the harness emitted, which is what makes it worth
    // computing. No completion event can carry this on its own: across this
    // host's whole event log, 748 of the 6,897 Claude Code turns that produced
    // assistant text emit no result, no turn_complete and no error, so a
    // "finished" test that reads only turnDone is wrong for about one turn in
    // nine. Whether the final turn is running is a question about the session,
    // not the log; TurnsView answers it from the session's own state.
    for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].actor === 'assistant' && !out[i].isMarker) {
            out[i].isFinalAssistantTurn = true;
            break;
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
// One rendered row of the Turns pane — a compact marker or a full turn.
//
// It exists as its own component so it can carry a memo boundary, and it is
// the boundary that pays most in this pane. Turns holds far fewer rows than
// Thread or Timeline — `rowsToTurns` collapses a whole turn's events into one
// item, so the worst session on this host is 105 items here against 11,968
// Thread rows — but each row is the most expensive kind there is: an assistant
// body is a full `ReactMarkdown` parse and render. Per element this pane costs
// several times what the other two do (`npm run pane-cost` measures it), so
// skipping an unchanged turn skips a markdown re-parse, not just a few spans.
//
// That gap is widest exactly where it hurts. One session on this host arrives
// as 13,776 events that collapse to four turns, each holding megabytes of
// text; rendering that pane once takes minutes. Before this boundary the pane
// re-paid it on every delta.
//
// Compared on fields, not identity: `rowsToTurns` rebuilds every item on every
// delta. `harnessWorking` is a prop rather than something folded into the item
// because it is a fact about the session, not the log — see rowsToTurns.
const TurnRow = memo(function TurnRow({ item, agent, markdown, harnessWorking }) {
    if (item.isMarker) {
        return (_jsxs("div", { className: `bc-turns-marker bc-turns-marker-${item.markerKind}`, role: "separator", children: [_jsx("span", { className: "bc-turns-marker-line", "aria-hidden": true }), _jsx("span", { className: "bc-turns-marker-text", children: item.text }), _jsx("span", { className: "bc-turns-marker-ts", children: formatHMS(item.ts) }), _jsx("span", { className: "bc-turns-marker-line", "aria-hidden": true })] }));
    }
    // A turn is live only if all three agree: it is the last one, no
    // completion event closed it, and the harness is still working.
    // Any one of them alone is the bug this replaced — turnDone is
    // missing on about one turn in nine, and the last turn of a
    // finished session is not running just because nothing closed it.
    const turnIsLive = !!item.isFinalAssistantTurn && !item.turnDone && !!harnessWorking;
    const hasAside = !!(item.thinking || item.narration);
    const asideLive = hasAside && turnIsLive;
    const streaming = turnIsLive && !!item.hasStreamedText;
    return (_jsxs("div", { className: `bc-turns-item bc-turns-${item.actor}${item.isError ? ' bc-turns-error' : ''}${streaming ? ' bc-turns-streaming' : ''}`, children: [_jsxs("div", { className: "bc-turns-meta", children: [_jsx("span", { className: "bc-turns-actor", children: item.actor === 'user' ? 'You' : agent || 'assistant' }), _jsx("span", { className: "bc-turns-ts", children: formatHMS(item.ts) }), item.usage && _jsx(UsageLine, { usage: item.usage }), asideLive && item.thinking && _jsx("span", { className: "bc-turns-aside-tag bc-turns-aside-reasoning", children: "reasoning\u2026" }), asideLive && item.narration && _jsx("span", { className: "bc-turns-aside-tag bc-turns-aside-narration", children: "narration\u2026" }), streaming && !asideLive && _jsx("span", { className: "bc-turns-streaming-tag", children: "streaming\u2026" })] }), item.thinking && (_jsx(TurnsAside, { variant: "reasoning", icon: "\uD83D\uDCAD", label: "Reasoning", text: item.thinking, live: asideLive })), item.narration && (_jsx(TurnsAside, { variant: "narration", icon: "\uD83D\uDCAC", label: "Narration", text: item.narration, live: asideLive })), item.text && _jsx(ResponseBody, { text: item.text, markdown: markdown && item.actor === 'assistant' })] }));
}, (prev, next) => prev.agent === next.agent
    && prev.markdown === next.markdown
    && prev.harnessWorking === next.harnessWorking
    && sameItemFields(prev.item, next.item));
export function TurnsView({ rows, agent, compacting, harnessWorking, onToggleCollapse, style, paneKey }) {
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
    return (_jsxs("div", { className: "bc-turns-pane", style: style, "data-pane": paneKey, children: [_jsxs("div", { className: "bc-turns-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: onHeaderKey, role: "button", tabIndex: 0, title: "Hide turns", "aria-label": "Hide turns", children: [_jsx("span", { className: "bc-turns-title", children: "Turns" }), _jsx("span", { className: "bc-turns-count", children: items.length }), _jsx("span", { className: "bc-spacer" }), _jsx("button", { type: "button", className: "bc-turns-md-toggle", onClick: e => { e.stopPropagation(); toggleMarkdown(); }, title: markdown ? 'Rendering markdown — click to show raw text' : 'Showing raw text — click to render markdown', "aria-label": "Toggle markdown rendering", "aria-pressed": markdown, children: markdown ? 'MD' : 'TXT' }), _jsx("span", { className: "bc-turns-collapse-btn", "aria-hidden": "true", children: "\u00D7" })] }), _jsxs("div", { ref: containerRef, className: "bc-turns-body", children: [items.length === 0 && _jsx("div", { className: "bc-turns-empty", children: "No messages yet" }), items.map(it => (_jsx(TurnRow, { item: it, agent: agent, markdown: markdown, harnessWorking: harnessWorking }, it.key))), compacting && (_jsxs("div", { className: "bc-turns-compacting", role: "status", "aria-live": "polite", children: [_jsx("span", { className: "bc-turns-compacting-bar", "aria-hidden": true }), _jsx("span", { className: "bc-turns-compacting-text", children: "Compacting context\u2026" })] })), _jsx("div", { ref: endRef })] }), !isAtBottom && (_jsx("button", { type: "button", className: "bc-jump-latest", onClick: () => scrollToBottom(), title: "Jump to latest", "aria-label": "Jump to latest", children: "\u2193 New messages" }))] }));
}
//# sourceMappingURL=TurnsView.js.map