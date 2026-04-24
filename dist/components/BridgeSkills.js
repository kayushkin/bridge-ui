import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
const TIERS = {
    official: 'bsk-tier-official',
    community: 'bsk-tier-community',
    personal: 'bsk-tier-personal',
};
export function BridgeSkills() {
    const { fetch: apiFetch, skillStoreBasePath } = useBridgeConfig();
    const [sources, setSources] = useState([]);
    const [skills, setSkills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [installedOnly, setInstalledOnly] = useState(false);
    const [busy, setBusy] = useState({});
    const [syncing, setSyncing] = useState(null);
    const [syncResult, setSyncResult] = useState({});
    const refetch = useCallback(async () => {
        if (!skillStoreBasePath)
            return;
        setLoading(true);
        setError(null);
        try {
            const [srcRes, skillRes] = await Promise.all([
                apiFetch(`${skillStoreBasePath}/sources`),
                apiFetch(`${skillStoreBasePath}/skills?limit=5000`),
            ]);
            if (!srcRes.ok || !skillRes.ok)
                throw new Error('skill-store unreachable');
            setSources(await srcRes.json());
            setSkills(await skillRes.json());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    }, [apiFetch, skillStoreBasePath]);
    useEffect(() => { refetch(); }, [refetch]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return skills.filter(s => {
            if (sourceFilter && s.source_name !== sourceFilter)
                return false;
            if (installedOnly && !s.installed)
                return false;
            if (!q)
                return true;
            return s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
        });
    }, [skills, query, sourceFilter, installedOnly]);
    const installedCount = useMemo(() => skills.filter(s => s.installed).length, [skills]);
    const toggle = useCallback(async (skill, force = false) => {
        if (!skillStoreBasePath)
            return;
        setBusy(prev => ({ ...prev, [skill.id]: true }));
        try {
            const action = skill.installed ? 'uninstall' : 'install';
            const qs = action === 'install' && force ? '?force=true' : '';
            const res = await apiFetch(`${skillStoreBasePath}/skills/${skill.id}/${action}${qs}`, { method: 'POST' });
            if (res.status === 409) {
                const body = await res.json().catch(() => ({}));
                const ok = window.confirm(`${body.error || 'Conflict'}\n\nReplace the existing install?`);
                if (ok) {
                    await toggle(skill, true);
                    return;
                }
            }
            else if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            await refetch();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(prev => ({ ...prev, [skill.id]: false }));
        }
    }, [apiFetch, skillStoreBasePath, refetch]);
    const syncSource = useCallback(async (source) => {
        if (!skillStoreBasePath)
            return;
        setSyncing(source.id);
        setError(null);
        try {
            const res = await apiFetch(`${skillStoreBasePath}/sources/${source.id}/sync`, { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setSyncResult(prev => ({ ...prev, [source.id]: data }));
            await refetch();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSyncing(null);
        }
    }, [apiFetch, skillStoreBasePath, refetch]);
    if (!skillStoreBasePath) {
        return (_jsx("div", { className: "bsk-container", children: _jsxs("div", { className: "bridge-error", children: ["Skill-store is not configured. Pass ", _jsx("code", { children: "skillStoreBasePath" }), " to ", _jsx("code", { children: "<BridgeProvider>" }), "."] }) }));
    }
    return (_jsxs("div", { className: "bsk-container", children: [_jsxs("div", { className: "bsk-header", children: [_jsx("h2", { className: "bsk-title", children: "Skills" }), _jsxs("p", { className: "bsk-subtitle", children: ["Install skills into ", _jsx("code", { children: "~/.claude/skills" }), " so Claude Code picks them up."] })] }), error && _jsx("div", { className: "bridge-error", children: error }), _jsxs("section", { className: "bsk-sources", children: [_jsx("h3", { className: "bsk-section-title", children: "Sources" }), _jsx("div", { className: "bsk-source-grid", children: sources.map(src => {
                            const result = syncResult[src.id];
                            return (_jsxs("div", { className: "bsk-source-card", children: [_jsxs("div", { className: "bsk-source-head", children: [_jsx("span", { className: "bsk-source-name", children: src.name }), _jsx("span", { className: `bsk-tier ${TIERS[src.trust_tier] || ''}`, children: src.trust_tier }), src.license && _jsx("span", { className: "bsk-license", children: src.license })] }), _jsx("div", { className: "bsk-source-meta", children: _jsx("a", { href: src.repo_url.replace(/\.git$/, ''), target: "_blank", rel: "noreferrer", className: "bsk-source-url", children: src.repo_url }) }), _jsxs("div", { className: "bsk-source-footer", children: [_jsxs("span", { className: "bsk-source-count", children: [src.last_skill_count, " skills"] }), _jsx("button", { className: "bsk-sync-btn", onClick: () => syncSource(src), disabled: syncing === src.id, children: syncing === src.id ? 'Syncing…' : 'Sync' })] }), result && (_jsxs("div", { className: "bsk-source-result", children: ["+", result.inserted, " / ~", result.updated, " / -", result.pruned, result.errors && result.errors.length > 0 && _jsxs("span", { className: "bsk-source-warn", children: [" \u00B7 ", result.errors.length, " warnings"] })] }))] }, src.id));
                        }) })] }), _jsxs("section", { className: "bsk-skills", children: [_jsxs("div", { className: "bsk-toolbar", children: [_jsx("input", { className: "bsk-search", type: "text", placeholder: `Search ${skills.length} skills…`, value: query, onChange: e => setQuery(e.target.value) }), _jsxs("select", { className: "bsk-filter", value: sourceFilter, onChange: e => setSourceFilter(e.target.value), children: [_jsx("option", { value: "", children: "All sources" }), sources.map(s => _jsx("option", { value: s.name, children: s.name }, s.id))] }), _jsxs("label", { className: "bsk-check", children: [_jsx("input", { type: "checkbox", checked: installedOnly, onChange: e => setInstalledOnly(e.target.checked) }), _jsxs("span", { children: ["Installed only (", installedCount, ")"] })] }), _jsxs("span", { className: "bsk-count", children: [filtered.length, " / ", skills.length] })] }), loading ? (_jsx("div", { className: "bsk-empty", children: "Loading\u2026" })) : filtered.length === 0 ? (_jsx("div", { className: "bsk-empty", children: "No skills match." })) : (_jsx("ul", { className: "bsk-list", children: filtered.map(skill => (_jsxs("li", { className: `bsk-row ${skill.installed ? 'bsk-installed' : ''}`, children: [_jsxs("div", { className: "bsk-row-main", children: [_jsxs("div", { className: "bsk-row-head", children: [_jsx("span", { className: "bsk-skill-name", children: skill.name }), _jsx("span", { className: "bsk-source-chip", children: skill.source_name }), skill.file_count > 0 && _jsxs("span", { className: "bsk-file-count", children: [skill.file_count, " files"] })] }), skill.description && _jsx("div", { className: "bsk-row-desc", children: skill.description }), skill.tags && skill.tags.length > 0 && (_jsx("div", { className: "bsk-tags", children: skill.tags.slice(0, 6).map(t => _jsx("span", { className: "bsk-tag", children: t }, t)) }))] }), _jsx("div", { className: "bsk-row-actions", children: _jsx("button", { className: `bsk-toggle ${skill.installed ? 'bsk-toggle-on' : 'bsk-toggle-off'}`, onClick: () => toggle(skill), disabled: busy[skill.id], title: skill.installed ? skill.install_path : 'Install to ~/.claude/skills', children: busy[skill.id] ? '…' : skill.installed ? 'Installed' : 'Install' }) })] }, skill.id))) }))] })] }));
}
//# sourceMappingURL=BridgeSkills.js.map