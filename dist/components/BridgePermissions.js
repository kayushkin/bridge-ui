import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
export function BridgePermissions() {
    const { fetch: apiFetch, permissionStoreBasePath } = useBridgeConfig();
    const [tab, setTab] = useState('rules');
    if (!permissionStoreBasePath) {
        return (_jsx("div", { className: "bperm-container", children: _jsx("p", { className: "bperm-error", children: "permissionStoreBasePath is not configured. Set it on BridgeProvider to enable this tab." }) }));
    }
    return (_jsxs("div", { className: "bperm-container", children: [_jsxs("div", { className: "bperm-tabs", children: [_jsx("button", { className: `bperm-tab ${tab === 'rules' ? 'bperm-tab-active' : ''}`, onClick: () => setTab('rules'), children: "Rules" }), _jsx("button", { className: `bperm-tab ${tab === 'audit' ? 'bperm-tab-active' : ''}`, onClick: () => setTab('audit'), children: "Audit" }), _jsx("button", { className: `bperm-tab ${tab === 'test' ? 'bperm-tab-active' : ''}`, onClick: () => setTab('test'), children: "Test" })] }), tab === 'rules' && _jsx(RulesTab, { apiFetch: apiFetch, basePath: permissionStoreBasePath }), tab === 'audit' && _jsx(AuditTab, { apiFetch: apiFetch, basePath: permissionStoreBasePath }), tab === 'test' && _jsx(TestTab, { apiFetch: apiFetch, basePath: permissionStoreBasePath })] }));
}
// --- Rules tab ----------------------------------------------------------
function RulesTab({ apiFetch, basePath }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const refetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(`${basePath}/rules`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRules(data || []);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    }, [apiFetch, basePath]);
    useEffect(() => { refetch(); }, [refetch]);
    const grouped = useMemo(() => {
        const order = (s) => s.startsWith('instance:') ? 0 : s.startsWith('bridge:') ? 1 : 2;
        const sorted = [...rules].sort((a, b) => order(a.scope) - order(b.scope)
            || a.priority - b.priority
            || a.id.localeCompare(b.id));
        const groups = {};
        for (const r of sorted) {
            if (!groups[r.scope])
                groups[r.scope] = [];
            groups[r.scope].push(r);
        }
        return groups;
    }, [rules]);
    const toggleEnabled = async (rule) => {
        try {
            const res = await apiFetch(`${basePath}/rules/${encodeURIComponent(rule.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !rule.enabled }),
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            refetch();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };
    const deleteRule = async (rule) => {
        if (!confirm(`Delete rule "${rule.id}"?`))
            return;
        try {
            const res = await apiFetch(`${basePath}/rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            refetch();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };
    if (loading)
        return _jsx("div", { className: "bperm-loading", children: "Loading rules\u2026" });
    return (_jsxs(_Fragment, { children: [error && _jsx("p", { className: "bperm-error", children: error }), _jsxs("div", { className: "bperm-toolbar", children: [_jsx("button", { className: "bperm-btn-primary", onClick: () => setCreating(true), children: "+ New rule" }), _jsxs("span", { className: "bperm-count", children: [rules.length, " rule", rules.length === 1 ? '' : 's'] })] }), Object.entries(grouped).map(([scope, scopeRules]) => (_jsxs("div", { className: "bperm-scope-block", children: [_jsx("h3", { className: "bperm-scope-title", children: scope }), _jsxs("table", { className: "bperm-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Pri" }), _jsx("th", { children: "Tool" }), _jsx("th", { children: "Pattern" }), _jsx("th", { children: "Outcome" }), _jsx("th", { children: "ID" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: scopeRules.map(r => (_jsxs("tr", { className: r.enabled ? '' : 'bperm-row-disabled', children: [_jsx("td", { children: r.priority }), _jsx("td", { children: r.tool }), _jsx("td", { children: _jsx("code", { children: r.pattern || '—' }) }), _jsx("td", { className: `bperm-outcome bperm-outcome-${r.outcome}`, children: r.outcome }), _jsx("td", { className: "bperm-rule-id", children: _jsx("code", { children: r.id }) }), _jsxs("td", { className: "bperm-actions", children: [_jsxs("label", { className: "bperm-toggle", children: [_jsx("input", { type: "checkbox", checked: r.enabled, onChange: () => toggleEnabled(r) }), _jsx("span", { children: r.enabled ? 'on' : 'off' })] }), _jsx("button", { onClick: () => setEditing(r), children: "Edit" }), _jsx("button", { onClick: () => deleteRule(r), children: "Delete" })] })] }, r.id))) })] })] }, scope))), (editing || creating) && (_jsx(RuleEditor, { rule: editing, apiFetch: apiFetch, basePath: basePath, onClose: () => { setEditing(null); setCreating(false); refetch(); } }))] }));
}
function RuleEditor({ rule, apiFetch, basePath, onClose, }) {
    const [scope, setScope] = useState(rule?.scope ?? 'global');
    const [priority, setPriority] = useState(rule?.priority ?? 200);
    const [tool, setTool] = useState(rule?.tool ?? 'Bash');
    const [pattern, setPattern] = useState(rule?.pattern ?? '');
    const [outcome, setOutcome] = useState(rule?.outcome ?? 'allow');
    const [message, setMessage] = useState(rule?.message ?? '');
    const [enabled, setEnabled] = useState(rule?.enabled ?? true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const body = { scope, priority, tool, pattern, outcome, message, enabled };
            const url = rule
                ? `${basePath}/rules/${encodeURIComponent(rule.id)}`
                : `${basePath}/rules`;
            const res = await apiFetch(url, {
                method: rule ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status} ${text}`);
            }
            onClose();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx("div", { className: "bperm-modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "bperm-modal", onClick: e => e.stopPropagation(), children: [_jsx("h3", { children: rule ? `Edit ${rule.id}` : 'New rule' }), _jsxs("div", { className: "bperm-form", children: [_jsxs("label", { children: ["Scope ", _jsx("input", { value: scope, onChange: e => setScope(e.target.value), placeholder: "global | bridge:<id> | instance:<id>" })] }), _jsxs("label", { children: ["Priority ", _jsx("input", { type: "number", value: priority, onChange: e => setPriority(parseInt(e.target.value || '100', 10)) })] }), _jsxs("label", { children: ["Tool ", _jsx("input", { value: tool, onChange: e => setTool(e.target.value), placeholder: "Bash | Read | * | ..." })] }), _jsxs("label", { children: ["Pattern ", _jsx("input", { value: pattern, onChange: e => setPattern(e.target.value), placeholder: "^git status (RE2 regex; empty = match any)" })] }), _jsxs("label", { children: ["Outcome", _jsxs("select", { value: outcome, onChange: e => setOutcome(e.target.value), children: [_jsx("option", { value: "allow", children: "allow" }), _jsx("option", { value: "deny", children: "deny" }), _jsx("option", { value: "ask", children: "ask" })] })] }), _jsxs("label", { children: ["Message ", _jsx("input", { value: message, onChange: e => setMessage(e.target.value), placeholder: "Surfaced on deny / ask" })] }), _jsxs("label", { className: "bperm-toggle", children: [_jsx("input", { type: "checkbox", checked: enabled, onChange: e => setEnabled(e.target.checked) }), _jsx("span", { children: "Enabled" })] })] }), error && _jsx("p", { className: "bperm-error", children: error }), _jsxs("div", { className: "bperm-modal-actions", children: [_jsx("button", { onClick: onClose, disabled: saving, children: "Cancel" }), _jsx("button", { className: "bperm-btn-primary", onClick: save, disabled: saving, children: rule ? 'Save' : 'Create' })] })] }) }));
}
// --- Audit tab ----------------------------------------------------------
function AuditTab({ apiFetch, basePath }) {
    const [filterBridge, setFilterBridge] = useState('');
    const [filterTool, setFilterTool] = useState('');
    const [limit, setLimit] = useState(50);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const refetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filterBridge)
                params.set('bridge_id', filterBridge);
            if (filterTool)
                params.set('tool', filterTool);
            params.set('limit', String(limit));
            const res = await apiFetch(`${basePath}/audit?${params}`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setEntries(data || []);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    }, [apiFetch, basePath, filterBridge, filterTool, limit]);
    useEffect(() => { refetch(); }, [refetch]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bperm-toolbar", children: [_jsx("input", { placeholder: "bridge_id", value: filterBridge, onChange: e => setFilterBridge(e.target.value) }), _jsx("input", { placeholder: "tool", value: filterTool, onChange: e => setFilterTool(e.target.value) }), _jsxs("label", { children: ["limit ", _jsx("input", { type: "number", value: limit, onChange: e => setLimit(parseInt(e.target.value || '50', 10)), style: { width: 60 } })] }), _jsx("button", { onClick: refetch, disabled: loading, children: loading ? 'Loading…' : 'Refresh' })] }), error && _jsx("p", { className: "bperm-error", children: error }), _jsxs("table", { className: "bperm-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Time" }), _jsx("th", { children: "Tool" }), _jsx("th", { children: "Atoms" }), _jsx("th", { children: "Outcome" }), _jsx("th", { children: "Matched rule" }), _jsx("th", { children: "Bridge" })] }) }), _jsx("tbody", { children: entries.map(e => (_jsxs("tr", { children: [_jsx("td", { children: e.ts.replace('T', ' ').slice(0, 19) }), _jsx("td", { children: e.tool }), _jsx("td", { children: _jsx("code", { children: (e.atoms || []).filter(a => a.kind === 'call').map(a => a.line).join(' ; ') || '—' }) }), _jsx("td", { className: `bperm-outcome bperm-outcome-${e.outcome}`, children: e.outcome }), _jsx("td", { className: "bperm-rule-id", children: _jsx("code", { children: e.matched_rule_id || '—' }) }), _jsx("td", { className: "bperm-rule-id", children: _jsx("code", { children: e.bridge_id || '—' }) })] }, e.id))) })] })] }));
}
// --- Test tab -----------------------------------------------------------
function TestTab({ apiFetch, basePath }) {
    const [tool, setTool] = useState('Bash');
    const [input, setInput] = useState('{"command":"git status && rm -rf /tmp"}');
    const [bridgeID, setBridgeID] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const evaluate = async () => {
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            let parsedInput;
            try {
                parsedInput = JSON.parse(input);
            }
            catch (e) {
                throw new Error(`input is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
            }
            const res = await apiFetch(`${basePath}/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool, input: parsedInput, bridge_id: bridgeID || undefined }),
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            setResult(await res.json());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "bperm-subtitle", children: "Run a tool call through the splitter + rule engine without actually executing it. Useful for crafting Bash atom regexes." }), _jsxs("div", { className: "bperm-form", children: [_jsxs("label", { children: ["Tool ", _jsx("input", { value: tool, onChange: e => setTool(e.target.value) })] }), _jsxs("label", { children: ["bridge_id (optional) ", _jsx("input", { value: bridgeID, onChange: e => setBridgeID(e.target.value), placeholder: "for instance/bridge-scope rules" })] }), _jsxs("label", { children: ["Input JSON", _jsx("textarea", { value: input, onChange: e => setInput(e.target.value), rows: 5, spellCheck: false, style: { fontFamily: 'monospace', fontSize: '0.85em' } })] })] }), _jsx("div", { className: "bperm-toolbar", children: _jsx("button", { className: "bperm-btn-primary", onClick: evaluate, disabled: busy, children: busy ? 'Evaluating…' : 'Evaluate' }) }), error && _jsx("p", { className: "bperm-error", children: error }), result && (_jsxs("div", { className: "bperm-test-result", children: [_jsxs("p", { children: ["Outcome: ", _jsx("strong", { className: `bperm-outcome bperm-outcome-${result.outcome}`, children: result.outcome }), result.matched_rule_id && _jsxs(_Fragment, { children: [" \u00B7 matched ", _jsx("code", { children: result.matched_rule_id })] })] }), result.message && _jsxs("p", { children: ["Message: ", result.message] }), _jsxs("h4", { children: ["Atoms (", result.atoms.length, ")"] }), _jsx("pre", { className: "bperm-pre", children: JSON.stringify(result.atoms, null, 2) })] }))] }));
}
//# sourceMappingURL=BridgePermissions.js.map