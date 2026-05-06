import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgePrefs } from '../useBridgePrefs';
import { SourceFoldersEditor } from './SourceFoldersEditor';
import { InberAgentsConfig } from './InberAgentsConfig';
const EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'];
const COMMON_TOOLS = [
    'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch',
    'NotebookEdit', 'TodoWrite', 'AskUserQuestion',
];
export function BridgeSettings() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` });
    const [harnesses, setHarnesses] = useState([]);
    const [models, setModels] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [localDefaults, setLocalDefaults] = useState({});
    const [saving, setSaving] = useState(null);
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
        apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data) => {
            setModels(data.filter(m => m.enabled));
        }).catch(() => { });
    }, [apiFetch, basePath]);
    useEffect(() => {
        const defaults = {};
        for (const h of harnesses)
            defaults[h.name] = bridgePrefs.getDefaults(h.name);
        setLocalDefaults(defaults);
    }, [harnesses, bridgePrefs.getDefaults]);
    const toggleExpand = (name) => setExpanded(prev => ({ ...prev, [name]: !prev[name] }));
    const updateLocal = (harness, field, value) => {
        setLocalDefaults(prev => ({ ...prev, [harness]: { ...prev[harness], [field]: value } }));
    };
    const toggleTool = (harness, tool) => {
        setLocalDefaults(prev => {
            const current = prev[harness]?.disabled_tools || [];
            const next = current.includes(tool) ? current.filter(t => t !== tool) : [...current, tool];
            return { ...prev, [harness]: { ...prev[harness], disabled_tools: next } };
        });
    };
    const saveDefaults = useCallback(async (harness) => {
        setSaving(harness);
        const defaults = localDefaults[harness] || {};
        const cleaned = {};
        if (defaults.model)
            cleaned.model = defaults.model;
        if (defaults.effort)
            cleaned.effort = defaults.effort;
        if (defaults.max_budget !== undefined && defaults.max_budget > 0)
            cleaned.max_budget = defaults.max_budget;
        if (defaults.disabled_tools?.length)
            cleaned.disabled_tools = defaults.disabled_tools;
        bridgePrefs.setHarnessDefaults(harness, cleaned);
        setTimeout(() => setSaving(null), 500);
    }, [localDefaults, bridgePrefs]);
    const hasCapability = (harness, cap) => harness.capabilities?.includes(cap);
    return (_jsxs("div", { className: "bset-container", children: [_jsx(SourceFoldersEditor, {}), _jsx(PermissionsBypassToggle, { apiFetch: apiFetch, basePath: basePath }), _jsx("h2", { className: "bset-title", children: "Harness Defaults" }), _jsx("p", { className: "bset-subtitle", children: "Configure default settings for each harness type. These are applied when creating new sessions." }), _jsx("div", { className: "bset-grid", children: harnesses.map(h => {
                    const defaults = localDefaults[h.name] || {};
                    const isExpanded = expanded[h.name];
                    const label = h.label || h.name;
                    const emoji = h.emoji || '';
                    return (_jsxs("div", { className: `bset-card ${!h.available ? 'bset-unavailable' : ''}`, children: [_jsxs("div", { className: "bset-card-header", onClick: () => toggleExpand(h.name), children: [_jsxs("span", { className: "bset-harness-name", children: [h.image ? _jsx("img", { className: "bset-harness-img", src: `${basePath}${h.image}`, alt: label }) : _jsx("span", { className: "bset-emoji", children: emoji }), label, !h.available && _jsx("span", { className: "bset-unavail-badge", children: "unavailable" })] }), _jsx("span", { className: "bset-expand-icon", children: isExpanded ? '\u2212' : '+' })] }), isExpanded && (_jsxs("div", { className: "bset-card-body", children: [hasCapability(h, 'model') && (_jsxs("div", { className: "bset-field", children: [_jsx("label", { children: "Default Model" }), _jsxs("select", { value: defaults.model || '', onChange: e => updateLocal(h.name, 'model', e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Use harness default \u2014" }), models.filter(m => !h.supported_providers?.length || h.supported_providers.includes(m.provider)).map(m => (_jsxs("option", { value: m.id, children: [m.id, " ($", m.input_cost, "/$", m.output_cost, " MTok)"] }, m.id)))] })] })), hasCapability(h, 'effort') && (_jsxs("div", { className: "bset-field", children: [_jsx("label", { children: "Effort Level" }), _jsxs("select", { value: defaults.effort || '', onChange: e => updateLocal(h.name, 'effort', e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Default \u2014" }), EFFORT_OPTIONS.map(e => _jsx("option", { value: e, children: e }, e))] })] })), hasCapability(h, 'budget') && (_jsxs("div", { className: "bset-field", children: [_jsx("label", { children: "Max Budget ($)" }), _jsx("input", { type: "number", step: "0.5", min: "0", placeholder: "No limit", value: defaults.max_budget ?? '', onChange: e => updateLocal(h.name, 'max_budget', e.target.value ? parseFloat(e.target.value) : undefined) })] })), hasCapability(h, 'tools') && (_jsxs("div", { className: "bset-field", children: [_jsx("label", { children: "Disabled Tools" }), _jsx("div", { className: "bset-tool-grid", children: COMMON_TOOLS.map(tool => {
                                                    const disabled = defaults.disabled_tools?.includes(tool);
                                                    return (_jsx("button", { type: "button", className: `bset-tool-chip ${disabled ? 'bset-tool-disabled' : ''}`, onClick: () => toggleTool(h.name, tool), children: tool }, tool));
                                                }) })] })), _jsxs("div", { className: "bset-caps-info", children: [_jsx("span", { className: "bset-caps-label", children: "Capabilities:" }), h.capabilities?.map(c => _jsx("span", { className: "bset-cap-badge", children: c }, c))] }), _jsx("button", { className: "bset-save-btn", onClick: () => saveDefaults(h.name), disabled: saving === h.name, children: saving === h.name ? 'Saved!' : 'Save Defaults' }), h.name === 'inber' && _jsx(InberAgentsConfig, {})] }))] }, h.name));
                }) })] }));
}
// PermissionsBypassToggle is the global permission-bypass switch. When off
// (default), every tool call routes through the PreToolUse hook to
// permission-store's rule engine. When on, the prehook short-circuits to
// allow without consulting permission-store. Saved as bridge-prefs
// .bypass_permissions; bridge-server reads it on every prehook call so the
// toggle takes effect immediately for every active and future session.
function PermissionsBypassToggle({ apiFetch, basePath }) {
    const [enabled, setEnabled] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // Load current state on mount.
    useEffect(() => {
        let cancelled = false;
        apiFetch(`${basePath}/bridge-prefs`)
            .then(r => r.ok ? r.json() : null)
            .then((prefs) => {
            if (!cancelled && prefs)
                setEnabled(!!prefs.bypass_permissions);
        })
            .catch(() => { if (!cancelled)
            setEnabled(false); });
        return () => { cancelled = true; };
    }, [apiFetch, basePath]);
    const toggle = useCallback(async () => {
        if (enabled === null)
            return;
        setBusy(true);
        setError(null);
        const next = !enabled;
        try {
            const res = await apiFetch(`${basePath}/bridge/bypass-permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            setEnabled(next);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }, [enabled, apiFetch, basePath]);
    if (enabled === null) {
        return null; // initial fetch in flight
    }
    return (_jsxs("div", { className: "bset-bypass-card", children: [_jsx("h2", { className: "bset-title", children: "Permissions" }), _jsx("div", { className: "bset-bypass-row", children: _jsxs("label", { className: "bset-bypass-toggle", children: [_jsx("input", { type: "checkbox", checked: enabled, disabled: busy, onChange: toggle }), _jsxs("span", { children: [_jsx("strong", { children: "Bypass permissions" }), " \u2014 skip all rules; every tool call auto-approves"] })] }) }), _jsx("p", { className: "bset-subtitle", children: enabled
                    ? 'Bypass is ON. Every Claude Code tool call auto-approves immediately, and every Codex session launches with sandbox=danger-full-access + approval=never. Permission rules in /permissions are ignored until you turn this off.'
                    : 'Bypass is OFF. Claude Code tool calls route through permission-store rules; Codex runs in its default sandbox. Manage rules at /permissions; pending prompts surface inline in chat.' }), error && _jsx("p", { className: "bset-error", children: error })] }));
}
//# sourceMappingURL=BridgeSettings.js.map