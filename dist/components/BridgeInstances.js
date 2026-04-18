import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
import { TRANSPORT_LABEL } from '../constants';
export function BridgeInstances() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const inst = useBridgeInstances();
    const [harnesses, setHarnesses] = useState([]);
    const [credentials, setCredentials] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ name: '', harness_type: 'claude_code', host: 'localhost', transport: 'local', ssh_user: '', ssh_key_path: '', ssh_port: 22, working_dir: '', max_concurrent_sessions: 1 });
    const [statusCache, setStatusCache] = useState({});
    const [credCache, setCredCache] = useState({});
    const [expandedCreds, setExpandedCreds] = useState({});
    const [bindForm, setBindForm] = useState(null);
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
        apiFetch(`${basePath}/credentials`).then(r => r.ok ? r.json() : []).then(setCredentials).catch(() => { });
    }, [apiFetch, basePath]);
    useEffect(() => {
        for (const i of inst.instances) {
            inst.getStatus(i.id).then(s => { if (s)
                setStatusCache(prev => ({ ...prev, [i.id]: s })); });
            inst.getCredentials(i.id).then(c => setCredCache(prev => ({ ...prev, [i.id]: c })));
        }
    }, [inst.instances, inst.getStatus, inst.getCredentials]);
    const resetForm = () => {
        setForm({ name: '', harness_type: 'claude_code', host: 'localhost', transport: 'local', ssh_user: '', ssh_key_path: '', ssh_port: 22, working_dir: '', max_concurrent_sessions: 1 });
        setEditId(null);
        setShowForm(false);
    };
    const handleSubmit = useCallback(async () => {
        if (!form.name.trim())
            return;
        if (editId)
            await inst.updateInstance(editId, form);
        else
            await inst.createInstance(form);
        resetForm();
    }, [form, editId, inst]);
    const startEdit = (i) => {
        setForm({ name: i.name, harness_type: i.harness_type, host: i.host, transport: (i.transport === 'ssh' ? 'ssh' : 'local'), ssh_user: i.ssh_user ?? '', ssh_key_path: i.ssh_key_path ?? '', ssh_port: i.ssh_port ?? 22, working_dir: i.working_dir ?? '', max_concurrent_sessions: i.max_concurrent_sessions });
        setEditId(i.id);
        setShowForm(true);
    };
    const handleDelete = async (id) => {
        if (!confirm('Delete this instance?'))
            return;
        await inst.deleteInstance(id);
    };
    const toggleCreds = (id) => setExpandedCreds(prev => ({ ...prev, [id]: !prev[id] }));
    const handleBind = async () => {
        if (!bindForm)
            return;
        const ok = await inst.bindCredential(bindForm.instanceId, bindForm.credential_id, bindForm.priority, bindForm.max_concurrent);
        if (ok) {
            const creds = await inst.getCredentials(bindForm.instanceId);
            setCredCache(prev => ({ ...prev, [bindForm.instanceId]: creds }));
            setBindForm(null);
        }
    };
    const handleUnbind = async (instanceId, credId) => {
        const ok = await inst.unbindCredential(instanceId, credId);
        if (ok) {
            const creds = await inst.getCredentials(instanceId);
            setCredCache(prev => ({ ...prev, [instanceId]: creds }));
        }
    };
    const groups = new Map();
    for (const i of inst.instances) {
        const list = groups.get(i.harness_type) || [];
        list.push(i);
        groups.set(i.harness_type, list);
    }
    return (_jsxs("div", { className: "bi-container", children: [_jsxs("div", { className: "bi-header", children: [_jsx("h2", { children: "Harness Instances" }), _jsx("button", { className: "bi-add-btn", onClick: () => { resetForm(); setShowForm(true); }, children: "+ Add Instance" })] }), showForm && (_jsxs("div", { className: "bi-form-card", children: [_jsxs("div", { className: "bi-form-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Name" }), _jsx("input", { value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })), placeholder: "my-instance" })] }), _jsxs("label", { children: [_jsx("span", { children: "Harness" }), _jsx("select", { value: form.harness_type, onChange: e => setForm(f => ({ ...f, harness_type: e.target.value })), children: harnesses.map(h => _jsx("option", { value: h.name, children: h.name }, h.name)) })] }), _jsxs("label", { children: [_jsx("span", { children: "Host" }), _jsx("input", { value: form.host, onChange: e => setForm(f => ({ ...f, host: e.target.value })), placeholder: "localhost" })] }), _jsxs("label", { children: [_jsx("span", { children: "Transport" }), _jsxs("select", { value: form.transport, onChange: e => setForm(f => ({ ...f, transport: e.target.value })), children: [_jsx("option", { value: "local", children: "Local" }), _jsx("option", { value: "ssh", children: "SSH" })] })] }), form.transport === 'ssh' && (_jsxs(_Fragment, { children: [_jsxs("label", { children: [_jsx("span", { children: "SSH User" }), _jsx("input", { value: form.ssh_user, onChange: e => setForm(f => ({ ...f, ssh_user: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "SSH Key Path" }), _jsx("input", { value: form.ssh_key_path, onChange: e => setForm(f => ({ ...f, ssh_key_path: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "SSH Port" }), _jsx("input", { type: "number", value: form.ssh_port, onChange: e => setForm(f => ({ ...f, ssh_port: parseInt(e.target.value) || 22 })) })] })] })), _jsxs("label", { children: [_jsx("span", { children: "Working Dir" }), _jsx("input", { value: form.working_dir, onChange: e => setForm(f => ({ ...f, working_dir: e.target.value })), placeholder: "/home/user/project" })] }), _jsxs("label", { children: [_jsx("span", { children: "Max Sessions" }), _jsx("input", { type: "number", value: form.max_concurrent_sessions, onChange: e => setForm(f => ({ ...f, max_concurrent_sessions: parseInt(e.target.value) || 1 })), min: 1 })] })] }), _jsxs("div", { className: "bi-form-actions", children: [_jsx("button", { className: "bi-save-btn", onClick: handleSubmit, children: editId ? 'Update' : 'Create' }), _jsx("button", { className: "bi-cancel-btn", onClick: resetForm, children: "Cancel" })] })] })), inst.loading && _jsx("div", { className: "bi-loading", children: "Loading..." }), inst.error && _jsx("div", { className: "bridge-error", children: inst.error }), Array.from(groups.entries()).map(([harness, items]) => (_jsxs("div", { className: "bi-group", children: [_jsx("h3", { className: "bi-group-title", children: harness }), _jsx("div", { className: "bi-card-grid", children: items.map(item => {
                            const status = statusCache[item.id];
                            const creds = credCache[item.id] || [];
                            const expanded = expandedCreds[item.id];
                            return (_jsxs("div", { className: "bi-card", children: [_jsxs("div", { className: "bi-card-header", children: [_jsx("span", { className: "bi-card-name", children: item.name }), _jsx("span", { className: `bi-transport ${item.transport === 'ssh' ? 'bi-transport-ssh' : ''}`, children: TRANSPORT_LABEL[item.transport] }), status && _jsx("span", { className: `bi-reach ${status.reachable ? 'bi-reach-ok' : 'bi-reach-fail'}`, title: status.reachable ? 'Reachable' : 'Unreachable' })] }), _jsxs("div", { className: "bi-card-meta", children: [_jsx("span", { children: item.host }), item.transport === 'ssh' && _jsxs("span", { children: [item.ssh_user, "@:", item.ssh_port || 22] }), item.working_dir && _jsx("span", { children: item.working_dir })] }), _jsxs("div", { className: "bi-card-stats", children: [_jsxs("span", { children: ["Sessions: ", status?.active_sessions ?? 0, " / ", item.max_concurrent_sessions] }), _jsxs("span", { children: ["Credentials: ", creds.length] })] }), _jsxs("button", { className: "bi-cred-toggle", onClick: () => toggleCreds(item.id), children: [expanded ? '\u25BE' : '\u25B8', " Credentials (", creds.length, ")"] }), expanded && (_jsxs("div", { className: "bi-cred-section", children: [creds.map(c => {
                                                const slotInfo = status?.credentials?.find(s => s.credential_id === c.credential_id);
                                                return (_jsxs("div", { className: "bi-cred-row", children: [_jsx("span", { className: "bi-cred-id", children: c.credential_id }), _jsxs("span", { className: "bi-cred-pri", children: ["pri ", c.priority] }), slotInfo?.enabled && _jsx("span", { className: "bi-cred-slots", children: "active" }), _jsx("button", { className: "bi-cred-unbind", onClick: () => handleUnbind(item.id, c.credential_id), children: "x" })] }, c.credential_id));
                                            }), bindForm?.instanceId === item.id ? (_jsxs("div", { className: "bi-bind-form", children: [_jsxs("select", { value: bindForm.credential_id, onChange: e => setBindForm(f => f ? { ...f, credential_id: e.target.value } : f), children: [_jsx("option", { value: "", children: "Select credential" }), credentials.filter(c => c.enabled).map(c => (_jsxs("option", { value: c.id, children: [c.label || c.id, " (", c.provider, ")"] }, c.id)))] }), _jsx("input", { type: "number", placeholder: "Pri", value: bindForm.priority, onChange: e => setBindForm(f => f ? { ...f, priority: parseInt(e.target.value) || 0 } : f), style: { width: 50 } }), _jsx("input", { type: "number", placeholder: "Max", value: bindForm.max_concurrent, onChange: e => setBindForm(f => f ? { ...f, max_concurrent: parseInt(e.target.value) || 1 } : f), style: { width: 50 } }), _jsx("button", { className: "bi-save-btn", onClick: handleBind, children: "Bind" }), _jsx("button", { className: "bi-cancel-btn", onClick: () => setBindForm(null), children: "x" })] })) : (_jsx("button", { className: "bi-bind-btn", onClick: () => setBindForm({ instanceId: item.id, credential_id: '', priority: 0, max_concurrent: 1 }), children: "+ Bind credential" }))] })), _jsxs("div", { className: "bi-card-actions", children: [_jsx("button", { onClick: () => startEdit(item), children: "Edit" }), _jsx("button", { className: "bi-delete-btn", onClick: () => handleDelete(item.id), children: "Delete" })] })] }, item.id));
                        }) })] }, harness))), !inst.loading && inst.instances.length === 0 && (_jsx("div", { className: "bi-empty", children: "No instances configured. Click \"Add Instance\" to create one." }))] }));
}
//# sourceMappingURL=BridgeInstances.js.map