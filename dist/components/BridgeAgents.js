import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../context';
export function BridgeAgents() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [collapsed, setCollapsed] = useState(new Set());
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ slug: '', display_name: '', emoji: '', projects: '', description: '' });
    const [editing, setEditing] = useState(null);
    const [editDesc, setEditDesc] = useState('');
    const fetchAgents = useCallback(async () => {
        try {
            const res = await apiFetch(`${basePath}/agents?expanded=true`);
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
    }, [apiFetch, basePath]);
    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 30000);
        return () => clearInterval(interval);
    }, [fetchAgents]);
    const addAgent = async () => {
        if (!addForm.slug.trim())
            return;
        try {
            const res = await apiFetch(`${basePath}/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug: addForm.slug.trim(),
                    display_name: addForm.display_name.trim(),
                    emoji: addForm.emoji.trim(),
                    projects: addForm.projects.trim(),
                    description: addForm.description.trim(),
                    enabled: true,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || `HTTP ${res.status}`);
                return;
            }
            setAddForm({ slug: '', display_name: '', emoji: '', projects: '', description: '' });
            setShowAdd(false);
            fetchAgents();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to add');
        }
    };
    const updateAgent = async (slug, body) => {
        const res = await apiFetch(`${basePath}/agents/${encodeURIComponent(slug)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || `HTTP ${res.status}`);
            return false;
        }
        return true;
    };
    const deleteAgent = async (slug) => {
        if (!confirm(`Remove agent "${slug}"?`))
            return;
        const res = await apiFetch(`${basePath}/agents/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        if (res.ok)
            fetchAgents();
        else
            setError(`Delete failed: ${res.statusText}`);
    };
    const toggleEnabled = async (a) => {
        const ok = await updateAgent(a.name, {
            slug: a.name,
            display_name: a.display_name || '',
            emoji: a.emoji || '',
            projects: a.project || '',
            enabled: !a.enabled,
        });
        if (ok)
            fetchAgents();
    };
    const saveEdit = async (a) => {
        const ok = await updateAgent(a.name, {
            slug: a.name,
            display_name: a.display_name || '',
            emoji: a.emoji || '',
            projects: a.project || '',
            description: editDesc,
            enabled: a.enabled,
        });
        if (ok) {
            setEditing(null);
            fetchAgents();
        }
    };
    const toggleSection = (orch) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(orch))
                next.delete(orch);
            else
                next.add(orch);
            return next;
        });
    };
    if (loading)
        return _jsx("div", { className: "bagents-container", children: _jsx("p", { children: "Loading..." }) });
    if (error && agents.length === 0)
        return (_jsxs("div", { className: "bagents-container", children: [_jsxs("p", { className: "bridge-error", children: ["Error: ", error] }), _jsx("button", { className: "bagents-btn", onClick: () => { setLoading(true); fetchAgents(); }, children: "Retry" })] }));
    const grouped = agents.reduce((acc, a) => {
        const key = a.orchestrator;
        if (!acc[key])
            acc[key] = [];
        acc[key].push(a);
        return acc;
    }, {});
    const orchIcon = (orch) => {
        const list = grouped[orch] ?? [];
        const def = list.find(a => a.is_default);
        return (def ?? list[0])?.orch_emoji || (def ?? list[0])?.emoji || '';
    };
    return (_jsxs("div", { className: "bagents-container", children: [_jsxs("div", { className: "bagents-header", children: [_jsx("h2", { children: "Agent Registry" }), _jsxs("div", { className: "bagents-header-right", children: [_jsxs("span", { className: "bagents-count", children: [agents.length, " agents"] }), _jsx("button", { className: "bagents-add-btn", onClick: () => setShowAdd(!showAdd), children: showAdd ? 'Cancel' : '+ Add Agent' })] })] }), error && _jsxs("div", { className: "bridge-error", children: [error, " ", _jsx("button", { className: "bagents-dismiss", onClick: () => setError(null), children: "dismiss" })] }), showAdd && (_jsxs("div", { className: "bagents-add-form", children: [_jsx("input", { className: "bagents-input", placeholder: "slug (required)", value: addForm.slug, onChange: e => setAddForm(f => ({ ...f, slug: e.target.value })) }), _jsx("input", { className: "bagents-input", placeholder: "display name", value: addForm.display_name, onChange: e => setAddForm(f => ({ ...f, display_name: e.target.value })) }), _jsx("input", { className: "bagents-input bagents-emoji-input", placeholder: "emoji", value: addForm.emoji, onChange: e => setAddForm(f => ({ ...f, emoji: e.target.value })) }), _jsx("input", { className: "bagents-input", placeholder: "projects (comma-separated)", value: addForm.projects, onChange: e => setAddForm(f => ({ ...f, projects: e.target.value })) }), _jsx("input", { className: "bagents-input", placeholder: "description", value: addForm.description, onChange: e => setAddForm(f => ({ ...f, description: e.target.value })) }), _jsx("button", { className: "bagents-save-btn", onClick: addAgent, children: "Add" })] })), Object.entries(grouped).sort().map(([orch, orchAgents]) => {
                const isCollapsed = collapsed.has(orch);
                return (_jsxs("div", { className: `bagents-section ${isCollapsed ? 'bagents-collapsed' : ''}`, children: [_jsxs("h3", { className: "bagents-section-title", onClick: () => toggleSection(orch), children: [_jsx("span", { className: "bagents-section-icon", children: orchIcon(orch) }), orch, _jsx("span", { className: "bagents-section-count", children: orchAgents.length })] }), !isCollapsed && (_jsx("div", { className: "bagents-grid", children: orchAgents.map(a => (_jsx("div", { className: `bagents-card ${a.enabled ? 'bagents-card-enabled' : 'bagents-card-disabled'}`, children: editing === a.name ? (_jsxs("div", { className: "bagents-edit-form", children: [_jsxs("div", { className: "bagents-edit-name", children: [a.emoji, " ", a.display_name || a.name] }), _jsx("input", { className: "bagents-input", placeholder: "Description", value: editDesc, onChange: e => setEditDesc(e.target.value), onKeyDown: e => e.key === 'Enter' && saveEdit(a) }), _jsxs("div", { className: "bagents-edit-actions", children: [_jsx("button", { className: "bagents-save-btn", onClick: () => saveEdit(a), children: "Save" }), _jsx("button", { className: "bagents-cancel-btn", onClick: () => setEditing(null), children: "Cancel" })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bagents-card-header", children: [_jsxs("span", { className: "bagents-card-name", children: [a.emoji && _jsx("span", { className: "bagents-card-emoji", children: a.emoji }), a.display_name || a.name] }), _jsx("button", { className: `bagents-toggle-btn ${a.enabled ? 'bagents-toggle-on' : 'bagents-toggle-off'}`, onClick: () => toggleEnabled(a), title: a.enabled ? 'Click to disable' : 'Click to enable', children: a.enabled ? 'ON' : 'OFF' })] }), a.project && _jsx("div", { className: "bagents-card-project", children: a.project }), a.status && a.status !== 'idle' && (_jsxs("div", { className: "bagents-card-status", children: [_jsx("span", { className: "bagents-status-dot" }), a.status, a.status_task && _jsxs("span", { className: "bagents-status-task", children: [" \u2014 ", a.status_task] })] })), _jsxs("div", { className: "bagents-card-actions", children: [_jsx("button", { className: "bagents-edit-btn", onClick: () => { setEditing(a.name); setEditDesc(''); }, children: "Edit" }), _jsx("button", { className: "bagents-delete-btn", onClick: () => deleteAgent(a.name), children: "Delete" })] })] })) }, `${a.name}:${a.orchestrator}`))) }))] }, orch));
            }), agents.length === 0 && (_jsx("div", { className: "bagents-empty", children: _jsx("p", { children: "No agents registered. Click \"Add Agent\" to get started." }) }))] }));
}
//# sourceMappingURL=BridgeAgents.js.map