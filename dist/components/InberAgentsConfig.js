import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useBridgeConfig } from '../context';
const MODELS = [
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929',
    'glm-5',
    'glm-4-flash',
];
// Inber lives outside the bridge, so this section calls the host's
// `/api/inber/*` proxy directly. Hosts that don't proxy inber (e.g. llmux)
// will see the section render empty / failed — which is the intended graceful
// degradation; only dash currently has the inber service reachable.
const INBER_API = '/api/inber';
export function InberAgentsConfig() {
    const { fetch: apiFetch } = useBridgeConfig();
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [edits, setEdits] = useState({});
    const [saving, setSaving] = useState(null);
    const [saveMsg, setSaveMsg] = useState({});
    const fetchAgents = async () => {
        try {
            const res = await apiFetch(`${INBER_API}/agents/config`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setAgents(data || []);
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 30000);
        return () => clearInterval(interval);
    }, []);
    const getEdit = (slug, agent) => {
        if (edits[slug])
            return edits[slug];
        return {
            model: agent.model,
            max_turns: String(agent.max_turns),
            max_input_tokens: String(agent.max_input_tokens),
            max_response_time: String(agent.max_response_time),
            thinking_budget: String(agent.thinking_budget),
            context_budget: String(agent.context_budget),
        };
    };
    const setEdit = (slug, field, value) => {
        const agent = agents.find(a => a.slug === slug);
        if (!agent)
            return;
        const current = getEdit(slug, agent);
        setEdits(prev => ({ ...prev, [slug]: { ...current, [field]: value } }));
    };
    const hasChanges = (slug, agent) => {
        const edit = edits[slug];
        if (!edit)
            return false;
        return (edit.model !== agent.model ||
            edit.max_turns !== String(agent.max_turns) ||
            edit.max_input_tokens !== String(agent.max_input_tokens) ||
            edit.max_response_time !== String(agent.max_response_time) ||
            edit.thinking_budget !== String(agent.thinking_budget) ||
            edit.context_budget !== String(agent.context_budget));
    };
    const save = async (slug, agent) => {
        const edit = getEdit(slug, agent);
        setSaving(slug);
        setSaveMsg(prev => ({ ...prev, [slug]: '' }));
        try {
            const body = { slug };
            if (edit.model !== agent.model)
                body.model = edit.model;
            if (edit.max_turns !== String(agent.max_turns))
                body.max_turns = parseInt(edit.max_turns) || 0;
            if (edit.max_input_tokens !== String(agent.max_input_tokens))
                body.max_input_tokens = parseInt(edit.max_input_tokens) || 0;
            if (edit.max_response_time !== String(agent.max_response_time))
                body.max_response_time = parseInt(edit.max_response_time) || 0;
            if (edit.thinking_budget !== String(agent.thinking_budget))
                body.thinking_budget = parseInt(edit.thinking_budget) || 0;
            if (edit.context_budget !== String(agent.context_budget))
                body.context_budget = parseInt(edit.context_budget) || 0;
            const res = await apiFetch(`${INBER_API}/agents/config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            setSaveMsg(prev => ({ ...prev, [slug]: '✓' }));
            setEdits(prev => { const next = { ...prev }; delete next[slug]; return next; });
            fetchAgents();
            setTimeout(() => setSaveMsg(prev => ({ ...prev, [slug]: '' })), 2000);
        }
        catch (e) {
            setSaveMsg(prev => ({ ...prev, [slug]: e instanceof Error ? e.message : 'Failed' }));
        }
        finally {
            setSaving(null);
        }
    };
    const reset = (slug) => {
        setEdits(prev => { const next = { ...prev }; delete next[slug]; return next; });
    };
    const fmtTokens = (n) => {
        if (n >= 1000000)
            return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000)
            return `${Math.round(n / 1000)}K`;
        return String(n);
    };
    if (loading)
        return _jsx("div", { className: "iac-section", children: _jsx("p", { children: "Loading inber agents\u2026" }) });
    if (error)
        return _jsx("div", { className: "iac-section", children: _jsxs("p", { className: "bridge-error", children: ["Inber config: ", error] }) });
    const active = agents.filter(a => !a.shelved);
    const shelved = agents.filter(a => a.shelved);
    const renderAgent = (agent) => {
        const edit = getEdit(agent.slug, agent);
        const changed = hasChanges(agent.slug, agent);
        const isSaving = saving === agent.slug;
        const msg = saveMsg[agent.slug];
        return (_jsxs("div", { className: `iac-row ${changed ? 'iac-row-changed' : ''}`, children: [_jsxs("div", { className: "iac-agent", children: [_jsx("span", { className: "iac-emoji", children: agent.emoji }), _jsx("span", { className: "iac-name", children: agent.display_name || agent.slug })] }), _jsxs("div", { className: "iac-fields", children: [_jsxs("label", { className: "iac-field", children: [_jsx("span", { className: "iac-label", children: "Model" }), _jsxs("select", { className: "iac-select", value: edit.model, onChange: e => setEdit(agent.slug, 'model', e.target.value), children: [MODELS.map(m => _jsx("option", { value: m, children: m }, m)), !MODELS.includes(edit.model) && _jsx("option", { value: edit.model, children: edit.model })] })] }), _jsxs("label", { className: "iac-field", children: [_jsx("span", { className: "iac-label", children: "Max Turns" }), _jsx("input", { className: "iac-input", type: "number", value: edit.max_turns, onChange: e => setEdit(agent.slug, 'max_turns', e.target.value), min: 0 })] }), _jsxs("label", { className: "iac-field", children: [_jsx("span", { className: "iac-label", children: "Max Tokens" }), _jsxs("div", { className: "iac-input-with-hint", children: [_jsx("input", { className: "iac-input", type: "number", value: edit.max_input_tokens, onChange: e => setEdit(agent.slug, 'max_input_tokens', e.target.value), min: 0, step: 100000 }), _jsx("span", { className: "iac-hint", children: fmtTokens(parseInt(edit.max_input_tokens) || 0) })] })] }), _jsxs("label", { className: "iac-field", children: [_jsx("span", { className: "iac-label", children: "Timeout (s)" }), _jsx("input", { className: "iac-input", type: "number", value: edit.max_response_time, onChange: e => setEdit(agent.slug, 'max_response_time', e.target.value), min: 0 })] }), _jsxs("label", { className: "iac-field", children: [_jsx("span", { className: "iac-label", children: "Thinking" }), _jsx("input", { className: "iac-input", type: "number", value: edit.thinking_budget, onChange: e => setEdit(agent.slug, 'thinking_budget', e.target.value), min: 0 })] }), _jsxs("label", { className: "iac-field", children: [_jsx("span", { className: "iac-label", children: "Context" }), _jsx("input", { className: "iac-input", type: "number", value: edit.context_budget, onChange: e => setEdit(agent.slug, 'context_budget', e.target.value), min: 0, step: 1000 })] })] }), _jsxs("div", { className: "iac-actions", children: [changed && (_jsxs(_Fragment, { children: [_jsx("button", { className: "iac-save-btn", onClick: () => save(agent.slug, agent), disabled: isSaving, children: isSaving ? '…' : 'Save' }), _jsx("button", { className: "iac-reset-btn", onClick: () => reset(agent.slug), children: "\u21A9" })] })), msg && _jsx("span", { className: msg === '✓' ? 'iac-msg-ok' : 'iac-msg-err', children: msg })] })] }, agent.slug));
    };
    return (_jsxs("div", { className: "iac-section", children: [_jsxs("div", { className: "iac-header", children: [_jsx("h4", { className: "iac-title", children: "Per-Agent Configuration" }), _jsxs("span", { className: "iac-count", children: [active.length, " agents"] })] }), _jsx("div", { className: "iac-table", children: active.map(renderAgent) }), shelved.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("h5", { className: "iac-shelved-title", children: ["Shelved (", shelved.length, ")"] }), _jsx("div", { className: "iac-table iac-shelved", children: shelved.map(renderAgent) })] }))] }));
}
//# sourceMappingURL=InberAgentsConfig.js.map