import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBridgeConfig } from '../context';
const ALL_FEATURES = [
    'start', 'message', 'resume', 'fork', 'compact', 'config',
    'discover', 'import', 'streaming', 'tool_calls', 'thinking', 'errors',
    'reasoning', 'system_prompt', 'context_used',
];
const FEATURE_LABELS = {
    start: 'Start',
    message: 'Message',
    resume: 'Resume',
    fork: 'Fork',
    compact: 'Compact',
    config: 'Config',
    discover: 'Discover',
    import: 'Import',
    streaming: 'Streaming',
    tool_calls: 'Tool Calls',
    thinking: 'Thinking',
    errors: 'Errors',
    reasoning: 'Reasoning',
    system_prompt: 'System Prompt',
    context_used: 'Context Used',
};
const FEATURE_DESCRIPTIONS = {
    start: 'Start a new session. Sends the "start" JSON-RPC command and expects an EventSessionState with state=running.',
    message: 'Send a user message and receive a non-empty text result (EventResult).',
    resume: 'Resume a previously saved session by ID. Sends "start" with resume=true and expects a running session.',
    fork: 'Branch a new session from an existing one. Sends "start" with a fork param and expects a running session.',
    compact: 'Ask the harness to compact conversation history (summarize earlier turns). Expects an EventSystem response.',
    config: 'Apply runtime config (e.g. model, temperature) mid-session. Sends "config:<json>" and expects EventSystem.',
    discover: 'Run the harness binary with -discover and verify it prints a valid JSON array describing its capabilities.',
    import: 'Check that the binary supports -import-history for importing prior conversation history (exit code 2 = unsupported).',
    streaming: 'Verify incremental EventStream events arrive before the final EventResult, not just a single blob.',
    tool_calls: 'Model-emitted tool calls are executed and their results fed back into the conversation.',
    thinking: 'Extended-thinking / reasoning blocks are emitted as distinct events, separate from the final answer.',
    errors: 'Errors surface as EventError events rather than crashes or silent failures. Verified via MOCK_HARNESS_EMIT_ERROR=true.',
    reasoning: 'Harness accepts a reasoning-effort config and passes it through to the model.',
    system_prompt: 'Harness accepts a system_prompt param on session start and applies it to the conversation.',
    context_used: 'Result events include token usage fields (input/output/context window).',
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
    return (_jsxs("div", { className: "cf-container", children: [_jsxs("div", { className: "cf-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "cf-title", children: "Harness Conformance" }), _jsx("p", { className: "cf-subtitle", children: "Tests each harness against the llm-bridge subprocess protocol. Unavailable or failing harnesses are collapsed \u2014 click a row to expand." })] }), _jsx("button", { className: "cf-run-btn", onClick: runTests, disabled: running, children: running ? 'Running...' : 'Run Tests' })] }), running && (_jsxs("div", { className: "cf-running-banner", children: [_jsx("span", { className: "cf-spinner" }), " Testing harnesses... results will update automatically."] })), matrix && matrix.harnesses.length > 0 && (_jsxs("div", { className: "cf-generated", children: ["Last run: ", new Date(matrix.generated_at).toLocaleString()] })), harnesses.length === 0 ? (_jsx("div", { className: "cf-empty", children: "No harnesses registered." })) : (_jsx("div", { className: "cf-table-wrapper", children: _jsxs("table", { className: "cf-table cf-table-flipped", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "cf-th-harness-col", children: "Harness" }), ALL_FEATURES.map(feature => (_jsxs("th", { className: "cf-th-feature-col", children: [_jsx("span", { className: "cf-feature-label", children: FEATURE_LABELS[feature] || feature }), _jsx(InfoTip, { text: FEATURE_DESCRIPTIONS[feature] || '' })] }, feature))), _jsx("th", { className: "cf-th-summary-col", children: "Summary" })] }) }), _jsx("tbody", { children: harnesses.map(h => {
                                const hr = resultsByHarness[harnessKeyFromName(h.name)];
                                const state = classifyHarness(h, hr);
                                const defaultExpanded = state === 'working' || state === 'untested';
                                const expanded = manualExpanded[h.name] ?? defaultExpanded;
                                return (_jsx(HarnessRow, { harness: h, result: hr, state: state, expanded: expanded, onToggle: () => toggle(h.name, defaultExpanded), basePath: basePath }, h.name));
                            }) })] }) })), _jsxs("div", { className: "cf-legend", children: [_jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-badge cf-pass", children: "Pass" }), " Feature supported", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.pass })] }), _jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-badge cf-fail", children: "Fail" }), " Feature failed", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.fail })] }), _jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-badge cf-skip", children: "Skip" }), " Not applicable / skipped", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.skip })] }), _jsxs("span", { className: "cf-legend-item", children: [_jsx("span", { className: "cf-untested", children: "-" }), " Not yet tested", _jsx(InfoTip, { text: STATUS_DESCRIPTIONS.untested })] })] }), _jsxs("details", { className: "cf-how-it-works", children: [_jsx("summary", { children: "How the tests work" }), _jsxs("p", { children: ["Each harness is launched as a subprocess. The server writes JSON-RPC commands to its stdin and reads JSON event lines from its stdout. For every feature the runner sends a specific command and waits up to 10 seconds for an event matching a predicate (e.g. ", _jsx("code", { children: "EventSessionState" }), "with ", _jsx("code", { children: "state=running" }), ", a non-empty ", _jsx("code", { children: "EventResult" }), ", or an ", _jsx("code", { children: "EventError" }), "). A match is a ", _jsx("strong", { children: "Pass" }), "; a wrong/missing event or timeout is a ", _jsx("strong", { children: "Fail" }), "; a harness that declares the feature unsupported yields a ", _jsx("strong", { children: "Skip" }), ". ", _jsx("code", { children: "discover" }), " and ", _jsx("code", { children: "import" }), "are exceptions \u2014 they run the binary with ", _jsx("code", { children: "-discover" }), " / ", _jsx("code", { children: "-import-history" }), " flags and inspect exit code and stdout rather than speaking the JSON-RPC protocol."] })] })] }));
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
    return (_jsxs("tr", { className: `cf-row-expanded cf-row-state-${state}`, children: [nameCell, ALL_FEATURES.map(feature => {
                const tr = result?.results?.find((r) => r.feature === feature);
                return (_jsx("td", { className: "cf-td-result", title: tr?.error || '', children: _jsx(CellBadge, { result: tr, tested: !!result }) }, feature));
            }), _jsx("td", { className: "cf-td-summary-col", children: _jsx(SummaryCell, { result: result }) })] }));
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