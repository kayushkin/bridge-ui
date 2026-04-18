import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
const PROVIDERS = [
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'google', label: 'Google' },
    { id: 'github', label: 'GitHub' },
];
export function BridgeAuth() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const [credentials, setCredentials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showAddKey, setShowAddKey] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', provider: 'anthropic', api_key: '' });
    const [saving, setSaving] = useState(false);
    const instances = useBridgeInstances();
    const [bindingsCache, setBindingsCache] = useState({});
    const [expandedCred, setExpandedCred] = useState(null);
    const [bindForm, setBindForm] = useState(null);
    const fetchCredentials = useCallback(async () => {
        try {
            const res = await apiFetch(`${basePath}/credentials`);
            if (!res.ok) {
                setError(`HTTP ${res.status}`);
                return;
            }
            setCredentials(await res.json() || []);
            setError(null);
        }
        catch (err) {
            setError(`${err}`);
        }
        finally {
            setLoading(false);
        }
    }, [apiFetch, basePath]);
    useEffect(() => { fetchCredentials(); }, [fetchCredentials]);
    useEffect(() => {
        for (const inst of instances.instances) {
            instances.getCredentials(inst.id).then(creds => {
                setBindingsCache(prev => ({ ...prev, [inst.id]: creds }));
            });
        }
    }, [instances.instances, instances.getCredentials]);
    const toggleCredential = useCallback(async (id, enabled) => {
        try {
            await apiFetch(`${basePath}/credentials/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, enabled }),
            });
            setCredentials(prev => prev.map(c => c.id === id ? { ...c, enabled } : c));
        }
        catch { /* ignore */ }
    }, [apiFetch, basePath]);
    const handleAddKey = useCallback(async () => {
        if (!addForm.name.trim() || !addForm.api_key.trim())
            return;
        setSaving(true);
        try {
            const res = await apiFetch(`${basePath}/credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: addForm.name.trim(), provider: addForm.provider, type: 'api_key', key: addForm.api_key.trim() }),
            });
            if (!res.ok) {
                setError(`Failed to add key: ${res.statusText}`);
                return;
            }
            setAddForm({ name: '', provider: 'anthropic', api_key: '' });
            setShowAddKey(false);
            await fetchCredentials();
        }
        catch (err) {
            setError(`Failed to add key: ${err}`);
        }
        finally {
            setSaving(false);
        }
    }, [addForm, fetchCredentials, apiFetch, basePath]);
    const handleDelete = useCallback(async (id) => {
        if (!confirm(`Delete credential "${id}"?`))
            return;
        try {
            const res = await apiFetch(`${basePath}/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok || res.status === 204)
                await fetchCredentials();
            else
                setError(`Delete failed: ${res.statusText}`);
        }
        catch (err) {
            setError(`Delete failed: ${err}`);
        }
    }, [fetchCredentials, apiFetch, basePath]);
    const credentialBindings = useCallback((credId) => {
        const results = [];
        for (const inst of instances.instances) {
            const bindings = bindingsCache[inst.id] || [];
            const binding = bindings.find(b => b.credential_id === credId);
            if (binding)
                results.push({ instance: inst, binding });
        }
        return results;
    }, [instances.instances, bindingsCache]);
    const handleBind = useCallback(async () => {
        if (!bindForm)
            return;
        const ok = await instances.bindCredential(bindForm.instance_id, bindForm.credentialId, bindForm.priority, bindForm.max_concurrent);
        if (ok) {
            const creds = await instances.getCredentials(bindForm.instance_id);
            setBindingsCache(prev => ({ ...prev, [bindForm.instance_id]: creds }));
            setBindForm(null);
        }
    }, [bindForm, instances]);
    const handleUnbind = useCallback(async (instanceId, credId) => {
        const ok = await instances.unbindCredential(instanceId, credId);
        if (ok) {
            const creds = await instances.getCredentials(instanceId);
            setBindingsCache(prev => ({ ...prev, [instanceId]: creds }));
        }
    }, [instances]);
    const isExpired = (expiresAt) => expiresAt > 0 && expiresAt < Date.now();
    return (_jsxs("div", { className: "ba-container", children: [_jsxs("div", { className: "ba-header", children: [_jsx("h2", { children: "Auth Management" }), _jsx("button", { className: "ba-add-btn", onClick: () => setShowAddKey(true), children: "+ Add API Key" })] }), error && _jsxs("div", { className: "bridge-error", children: [error, " ", _jsx("button", { className: "ba-dismiss", onClick: () => setError(null), children: "dismiss" })] }), showAddKey && (_jsxs("div", { className: "ba-form-card", children: [_jsx("h3", { children: "Add API Key" }), _jsxs("div", { className: "ba-form-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Name / Label" }), _jsx("input", { value: addForm.name, onChange: e => setAddForm(f => ({ ...f, name: e.target.value })), placeholder: "my-anthropic-key" })] }), _jsxs("label", { children: [_jsx("span", { children: "Provider" }), _jsx("select", { value: addForm.provider, onChange: e => setAddForm(f => ({ ...f, provider: e.target.value })), children: PROVIDERS.map(p => _jsx("option", { value: p.id, children: p.label }, p.id)) })] }), _jsxs("label", { className: "ba-span-full", children: [_jsx("span", { children: "API Key" }), _jsx("input", { type: "password", value: addForm.api_key, onChange: e => setAddForm(f => ({ ...f, api_key: e.target.value })), placeholder: "sk-ant-..." })] })] }), _jsxs("div", { className: "ba-form-actions", children: [_jsx("button", { className: "ba-save-btn", onClick: handleAddKey, disabled: saving || !addForm.name.trim() || !addForm.api_key.trim(), children: saving ? 'Saving...' : 'Save' }), _jsx("button", { className: "ba-cancel-btn", onClick: () => { setShowAddKey(false); setAddForm({ name: '', provider: 'anthropic', api_key: '' }); }, children: "Cancel" })] })] })), loading ? (_jsx("div", { className: "ba-loading", children: "Loading credentials..." })) : credentials.length === 0 ? (_jsx("div", { className: "ba-empty", children: "No credentials configured. Add an API key to get started." })) : (_jsx("div", { className: "ba-cred-grid", children: credentials.map(cred => {
                    const bindings = credentialBindings(cred.id);
                    const isExp = isExpired(cred.expires_at);
                    const expanded = expandedCred === cred.id;
                    return (_jsxs("div", { className: `ba-cred-card ${!cred.enabled ? 'ba-cred-disabled' : ''} ${isExp ? 'ba-cred-expired' : ''}`, children: [_jsxs("div", { className: "ba-cred-header", children: [_jsx("span", { className: "ba-cred-provider", children: cred.provider }), _jsx("span", { className: "ba-cred-label", children: cred.label }), _jsx("span", { className: "ba-auth-type", children: cred.auth_type }), isExp && _jsx("span", { className: "ba-expired-badge", children: "expired" })] }), _jsxs("div", { className: "ba-cred-details", children: [cred.api_key_masked && _jsx("span", { className: "ba-masked-key", children: cred.api_key_masked }), cred.token_masked && _jsx("span", { className: "ba-masked-key", children: cred.token_masked }), (cred.error_count ?? 0) > 0 && _jsxs("span", { className: "ba-error-count", children: [cred.error_count, " errors"] }), cred.last_error && _jsx("span", { className: "ba-last-error", title: cred.last_error, children: cred.last_error })] }), _jsxs("button", { className: "ba-bindings-toggle", onClick: () => setExpandedCred(expanded ? null : cred.id), children: [expanded ? '\u25BE' : '\u25B8', " Bound to ", bindings.length, " instance", bindings.length !== 1 ? 's' : ''] }), expanded && (_jsxs("div", { className: "ba-bindings-section", children: [bindings.map(({ instance, binding }) => (_jsxs("div", { className: "ba-binding-row", children: [_jsx("span", { children: instance.name }), _jsxs("span", { className: "ba-binding-pri", children: ["pri ", binding.priority] }), _jsx("button", { className: "ba-unbind-btn", onClick: () => handleUnbind(instance.id, cred.id), children: "x" })] }, instance.id))), bindForm?.credentialId === cred.id ? (_jsxs("div", { className: "ba-bind-form", children: [_jsxs("select", { value: bindForm.instance_id, onChange: e => setBindForm(f => f ? { ...f, instance_id: e.target.value } : f), children: [_jsx("option", { value: "", children: "Select instance" }), instances.instances.filter(i => i.enabled && !bindings.some(b => b.instance.id === i.id)).map(i => (_jsxs("option", { value: i.id, children: [i.name, " (", i.harness_type, ")"] }, i.id)))] }), _jsx("input", { type: "number", placeholder: "Pri", value: bindForm.priority, onChange: e => setBindForm(f => f ? { ...f, priority: parseInt(e.target.value) || 0 } : f), style: { width: 50 } }), _jsx("input", { type: "number", placeholder: "Max", value: bindForm.max_concurrent, onChange: e => setBindForm(f => f ? { ...f, max_concurrent: parseInt(e.target.value) || 1 } : f), style: { width: 50 } }), _jsx("button", { className: "ba-save-btn", onClick: handleBind, disabled: !bindForm.instance_id, children: "Bind" }), _jsx("button", { className: "ba-cancel-btn", onClick: () => setBindForm(null), children: "x" })] })) : (_jsx("button", { className: "ba-add-bind-btn", onClick: () => setBindForm({ credentialId: cred.id, instance_id: '', priority: 0, max_concurrent: 1 }), children: "+ Bind to instance" }))] })), _jsxs("div", { className: "ba-cred-actions", children: [_jsx("button", { className: `ba-toggle-btn ${cred.enabled ? 'ba-toggle-on' : 'ba-toggle-off'}`, onClick: () => toggleCredential(cred.id, !cred.enabled), children: cred.enabled ? 'Enabled' : 'Disabled' }), _jsx("button", { className: "ba-delete-btn", onClick: () => handleDelete(cred.id), children: "Delete" })] })] }, cred.id));
                }) }))] }));
}
//# sourceMappingURL=BridgeAuth.js.map