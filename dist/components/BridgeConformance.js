import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBridgeConfig } from '../context';
// Feature groups mirror the categories in
// ~/repos/llm-bridge-server/conformance/matrix.go's AllFeatures slice.
// Each feature names the EventType(s) (or control-plane operation) it
// exercises so the matrix doubles as documentation of which message types
// in the protocol are covered, and which harnesses send them.
const FEATURE_GROUPS = [
    { label: 'Lifecycle', features: ['start', 'resume', 'fork', 'compact', 'config', 'discover', 'import'] },
    { label: 'Message round-trip', features: ['message', 'streaming'] },
    { label: 'Content blocks', features: ['block', 'tool_calls', 'thinking', 'plan'] },
    { label: 'Session metadata', features: ['session_info', 'user_message', 'context_used', 'system_prompt', 'reasoning'] },
    { label: 'Hooks / errors', features: ['hook', 'errors'] },
    { label: 'Convenience (server-derived)', features: ['usage_total', 'turn_complete'] },
];
const ALL_FEATURES = FEATURE_GROUPS.flatMap(g => g.features);
const FEATURE_LABELS = {
    start: 'Start',
    resume: 'Resume',
    fork: 'Fork',
    compact: 'Compact',
    config: 'Config',
    discover: 'Discover',
    import: 'Import',
    message: 'Message',
    streaming: 'Streaming',
    block: 'Block',
    tool_calls: 'Tool Calls',
    thinking: 'Thinking',
    plan: 'Plan',
    session_info: 'Session Info',
    user_message: 'User Message',
    context_used: 'Context Used',
    system_prompt: 'System Prompt',
    reasoning: 'Reasoning',
    hook: 'Hook',
    errors: 'Errors',
    usage_total: 'Usage Total',
    turn_complete: 'Turn Complete',
};
// Each description names the canonical EventType(s) the feature exercises so
// the matrix ties every test to the message it asserts on.
const FEATURE_DESCRIPTIONS = {
    start: 'EventSessionState — start a new session. Sends the "start" JSON-RPC command and expects EventSessionState with state=running.',
    resume: 'EventSessionState — resume a previously saved session by ID. Sends "start" with resume=true and expects a running session.',
    fork: 'EventSessionState — branch a new session from an existing one. Sends "start" with a fork param and expects a running session.',
    compact: 'EventSystem — ask the harness to compact conversation history. Expects an EventSystem response.',
    config: 'EventSystem — apply runtime config (e.g. model, temperature) mid-session via "config:<json>". Expects EventSystem.',
    discover: 'Out-of-band: runs the harness binary with -discover and verifies it prints a valid JSON array of on-disk sessions. Not part of the EventType protocol.',
    import: 'Out-of-band: checks that the binary supports -import-history (exit code 2 = unsupported, 0 = no-op pass). Not part of the EventType protocol.',
    message: 'EventResult — send a user message and receive a non-empty text result.',
    streaming: 'EventStream — incremental delta events arrive before the final EventResult, not just a single blob.',
    block: 'EventBlock — whole finished content blocks (text, thinking, tool_use, …) emitted alongside or instead of EventStream deltas.',
    tool_calls: 'EventToolCall / EventToolResult — model-emitted tool calls are executed and their results fed back into the conversation. Skipped — requires a real LLM.',
    thinking: 'EventThinking — extended-thinking / reasoning blocks emitted as distinct events, separate from the final answer. Skipped — requires a real LLM.',
    plan: 'EventPlan — structured task-planning event distinct from thinking. Scenario-specific; emitted only when the underlying agent uses a plan tool, so most harnesses skip.',
    session_info: 'EventSessionInfo — emitted at start with the harness\'s initial metadata: system prompt, working dir, model, tools, slash commands, agents, MCP servers.',
    user_message: 'EventUserMessage — the harness echoes the caller\'s input back through the event stream so consumers have a single source of truth for what was sent.',
    context_used: 'EventResult.usage — result events include token usage fields (input/output/context window).',
    system_prompt: 'Control-plane: harness accepts a system_prompt param on session start and applies it to the conversation. Verified via EventSessionState.',
    reasoning: 'Control-plane: harness accepts a reasoning-effort config and passes it through to the model. Verified via EventSystem.',
    hook: 'EventHook — lifecycle events (PreToolUse, PostToolUse, UserPromptSubmit, …). Requires hook config in the underlying agent; scenario-specific, so most harnesses skip.',
    errors: 'EventError — errors surface as discrete events rather than crashes or silent failures. Verified via MOCK_HARNESS_EMIT_ERROR=true.',
    usage_total: 'EventUsageTotal — server-derived convenience event. Emitted by llm-bridge-server (not the harness) — cumulative session usage across every result event. The conformance runner spawns harnesses directly, so it always Skips here.',
    turn_complete: 'EventTurnComplete — server-derived convenience event. Emitted by llm-bridge-server (not the harness) — coalesced turn summary fired immediately after the terminating result/error. The conformance runner spawns harnesses directly, so it always Skips here.',
};
const STATUS_DESCRIPTIONS = {
    pass: 'The expected JSON-RPC event arrived within the 10-second timeout and matched the predicate for this feature.',
    fail: 'The test ran but the harness responded with an error, the wrong event type, or nothing within the timeout.',
    skip: 'The feature is not applicable to this harness, or the harness explicitly reported it as unsupported.',
    untested: 'No test run has covered this harness yet. Click "Run Tests" to populate the matrix.',
};
function classifyHarness(h, hr) {
    if (!h.available)
        return 'unavailable';
    if (!hr)
        return 'untested';
    if (hr.summary.passed > 0)
        return 'working';
    return 'broken';
}
export function BridgeConformance() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const [harnesses, setHarnesses] = useState([]);
    const [response, setResponse] = useState(null);
    const [polling, setPolling] = useState(false);
    const [manualExpanded, setManualExpanded] = useState({});
    const fetchMatrix = useCallback(async () => {
        const res = await apiFetch(`${basePath}/conformance`);
        if (res.ok) {
            const data = await res.json();
            setResponse(data);
            return data.running;
        }
        return false;
    }, [apiFetch, basePath]);
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
        fetchMatrix();
    }, [fetchMatrix, apiFetch, basePath]);
    useEffect(() => {
        if (!polling)
            return;
        const id = setInterval(async () => {
            const stillRunning = await fetchMatrix();
            if (!stillRunning)
                setPolling(false);
        }, 2000);
        return () => clearInterval(id);
    }, [polling, fetchMatrix]);
    const runTests = async () => {
        const res = await apiFetch(`${basePath}/conformance/run`, { method: 'POST' });
        if (res.ok) {
            setPolling(true);
            setResponse(prev => ({ running: true, matrix: prev?.matrix ?? null }));
        }
    };
    const matrix = response?.matrix;
    const running = response?.running ?? false;
    const resultsByHarness = {};
    if (matrix) {
        for (const hr of matrix.harnesses) {
            resultsByHarness[hr.harness] = hr;
        }
    }
    const toggle = (name, defaultExpanded) => {
        setManualExpanded(prev => {
            const current = prev[name] ?? defaultExpanded;
            return { ...prev, [name]: !current };
        });
    };
    return (_jsxs("div", { className: "cf-container", children: [_jsxs("div", { className: "cf-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "cf-title", children: "Harness Conformance" }), _jsx("p", { className: "cf-subtitle", children: "Tests each harness against the llm-bridge subprocess protocol. Unavailable or failing harnesses are collapsed \u2014 click a row to expand." })] }), _jsx("button", { className: "cf-run-btn", onClick: runTests, disabled: running, children: running ? 'Running...' : 'Run Tests' })] }), running && (_jsxs("div", { className: "cf-running-banner", children: [_jsx("span", { className: "cf-spinner" }), " Testing harnesses... results will update automatically."] })), matrix && matrix.harnesses.length > 0 && (_jsxs("div", { className: "cf-generated", children: ["Last run: ", new Date(matrix.generated_at).toLocaleString()] })), harnesses.length === 0 ? (_jsx("div", { className: "cf-empty", children: "No harnesses registered." })) : (_jsx("div", { className: "cf-table-wrapper", children: _jsxs("table", { className: "cf-table cf-table-flipped", children: [_jsxs("thead", { children: [_jsxs("tr", { className: "cf-th-group-row", children: [_jsx("th", { className: "cf-th-harness-col cf-th-group-empty" }), FEATURE_GROUPS.map(g => (_jsx("th", { className: "cf-th-group", colSpan: g.features.length, title: g.label, children: g.label }, g.label))), _jsx("th", { className: "cf-th-summary-col cf-th-group-empty" })] }), _jsxs("tr", { children: [_jsx("th", { className: "cf-th-harness-col", children: "Harness" }), FEATURE_GROUPS.map((g, gi) => g.features.map((feature, fi) => (_jsxs("th", { className: 'cf-th-feature-col' +
                                                (fi === 0 && gi > 0 ? ' cf-th-group-start' : ''), children: [_jsx("span", { className: "cf-feature-label", children: FEATURE_LABELS[feature] || feature }), _jsx(InfoTip, { text: FEATURE_DESCRIPTIONS[feature] || '' })] }, feature)))), _jsx("th", { className: "cf-th-summary-col", children: "Summary" })] })] }), _jsx("tbody", { children: harnesses.map(h => {
                                const hr = resultsByHarness[harnessKeyFromName(h.name)];
                                const state = classifyHarness(h, hr);
                                const defaultExpanded = state === 'working' || state === 'untested';
                                const expanded = manualExpanded[h.name] ?? defaultExpanded;
                                return (_jsx(HarnessRow, { harness: h, result: hr, state: state, expanded: expanded, onToggle: () => toggle(h.name, defaultExpanded), basePath: basePath }, h.name));
                            }) })] }) })), _jsxs("div", { className: "cf-legend", children: [_jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-badge cf-pass", children: "Pass" }), " Feature supported", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.pass })] }), _jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-badge cf-fail", children: "Fail" }), " Feature failed", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.fail })] }), _jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-badge cf-skip", children: "Skip" }), " Not applicable / skipped", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.skip })] }), _jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-untested", children: "-" }), " Not yet tested", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.untested })] })] }), _jsxs("details", { className: "cf-how-it-works", children: [_jsx("summary", { children: "How the tests work" }), _jsxs("p", { children: ["Each harness is launched as a subprocess. The server writes JSON-RPC commands to its stdin and reads JSON event lines from its stdout. For every feature the runner sends a specific command and waits up to 10 seconds for an event matching a predicate (e.g. ", _jsx("code", { children: "EventSessionState" }), "with ", _jsx("code", { children: "state=running" }), ", a non-empty ", _jsx("code", { children: "EventResult" }), ", or an ", _jsx("code", { children: "EventError" }), "). A match is a ", _jsx("strong", { children: "Pass" }), "; a wrong/missing event or timeout is a ", _jsx("strong", { children: "Fail" }), "; a harness that declares the feature unsupported (or simply doesn't emit the optional event type) yields a ", _jsx("strong", { children: "Skip" }), "."] }), _jsxs("p", { children: ["Features are grouped by the part of the protocol they exercise: lifecycle commands (", _jsx("code", { children: "start" }), ", ", _jsx("code", { children: "resume" }), ", ", _jsx("code", { children: "fork" }), ", ", _jsx("code", { children: "compact" }), ", ", _jsx("code", { children: "config" }), "); the message round-trip pair (", _jsx("code", { children: "message" }), " \u2194 ", _jsx("code", { children: "EventResult" }), ", ", _jsx("code", { children: "streaming" }), " \u2194 ", _jsx("code", { children: "EventStream" }), "); content-block events (", _jsx("code", { children: "EventBlock" }), ", ", _jsx("code", { children: "EventToolCall" }), "/", _jsx("code", { children: "EventToolResult" }), ", ", _jsx("code", { children: "EventThinking" }), ", ", _jsx("code", { children: "EventPlan" }), "); session metadata (", _jsx("code", { children: "EventSessionInfo" }), ", ", _jsx("code", { children: "EventUserMessage" }), ", token-usage fields, system-prompt and reasoning-effort config); and hook / error signalling (", _jsx("code", { children: "EventHook" }), ", ", _jsx("code", { children: "EventError" }), ")."] }), _jsxs("p", { children: ["Two events are special: ", _jsx("code", { children: "discover" }), " and ", _jsx("code", { children: "import" }), " run the binary with ", _jsx("code", { children: "-discover" }), " /", _jsx("code", { children: "-import-history" }), " flags and inspect exit code + stdout rather than speaking the JSON-RPC protocol.", _jsx("code", { children: "usage_total" }), " and ", _jsx("code", { children: "turn_complete" }), " are ", _jsx("em", { children: "server-derived" }), " convenience events: llm-bridge-server synthesizes them from the raw event stream and broadcasts them to subscribers \u2014 harnesses themselves never emit them. The conformance runner spawns harnesses directly (no server in the loop), so those two always show ", _jsx("strong", { children: "Skip" }), " here. They appear in the matrix purely so every event type in the protocol has a row."] })] })] }));
}
function HarnessRow({ harness, result, state, expanded, onToggle, basePath, }) {
    const label = harness.label || harness.name;
    const emoji = harness.emoji || '';
    const nameCell = (_jsxs("td", { className: `cf-td-harness-col cf-harness-state-${state}`, onClick: onToggle, children: [_jsx("span", { className: "cf-expand-chevron", "aria-label": expanded ? 'Collapse' : 'Expand', children: expanded ? '▾' : '▸' }), harness.image
                ? _jsx("img", { className: "cf-harness-img", src: `${basePath}${harness.image}`, alt: label })
                : _jsx("span", { className: "cf-emoji", children: emoji }), _jsx("span", { className: "cf-harness-label", children: label }), _jsx(StateDot, { state: state })] }));
    if (!expanded) {
        const message = collapsedMessage(state, result);
        return (_jsxs("tr", { className: `cf-row-collapsed cf-row-state-${state}`, children: [nameCell, _jsx("td", { className: "cf-td-collapsed-msg", colSpan: ALL_FEATURES.length, onClick: onToggle, children: message }), _jsx("td", { className: "cf-td-summary-col", children: _jsx(SummaryCell, { result: result }) })] }));
    }
    return (_jsxs("tr", { className: `cf-row-expanded cf-row-state-${state}`, children: [nameCell, FEATURE_GROUPS.map((g, gi) => g.features.map((feature, fi) => {
                const tr = result?.results?.find((r) => r.feature === feature);
                const groupStart = fi === 0 && gi > 0;
                return (_jsx("td", { className: 'cf-td-result' + (groupStart ? ' cf-td-group-start' : ''), title: tr?.error || '', children: _jsx(CellBadge, { result: tr, tested: !!result }) }, feature));
            })), _jsx("td", { className: "cf-td-summary-col", children: _jsx(SummaryCell, { result: result }) })] }));
}
function collapsedMessage(state, result) {
    if (state === 'unavailable')
        return 'Binary not installed';
    if (state === 'broken' && result) {
        const total = result.summary.passed + result.summary.failed + result.summary.skipped;
        return `0 / ${total} passing — click to expand`;
    }
    if (state === 'untested')
        return 'Not yet tested — click to expand';
    return 'click to expand';
}
function StateDot({ state }) {
    const title = state === 'working' ? 'Working — at least one feature passing' :
        state === 'untested' ? 'Not yet tested' :
            state === 'broken' ? 'Broken — all features failing' :
                'Binary not installed';
    return _jsx("span", { className: `cf-state-dot cf-state-dot-${state}`, title: title });
}
function SummaryCell({ result }) {
    if (!result)
        return _jsx("span", { className: "cf-untested", children: "-" });
    return (_jsxs("span", { className: "cf-summary-text", children: [_jsx("span", { className: "cf-sum-pass", children: result.summary.passed }), result.summary.failed > 0 && _jsxs(_Fragment, { children: [" / ", _jsx("span", { className: "cf-sum-fail", children: result.summary.failed })] }), result.summary.skipped > 0 && _jsxs(_Fragment, { children: [" / ", _jsx("span", { className: "cf-sum-skip", children: result.summary.skipped })] })] }));
}
function InfoTip({ text }) {
    const [show, setShow] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const ref = useRef(null);
    if (!text)
        return null;
    const open = () => {
        const r = ref.current?.getBoundingClientRect();
        if (r)
            setCoords({ x: r.left + r.width / 2, y: r.bottom + 6 });
        setShow(true);
    };
    return (_jsxs(_Fragment, { children: [_jsx("span", { ref: ref, className: "cf-info-icon", onMouseEnter: open, onMouseLeave: () => setShow(false), onFocus: open, onBlur: () => setShow(false), tabIndex: 0, role: "button", "aria-label": "More info", children: "?" }), show && createPortal(_jsx("div", { className: "cf-tooltip", style: { left: coords.x, top: coords.y }, role: "tooltip", children: text }), document.body)] }));
}
function CellBadge({ result, tested }) {
    if (!tested)
        return _jsx("span", { className: "cf-untested", children: "-" });
    if (!result)
        return _jsx("span", { className: "cf-untested", children: "-" });
    if (result.skipped)
        return _jsx("span", { className: "cf-badge cf-skip", title: result.error, children: "Skip" });
    if (result.passed)
        return _jsx("span", { className: "cf-badge cf-pass", title: result.duration, children: "Pass" });
    return _jsx("span", { className: "cf-badge cf-fail", title: result.error, children: "Fail" });
}
function harnessKeyFromName(name) {
    return name.replace(/_/g, '');
}
//# sourceMappingURL=BridgeConformance.js.map