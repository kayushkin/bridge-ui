import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeTools } from '../useBridgeTools';
/**
 * Top-level Tools page. Lists every tool registered in tool-store with
 * description, kind, tags, and toggles for both global enable/disable and
 * per-instance opt-in. Discovery section at the bottom shows in-process
 * locals not yet upserted into the registry.
 *
 * Global is master: per-instance toggle is disabled (and flipped off) when
 * the tool is globally disabled. UI mirrors backend semantics.
 */
export function BridgeTools() {
    const { instances, loading: instancesLoading } = useBridgeInstances();
    const [selectedInstanceID, setSelectedInstanceID] = useState(null);
    const { tools, locals, byInstance, loading, error, setGlobal, setForInstance } = useBridgeTools(selectedInstanceID);
    const [expanded, setExpanded] = useState(new Set());
    const enabledTools = instances.filter(i => i.enabled);
    const localToolNames = useMemo(() => new Set(tools.filter(t => t.kind === 'local').map(t => t.name)), [tools]);
    const orphanLocals = useMemo(() => locals.filter(l => !localToolNames.has(l.name)), [locals, localToolNames]);
    const toggleExpanded = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    return (_jsxs("div", { className: "bt-container", children: [_jsxs("div", { className: "bt-header", children: [_jsx("h2", { children: "Tools" }), _jsx("button", { className: "bi-add-btn", onClick: () => window.location.reload(), children: "\u21BB Refresh" })] }), error && _jsx("div", { className: "bridge-error", children: error }), _jsxs("div", { className: "bt-instance-row", children: [_jsx("label", { children: "Per-instance view:" }), _jsxs("select", { className: "bt-instance-select", value: selectedInstanceID ?? '', onChange: e => setSelectedInstanceID(e.target.value || null), disabled: instancesLoading || enabledTools.length === 0, children: [_jsx("option", { value: "", children: "\u2014 none (global view) \u2014" }), enabledTools.map(i => (_jsxs("option", { value: i.id, children: [i.harness_type, " \u00B7 ", i.name, " (", i.id, ")"] }, i.id)))] })] }), loading ? (_jsx("div", { className: "bi-loading", children: "Loading tools\u2026" })) : tools.length === 0 ? (_jsx("div", { className: "bi-empty", children: "No tools registered. Tool-store seeds locals on startup; check that it's running." })) : (_jsxs("table", { className: "bt-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Kind" }), _jsx("th", { children: "Description" }), _jsx("th", { children: "Tags" }), _jsx("th", { className: "bt-col-toggle", children: "Global" }), _jsx("th", { className: "bt-col-toggle", children: selectedInstanceID ? 'For instance' : '' })] }) }), _jsx("tbody", { children: tools.map(t => (_jsx(ToolRow, { tool: t, expanded: expanded.has(t.id), onToggleExpand: () => toggleExpanded(t.id), instanceSelected: !!selectedInstanceID, inInstance: byInstance.has(t.name), onSetGlobal: (on) => setGlobal(t.id, on), onSetForInstance: (on) => setForInstance(t.name, on) }, t.id))) })] })), orphanLocals.length > 0 && (_jsxs("div", { className: "bt-discovery", children: [_jsx("h3", { children: "Discovered locals (not registered)" }), _jsx("p", { className: "bt-hint", children: "These tools are compiled into the running tool-store binary but have no registry row. They become enabled-able once tool-store seeds them on startup. Restart the service if missing." }), _jsx("ul", { className: "bt-orphan-list", children: orphanLocals.map(l => (_jsxs("li", { children: [_jsx("code", { children: l.name }), " \u2014 ", l.description] }, l.name))) })] }))] }));
}
function ToolRow({ tool, expanded, onToggleExpand, instanceSelected, inInstance, onSetGlobal, onSetForInstance, }) {
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { className: `bt-row bt-row-kind-${tool.kind}`, children: [_jsxs("td", { className: "bt-name", children: [_jsx("button", { className: "bt-expand-btn", onClick: onToggleExpand, "aria-label": expanded ? 'Collapse' : 'Expand', children: expanded ? '▾' : '▸' }), _jsx("code", { children: tool.name }), tool.display_name && _jsx("span", { className: "bt-display-name", children: tool.display_name })] }), _jsx("td", { children: _jsx("span", { className: `bt-kind bt-kind-${tool.kind}`, children: tool.kind }) }), _jsx("td", { className: "bt-desc", children: tool.description }), _jsx("td", { className: "bt-tags", children: tool.tags?.map(tag => _jsx("span", { className: "bt-tag", children: tag }, tag)) }), _jsx("td", { className: "bt-col-toggle", children: _jsx(Toggle, { on: tool.enabled, onChange: onSetGlobal }) }), _jsx("td", { className: "bt-col-toggle", children: instanceSelected && (_jsx(Toggle, { on: inInstance, disabled: !tool.enabled, title: tool.enabled ? '' : 'Globally disabled', onChange: onSetForInstance })) })] }), expanded && (_jsx("tr", { className: "bt-detail-row", children: _jsx("td", { colSpan: 6, children: _jsx(ToolDetail, { tool: tool }) }) }))] }));
}
function ToolDetail({ tool }) {
    return (_jsxs("div", { className: "bt-detail", children: [tool.env_keys && tool.env_keys.length > 0 && (_jsxs("div", { className: "bt-detail-block", children: [_jsx("h4", { children: "Required env vars" }), _jsx("ul", { className: "bt-env-list", children: tool.env_keys.map(k => (_jsxs("li", { children: [_jsx("code", { children: k }), tool.credentials?.[k] && (_jsxs("span", { className: "bt-cred-bind", children: [" \u2192 auth-store provider ", _jsx("code", { children: tool.credentials[k] })] })), !tool.credentials?.[k] && _jsx("span", { className: "bt-cred-missing", children: " (no credential mapping)" })] }, k))) })] })), tool.mcp && (_jsxs("div", { className: "bt-detail-block", children: [_jsx("h4", { children: "MCP launcher" }), _jsx("pre", { className: "bt-spec", children: JSON.stringify(tool.mcp, null, 2) })] })), tool.cli && (_jsxs("div", { className: "bt-detail-block", children: [_jsx("h4", { children: "CLI command" }), _jsx("pre", { className: "bt-spec", children: JSON.stringify(tool.cli, null, 2) })] })), tool.local && (_jsxs("div", { className: "bt-detail-block", children: [_jsx("h4", { children: "Local impl" }), _jsxs("p", { children: ["Symbol: ", _jsx("code", { children: tool.local.symbol }), " (in-process Go function)"] })] })), tool.input_schema !== undefined && tool.input_schema !== null && (_jsxs("div", { className: "bt-detail-block", children: [_jsx("h4", { children: "Input schema" }), _jsx("pre", { className: "bt-spec", children: JSON.stringify(tool.input_schema, null, 2) })] }))] }));
}
function Toggle({ on, disabled, title, onChange, }) {
    const [busy, setBusy] = useState(false);
    const handle = async () => {
        if (busy || disabled)
            return;
        setBusy(true);
        await onChange(!on);
        setBusy(false);
    };
    return (_jsx("button", { type: "button", className: `bt-toggle ${on ? 'bt-toggle-on' : 'bt-toggle-off'}${disabled ? ' bt-toggle-disabled' : ''}`, onClick: handle, disabled: busy || disabled, title: title, "aria-pressed": on, children: _jsx("span", { className: "bt-toggle-knob" }) }));
}
//# sourceMappingURL=BridgeTools.js.map