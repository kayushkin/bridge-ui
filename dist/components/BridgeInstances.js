import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeHarnesses } from '../useBridgeHarnesses';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeMachines } from '../useBridgeMachines';
import { TRANSPORT_LABEL } from '../constants';
const emptyMachineForm = () => ({
    name: '',
    emoji: '',
    hostname: '',
    transport: 'local',
    ssh_user: '',
    ssh_key_path: '',
    ssh_port: 22,
    default_working_dir: '',
    notes: '',
});
const emptyInstanceForm = (defaultMachineID = '') => ({
    name: '',
    harness_type: 'claude_code',
    machine_id: defaultMachineID,
    working_dir: '',
    max_concurrent_sessions: 1,
});
export function BridgeInstances() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const inst = useBridgeInstances();
    const mach = useBridgeMachines();
    const { harnesses } = useBridgeHarnesses();
    const [credentials, setCredentials] = useState([]);
    const [statusCache, setStatusCache] = useState({});
    const [credCache, setCredCache] = useState({});
    const [expandedCreds, setExpandedCreds] = useState({});
    const [bindForm, setBindForm] = useState(null);
    const [showMachineForm, setShowMachineForm] = useState(false);
    const [editMachineId, setEditMachineId] = useState(null);
    const [machineForm, setMachineForm] = useState(emptyMachineForm());
    const [showInstanceForm, setShowInstanceForm] = useState(false);
    const [editInstanceId, setEditInstanceId] = useState(null);
    const [instanceForm, setInstanceForm] = useState(emptyInstanceForm());
    useEffect(() => {
        apiFetch(`${basePath}/credentials`).then(r => r.ok ? r.json() : []).then(setCredentials).catch(() => { });
    }, [apiFetch, basePath]);
    useEffect(() => {
        for (const i of inst.instances) {
            inst.getStatus(i.id).then(s => { if (s)
                setStatusCache(prev => ({ ...prev, [i.id]: s })); });
            inst.getCredentials(i.id).then(c => setCredCache(prev => ({ ...prev, [i.id]: c })));
        }
    }, [inst.instances, inst.getStatus, inst.getCredentials]);
    // ────────────── Machine form ──────────────
    const resetMachineForm = () => {
        setMachineForm(emptyMachineForm());
        setEditMachineId(null);
        setShowMachineForm(false);
    };
    const startEditMachine = (m) => {
        setMachineForm({
            name: m.name,
            emoji: m.emoji ?? '',
            hostname: m.hostname ?? '',
            transport: m.transport,
            ssh_user: m.ssh_user ?? '',
            ssh_key_path: m.ssh_key_path ?? '',
            ssh_port: m.ssh_port ?? 22,
            default_working_dir: m.default_working_dir ?? '',
            notes: m.notes ?? '',
        });
        setEditMachineId(m.id);
        setShowMachineForm(true);
    };
    const submitMachine = useCallback(async () => {
        if (!machineForm.name.trim())
            return;
        const body = {
            name: machineForm.name.trim(),
            emoji: machineForm.emoji,
            hostname: machineForm.hostname,
            transport: machineForm.transport,
            ssh_user: machineForm.ssh_user,
            ssh_key_path: machineForm.ssh_key_path,
            ssh_port: machineForm.ssh_port,
            default_working_dir: machineForm.default_working_dir,
            notes: machineForm.notes,
        };
        if (editMachineId)
            await mach.updateMachine(editMachineId, body);
        else
            await mach.createMachine(body);
        resetMachineForm();
    }, [machineForm, editMachineId, mach]);
    const handleDeleteMachine = async (id) => {
        if (!confirm('Delete this machine? All bound instances will be deleted too.'))
            return;
        await mach.deleteMachine(id);
    };
    // ────────────── Instance form ──────────────
    const defaultMachineID = mach.machines[0]?.id ?? '';
    const resetInstanceForm = () => {
        setInstanceForm(emptyInstanceForm(defaultMachineID));
        setEditInstanceId(null);
        setShowInstanceForm(false);
    };
    const startEditInstance = (i) => {
        setInstanceForm({
            name: i.name,
            harness_type: i.harness_type,
            machine_id: i.machine_id ?? '',
            working_dir: i.working_dir ?? '',
            max_concurrent_sessions: i.max_concurrent_sessions,
        });
        setEditInstanceId(i.id);
        setShowInstanceForm(true);
    };
    const submitInstance = useCallback(async () => {
        if (!instanceForm.name.trim() || !instanceForm.machine_id)
            return;
        if (editInstanceId)
            await inst.updateInstance(editInstanceId, instanceForm);
        else
            await inst.createInstance(instanceForm);
        resetInstanceForm();
    }, [instanceForm, editInstanceId, inst]);
    const handleDeleteInstance = async (id) => {
        if (!confirm('Delete this instance?'))
            return;
        await inst.deleteInstance(id);
    };
    // ────────────── Credential bindings (unchanged shape) ──────────────
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
    // ────────────── Render helpers ──────────────
    const machineCounts = useMemo(() => {
        const out = new Map();
        for (const i of inst.instances) {
            out.set(i.machine_id, (out.get(i.machine_id) ?? 0) + 1);
        }
        return out;
    }, [inst.instances]);
    const groups = useMemo(() => {
        const m = new Map();
        for (const i of inst.instances) {
            const arr = m.get(i.harness_type) || [];
            arr.push(i);
            m.set(i.harness_type, arr);
        }
        return m;
    }, [inst.instances]);
    return (_jsxs("div", { className: "bi-container", children: [_jsxs("div", { className: "bi-header", children: [_jsx("h2", { children: "Machines" }), _jsx("button", { className: "bi-add-btn", onClick: () => { resetMachineForm(); setShowMachineForm(true); }, children: "+ Add Machine" })] }), showMachineForm && (_jsxs("div", { className: "bi-form-card", children: [_jsxs("div", { className: "bi-form-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Name" }), _jsx("input", { value: machineForm.name, onChange: e => setMachineForm(f => ({ ...f, name: e.target.value })), placeholder: "laptop" })] }), _jsxs("label", { children: [_jsx("span", { children: "Emoji" }), _jsx("input", { value: machineForm.emoji, onChange: e => setMachineForm(f => ({ ...f, emoji: e.target.value })), placeholder: "\uD83D\uDDA5", maxLength: 4 })] }), _jsxs("label", { children: [_jsx("span", { children: "Transport" }), _jsxs("select", { value: machineForm.transport, onChange: e => setMachineForm(f => ({ ...f, transport: e.target.value })), children: [_jsx("option", { value: "local", children: "Local" }), _jsx("option", { value: "ssh", children: "SSH" }), _jsx("option", { value: "runner", children: "Runner" })] })] }), _jsxs("label", { children: [_jsx("span", { children: "Hostname" }), _jsx("input", { value: machineForm.hostname, onChange: e => setMachineForm(f => ({ ...f, hostname: e.target.value })), placeholder: machineForm.transport === 'runner' ? '(runner self-reports)' : 'host or IP' })] }), machineForm.transport === 'ssh' && (_jsxs(_Fragment, { children: [_jsxs("label", { children: [_jsx("span", { children: "SSH User" }), _jsx("input", { value: machineForm.ssh_user, onChange: e => setMachineForm(f => ({ ...f, ssh_user: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "SSH Key Path" }), _jsx("input", { value: machineForm.ssh_key_path, onChange: e => setMachineForm(f => ({ ...f, ssh_key_path: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "SSH Port" }), _jsx("input", { type: "number", value: machineForm.ssh_port, onChange: e => setMachineForm(f => ({ ...f, ssh_port: parseInt(e.target.value) || 22 })) })] })] })), _jsxs("label", { children: [_jsx("span", { children: "Default Workdir" }), _jsx("input", { value: machineForm.default_working_dir, onChange: e => setMachineForm(f => ({ ...f, default_working_dir: e.target.value })), placeholder: "/home/user" })] }), _jsxs("label", { className: "bi-form-wide", children: [_jsx("span", { children: "Notes" }), _jsx("input", { value: machineForm.notes, onChange: e => setMachineForm(f => ({ ...f, notes: e.target.value })) })] })] }), _jsxs("div", { className: "bi-form-actions", children: [_jsx("button", { className: "bi-save-btn", onClick: submitMachine, children: editMachineId ? 'Update' : 'Create' }), _jsx("button", { className: "bi-cancel-btn", onClick: resetMachineForm, children: "Cancel" })] })] })), _jsx("div", { className: "bi-card-grid", children: mach.machines.map(m => (_jsxs("div", { className: "bi-card", children: [_jsxs("div", { className: "bi-card-header", children: [m.emoji && _jsx("span", { className: "bi-machine-emoji", "aria-hidden": true, children: m.emoji }), _jsx("span", { className: "bi-card-name", children: m.name }), _jsx("span", { className: "bi-transport", children: TRANSPORT_LABEL[m.transport] ?? m.transport })] }), _jsxs("div", { className: "bi-card-meta", children: [m.hostname && _jsx("span", { children: m.hostname }), m.transport === 'ssh' && m.ssh_user && _jsxs("span", { children: [m.ssh_user, "@:", m.ssh_port || 22] }), m.transport === 'runner' && m.user && _jsxs("span", { children: ["user: ", m.user] }), m.default_working_dir && _jsxs("span", { children: ["cwd: ", m.default_working_dir] })] }), _jsxs("div", { className: "bi-card-stats", children: [_jsxs("span", { children: ["Instances: ", machineCounts.get(m.id) ?? 0] }), m.os && _jsxs("span", { children: [m.os, "/", m.arch] })] }), _jsxs("div", { className: "bi-card-actions", children: [_jsx("button", { onClick: () => startEditMachine(m), children: "Edit" }), _jsx("button", { className: "bi-delete-btn", onClick: () => handleDeleteMachine(m.id), children: "Delete" })] })] }, m.id))) }), !mach.loading && mach.machines.length === 0 && (_jsx("div", { className: "bi-empty", children: "No machines configured. Click \"Add Machine\" to create one." })), _jsxs("div", { className: "bi-header", style: { marginTop: 24 }, children: [_jsx("h2", { children: "Harness Instances" }), _jsx("button", { className: "bi-add-btn", onClick: () => { resetInstanceForm(); setShowInstanceForm(true); }, disabled: mach.machines.length === 0, title: mach.machines.length === 0 ? 'Create a machine first' : '', children: "+ Add Instance" })] }), showInstanceForm && (_jsxs("div", { className: "bi-form-card", children: [_jsxs("div", { className: "bi-form-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Name" }), _jsx("input", { value: instanceForm.name, onChange: e => setInstanceForm(f => ({ ...f, name: e.target.value })), placeholder: "my-instance" })] }), _jsxs("label", { children: [_jsx("span", { children: "Harness" }), _jsx("select", { value: instanceForm.harness_type, onChange: e => setInstanceForm(f => ({ ...f, harness_type: e.target.value })), children: harnesses.map(h => _jsx("option", { value: h.name, children: h.name }, h.name)) })] }), _jsxs("label", { children: [_jsx("span", { children: "Machine" }), _jsxs("select", { value: instanceForm.machine_id, onChange: e => setInstanceForm(f => ({ ...f, machine_id: e.target.value })), children: [_jsx("option", { value: "", children: "\u2014 pick a machine \u2014" }), mach.machines.map(m => _jsxs("option", { value: m.id, children: [m.emoji ? `${m.emoji} ` : '', m.name] }, m.id))] })] }), _jsxs("label", { children: [_jsx("span", { children: "Working Dir" }), _jsx("input", { value: instanceForm.working_dir, onChange: e => setInstanceForm(f => ({ ...f, working_dir: e.target.value })), placeholder: "(uses machine default)" })] }), _jsxs("label", { children: [_jsx("span", { children: "Max Sessions" }), _jsx("input", { type: "number", value: instanceForm.max_concurrent_sessions, onChange: e => setInstanceForm(f => ({ ...f, max_concurrent_sessions: parseInt(e.target.value) || 1 })), min: 1 })] })] }), _jsxs("div", { className: "bi-form-actions", children: [_jsx("button", { className: "bi-save-btn", onClick: submitInstance, children: editInstanceId ? 'Update' : 'Create' }), _jsx("button", { className: "bi-cancel-btn", onClick: resetInstanceForm, children: "Cancel" })] })] })), inst.loading && _jsx("div", { className: "bi-loading", children: "Loading..." }), inst.error && _jsx("div", { className: "bridge-error", children: inst.error }), Array.from(groups.entries()).map(([harness, items]) => (_jsxs("div", { className: "bi-group", children: [_jsx("h3", { className: "bi-group-title", children: harness }), _jsx("div", { className: "bi-card-grid", children: items.map(item => {
                            const status = statusCache[item.id];
                            const creds = credCache[item.id] || [];
                            const expanded = expandedCreds[item.id];
                            const m = item.machine;
                            return (_jsxs("div", { className: "bi-card", children: [_jsxs("div", { className: "bi-card-header", children: [_jsx("span", { className: "bi-card-name", children: item.name }), m && (_jsxs("span", { className: `bi-transport ${m.transport === 'ssh' ? 'bi-transport-ssh' : ''}`, children: [m.emoji ? `${m.emoji} ` : '', m.name] })), status && _jsx("span", { className: `bi-reach ${status.reachable ? 'bi-reach-ok' : 'bi-reach-fail'}`, title: status.reachable ? 'Reachable' : 'Unreachable' })] }), _jsxs("div", { className: "bi-card-meta", children: [m?.hostname && _jsx("span", { children: m.hostname }), m?.transport === 'ssh' && _jsxs("span", { children: [m.ssh_user, "@:", m.ssh_port || 22] }), item.working_dir && _jsx("span", { children: item.working_dir })] }), _jsxs("div", { className: "bi-card-stats", children: [_jsxs("span", { children: ["Sessions: ", status?.active_sessions ?? 0, " / ", item.max_concurrent_sessions] }), _jsxs("span", { children: ["Credentials: ", creds.length] })] }), _jsxs("button", { className: "bi-cred-toggle", onClick: () => toggleCreds(item.id), children: [expanded ? '▾' : '▸', " Credentials (", creds.length, ")"] }), expanded && (_jsxs("div", { className: "bi-cred-section", children: [creds.map(c => {
                                                const slotInfo = status?.credentials?.find(s => s.credential_id === c.credential_id);
                                                return (_jsxs("div", { className: "bi-cred-row", children: [_jsx("span", { className: "bi-cred-id", children: c.credential_id }), _jsxs("span", { className: "bi-cred-pri", children: ["pri ", c.priority] }), slotInfo?.enabled && _jsx("span", { className: "bi-cred-slots", children: "active" }), _jsx("button", { className: "bi-cred-unbind", onClick: () => handleUnbind(item.id, c.credential_id), children: "x" })] }, c.credential_id));
                                            }), bindForm?.instanceId === item.id ? (_jsxs("div", { className: "bi-bind-form", children: [_jsxs("select", { value: bindForm.credential_id, onChange: e => setBindForm(f => f ? { ...f, credential_id: e.target.value } : f), children: [_jsx("option", { value: "", children: "Select credential" }), credentials.filter(c => c.enabled).map(c => (_jsxs("option", { value: c.id, children: [c.label || c.id, " (", c.provider, ")"] }, c.id)))] }), _jsx("input", { type: "number", placeholder: "Pri", value: bindForm.priority, onChange: e => setBindForm(f => f ? { ...f, priority: parseInt(e.target.value) || 0 } : f), style: { width: 50 } }), _jsx("input", { type: "number", placeholder: "Max", value: bindForm.max_concurrent, onChange: e => setBindForm(f => f ? { ...f, max_concurrent: parseInt(e.target.value) || 1 } : f), style: { width: 50 } }), _jsx("button", { className: "bi-save-btn", onClick: handleBind, children: "Bind" }), _jsx("button", { className: "bi-cancel-btn", onClick: () => setBindForm(null), children: "x" })] })) : (_jsx("button", { className: "bi-bind-btn", onClick: () => setBindForm({ instanceId: item.id, credential_id: '', priority: 0, max_concurrent: 1 }), children: "+ Bind credential" }))] })), _jsxs("div", { className: "bi-card-actions", children: [_jsx("button", { onClick: () => startEditInstance(item), children: "Edit" }), _jsx("button", { className: "bi-delete-btn", onClick: () => handleDeleteInstance(item.id), children: "Delete" })] })] }, item.id));
                        }) })] }, harness))), !inst.loading && inst.instances.length === 0 && (_jsx("div", { className: "bi-empty", children: "No instances configured. Click \"Add Instance\" to create one." }))] }));
}
//# sourceMappingURL=BridgeInstances.js.map