import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridgeConfig } from '../context';
import { formatCost } from '../utils';
import { ProducerMarkdown, ProducerTextWithReferenceChips } from './chat/producerReferences';
/** Reads a producer response, or throws with the status. Every panel below
 *  surfaces what this throws — an orchestrator page that quietly shows stale
 *  numbers when the producer is down is worse than one that says so. */
async function producerJSON(response) {
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return (await response.json());
}
function messageOf(e) {
    return e instanceof Error ? e.message : String(e);
}
export function BridgeOrchestrator({ expandSessionsWithOpenQuestions = true, } = {}) {
    const { producerBasePath } = useBridgeConfig();
    if (!producerBasePath) {
        return (_jsxs("div", { className: "bc-orchestrator", style: page, children: [_jsx("h1", { style: { margin: 0 }, children: "\uD83C\uDFAC Orchestrator" }), _jsxs("p", { style: { opacity: 0.7 }, children: ["No producer configured \u2014 set ", _jsx("code", { children: "producerBasePath" }), " on BridgeProvider."] })] }));
    }
    return (_jsxs("div", { className: "bc-orchestrator", style: page, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }, children: [_jsx("h1", { style: { margin: 0 }, children: "\uD83C\uDFAC Orchestrator" }), _jsx("span", { style: { fontSize: 13, opacity: 0.7 }, children: "a stateless-per-run session manager \u2014 not a chat session" }), _jsx("span", { style: { marginLeft: 'auto' }, children: _jsx(CostHeader, {}) })] }), _jsx(Conversation, { expandSessionsWithOpenQuestions: expandSessionsWithOpenQuestions }), _jsx(Runs, { expandSessionsWithOpenQuestions: expandSessionsWithOpenQuestions }), _jsx(ContextInspector, {})] }));
}
/** The producer's own polling cadence for the read-only panels. */
const REFRESH_MS = 20000;
/** Poll one producer endpoint, keeping whatever it last answered and the reason
 *  the latest attempt failed. Both, deliberately: a failed refresh must not blank
 *  a panel that is still showing the last good answer, and it must not be
 *  invisible either. */
function useProducerResource(path, initial) {
    const { fetch: apiFetch, producerBasePath } = useBridgeConfig();
    const [data, setData] = useState(initial);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        if (!producerBasePath)
            return;
        try {
            setData(await producerJSON(await apiFetch(`${producerBasePath}${path}`)));
            setError(null);
        }
        catch (e) {
            setError(messageOf(e));
        }
    }, [apiFetch, producerBasePath, path]);
    useEffect(() => {
        void load();
        const timer = setInterval(() => void load(), REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);
    return { data, error };
}
function CostHeader() {
    const { data, error } = useProducerResource('/cost', null);
    const [open, setOpen] = useState(false);
    if (error && !data)
        return _jsxs("span", { style: { color: '#ef4444', fontSize: 12 }, children: ["cost: ", error] });
    if (!data)
        return null;
    const windows = data.windows;
    const week = windows.week?.cost_usd ?? 0;
    const over = data.week_limit_usd > 0 && week >= data.week_limit_usd;
    const rows = [
        ['this week', windows.week],
        ['last 24h', windows.last_24h],
        ['last 7 days', windows.last_7d],
        ['lifetime', windows.lifetime],
    ];
    return (_jsxs("span", { className: "bc-orchestrator-cost", style: { position: 'relative', display: 'inline-block' }, children: [_jsxs("button", { onClick: () => setOpen((o) => !o), style: { ...pill, color: over ? '#ef4444' : 'inherit' }, children: ["week ", formatCost(week), " / ", formatCost(data.week_limit_usd), " \u00B7 ", windows.week?.runs ?? 0, " runs \u25BE"] }), open && (_jsx("div", { style: dropdown, children: rows.map(([label, costWindow]) => (_jsxs("div", { style: { display: 'flex', gap: 16, padding: '3px 4px', fontSize: 13 }, children: [_jsx("span", { style: { opacity: 0.7, minWidth: 90 }, children: label }), _jsx("span", { style: { marginLeft: 'auto' }, children: formatCost(costWindow?.cost_usd ?? 0) }), _jsxs("span", { style: { opacity: 0.5, minWidth: 48, textAlign: 'right' }, children: [costWindow?.runs ?? 0, " runs"] })] }, label))) }))] }));
}
function Conversation({ expandSessionsWithOpenQuestions, }) {
    const { fetch: apiFetch, producerBasePath } = useBridgeConfig();
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    const endRef = useRef(null);
    const load = useCallback(async () => {
        try {
            setMessages(await producerJSON(await apiFetch(`${producerBasePath}/convo`)));
        }
        catch (e) {
            setError(messageOf(e));
        }
    }, [apiFetch, producerBasePath]);
    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        endRef.current?.scrollIntoView();
    }, [messages]);
    const send = async () => {
        const message = draft.trim();
        if (!message || running)
            return;
        setDraft('');
        setRunning(true);
        setError(null);
        // Optimistic echo of what was just sent, replaced by the server's own copy
        // when the run finishes and /convo is re-read.
        setMessages((m) => [...m, { id: 'pending', role: 'user', content: message, tokens: 0, at: '' }]);
        try {
            const response = await apiFetch(`${producerBasePath}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, trigger: 'user' }),
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => ({})));
                throw new Error(body.error || `HTTP ${response.status}`);
            }
            await response.json();
        }
        catch (e) {
            setError(messageOf(e));
        }
        finally {
            setRunning(false);
            void load();
        }
    };
    return (_jsxs("section", { className: "bc-orchestrator-conversation", style: card, children: [_jsxs("div", { style: cardHeader, children: ["Conversation ", _jsx("span", { style: { opacity: 0.5, fontWeight: 400 }, children: "\u00B7 each send is one run" })] }), _jsxs("div", { style: {
                    maxHeight: 380,
                    overflow: 'auto',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                }, children: [messages.length === 0 && (_jsx("div", { style: { opacity: 0.5, fontSize: 13 }, children: "No conversation yet \u2014 ask the orchestrator something." })), messages.map((m, i) => (_jsxs("div", { className: "bc-orchestrator-message", "data-role": m.role, style: { alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }, children: [_jsx("div", { style: { fontSize: 10, opacity: 0.5, marginBottom: 2 }, children: m.role }), _jsx("div", { style: {
                                    background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                                    color: m.role === 'user' ? 'var(--accent-on,#fff)' : 'inherit',
                                    border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                                    padding: '8px 11px',
                                    borderRadius: 10,
                                    fontSize: 13,
                                }, children: m.role === 'user' ? (_jsx("div", { style: { whiteSpace: 'pre-wrap' }, children: _jsx(ProducerTextWithReferenceChips, { text: m.content }) })) : (_jsx(ProducerMarkdown, { text: m.content, expandSessionsWithOpenQuestions: expandSessionsWithOpenQuestions })) })] }, m.id + i))), running && _jsx("div", { style: { opacity: 0.6, fontSize: 13 }, children: "orchestrator running\u2026" }), _jsx("div", { ref: endRef })] }), error && _jsx("div", { style: { color: '#ef4444', fontSize: 12, padding: '0 12px 6px' }, children: error }), _jsxs("div", { className: "bc-composer", style: { margin: 12 }, children: [_jsx("textarea", { className: "bc-composer-input", value: draft, disabled: running, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void send();
                            }
                        }, placeholder: "Ask the orchestrator\u2026 (Enter to send)", rows: 2 }), _jsx("div", { className: "bc-composer-actions", children: _jsx("button", { className: "bc-composer-btn", onClick: () => void send(), disabled: running || !draft.trim(), children: running ? '…' : 'Send' }) })] })] }));
}
function Runs({ expandSessionsWithOpenQuestions, }) {
    const { data: runs, error } = useProducerResource('/runs?limit=50', []);
    const [open, setOpen] = useState(null);
    return (_jsxs("section", { className: "bc-orchestrator-runs", style: card, children: [_jsxs("div", { style: cardHeader, children: ["Runs ", _jsxs("span", { style: { opacity: 0.5, fontWeight: 400 }, children: ["\u00B7 ", runs.length] })] }), error && _jsx("div", { style: { color: '#ef4444', fontSize: 12, padding: '6px 12px' }, children: error }), runs.length === 0 && !error && _jsx("div", { style: { opacity: 0.5, fontSize: 13, padding: 12 }, children: "No runs yet." }), runs.map((r) => (_jsxs("div", { style: { borderTop: '1px solid var(--border,#1e293b)' }, children: [_jsxs("div", { onClick: () => setOpen((o) => (o === r.id ? null : r.id)), style: { display: 'flex', gap: 10, alignItems: 'center', padding: '7px 12px', cursor: 'pointer', fontSize: 12 }, children: [_jsx("span", { style: { opacity: 0.6, minWidth: 120 }, children: r.at ? new Date(r.at).toLocaleString() : '' }), _jsx("span", { style: { ...tag, background: 'rgba(99,102,241,0.18)' }, children: r.trigger }), _jsx("span", { style: { opacity: 0.75, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: r.error ? _jsxs("span", { style: { color: '#ef4444' }, children: ["error: ", r.error] }) : r.message }), _jsxs("span", { title: "injected context", children: ["inj ", r.injected_tokens] }), _jsxs("span", { title: "output tokens", children: ["out ", r.output_tokens] }), _jsx("span", { style: { minWidth: 52, textAlign: 'right' }, children: formatCost(r.cost_usd) })] }), open === r.id && !r.error && (_jsxs("div", { style: { padding: '0 12px 10px', fontSize: 12 }, children: [_jsxs("div", { style: { opacity: 0.6, margin: '4px 0' }, children: ["you: ", r.message] }), _jsx(ProducerMarkdown, { text: r.reply, expandSessionsWithOpenQuestions: expandSessionsWithOpenQuestions }), _jsxs("div", { style: { opacity: 0.5, marginTop: 6 }, children: [r.model, " \u00B7 ", r.input_tokens, " in / ", r.output_tokens, " out \u00B7 ", (r.duration_ms / 1000).toFixed(1), "s"] })] }))] }, r.id)))] }));
}
const ORDER = ['agents', 'tasks', 'convo_summary', 'convo_current'];
function ContextInspector() {
    const { data: parts, error } = useProducerResource('/context', []);
    // Which parts are unfolded, so a folded one renders no body at all. A
    // `<details>` keeps its children in the DOM while closed, and each reference
    // in there is a chip that resolves its id the moment it mounts — a folded
    // dump naming forty sessions would put forty requests on the wire for
    // something nobody has looked at yet. `agents` starts open, as it always did.
    const [openParts, setOpenParts] = useState(() => new Set(['agents']));
    const setPartOpen = (part, open) => setOpenParts((previous) => {
        const next = new Set(previous);
        if (open)
            next.add(part);
        else
            next.delete(part);
        return next;
    });
    const ordered = [
        ...ORDER.map((id) => parts.find((p) => p.part === id)).filter(Boolean),
        ...parts.filter((p) => !ORDER.includes(p.part)),
    ];
    const total = ordered.reduce((a, p) => a + (p.latest?.tokens ?? 0), 0);
    return (_jsxs("section", { className: "bc-orchestrator-context", style: card, children: [_jsxs("div", { style: cardHeader, children: ["Injected context ", _jsxs("span", { style: { opacity: 0.5, fontWeight: 400 }, children: ["\u00B7 ~", total.toLocaleString(), " tok"] })] }), error && _jsx("div", { style: { color: '#ef4444', fontSize: 12, padding: '6px 12px' }, children: error }), ordered.map((p) => (_jsxs("details", { open: openParts.has(p.part), onToggle: (e) => setPartOpen(p.part, e.currentTarget.open), style: { borderTop: '1px solid var(--border,#1e293b)' }, children: [_jsxs("summary", { style: { cursor: 'pointer', padding: '7px 12px', fontSize: 13 }, children: [p.title, ' ', _jsxs("span", { style: { opacity: 0.5 }, children: ["\u00B7 ~", p.latest.tokens.toLocaleString(), " tok \u00B7 v", p.version_count] })] }), openParts.has(p.part) && (_jsx("pre", { style: {
                            whiteSpace: 'pre-wrap',
                            fontSize: 11.5,
                            margin: 0,
                            padding: '0 12px 10px',
                            maxHeight: 300,
                            overflow: 'auto',
                        }, children: _jsx(ProducerTextWithReferenceChips, { text: p.latest.content }) }))] }, p.part)))] }));
}
// --- shared inline styles ---------------------------------------------------
// Carried over from the page this was ported from, so a host that mounts it
// gets the surface it already had without shipping any new CSS. The class names
// above are the themeable surface.
const page = { padding: 20, maxWidth: 960, margin: '0 auto', color: 'var(--text,#e2e8f0)' };
const card = { border: '1px solid var(--border,#334155)', borderRadius: 10, marginTop: 16, overflow: 'hidden' };
const cardHeader = { padding: '9px 12px', background: 'var(--bg-surface)', fontWeight: 600, fontSize: 14 };
const pill = { padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border,#334155)', background: 'var(--bg-surface)', color: 'inherit', cursor: 'pointer', fontSize: 13 };
const dropdown = { position: 'absolute', right: 0, top: '110%', zIndex: 10, background: 'var(--bg,#0f172a)', border: '1px solid var(--border,#334155)', borderRadius: 8, padding: 8, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' };
const tag = { fontSize: 10, padding: '1px 6px', borderRadius: 4 };
//# sourceMappingURL=BridgeOrchestrator.js.map