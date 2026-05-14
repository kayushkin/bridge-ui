import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
const SCOPE_META = {
    global: { label: 'Global', emoji: '\u{1F310}', description: '~/.claude and $HOME — applies to every session' },
    project: { label: 'Project', emoji: '\u{1F4C1}', description: 'Project-root files — applies when the session runs in that project' },
    subagent: { label: 'Subagents', emoji: '\u{1F916}', description: '~/.claude/agents — Claude Code subagent definitions' },
    memory: { label: 'Memory', emoji: '\u{1F9E0}', description: '~/.claude/projects/*/memory — auto-loaded by Claude Code per project' },
    command: { label: 'Commands', emoji: '⚡', description: '~/.claude/commands — slash-command definitions' },
};
const SCOPE_ORDER = ['global', 'project', 'subagent', 'memory', 'command'];
const INJECTION_HARNESSES = [
    { slug: 'codex', label: 'Codex' },
    { slug: 'hermes', label: 'Hermes' },
    { slug: 'gemini', label: 'Gemini' },
    { slug: 'aider', label: 'Aider' },
    { slug: 'goose', label: 'Goose' },
];
function usedBy(f) {
    const base = f.path.split('/').pop() || '';
    if (base === 'CLAUDE.md')
        return { label: 'Claude Code (native)', mode: 'native' };
    if (base === 'AGENTS.md')
        return { label: 'All non-Claude harnesses (injected)', mode: 'injected' };
    if (base === 'GEMINI.md')
        return { label: 'Gemini (native)', mode: 'native' };
    if (base === 'copilot-instructions.md')
        return { label: 'GitHub Copilot (native)', mode: 'native' };
    if (base === '.cursorrules')
        return { label: 'Cursor (native)', mode: 'native' };
    if (base === '.clinerules')
        return { label: 'Cline (native)', mode: 'native' };
    if (base === '.windsurfrules')
        return { label: 'Windsurf (native)', mode: 'native' };
    if (base === '.continuerules')
        return { label: 'Continue (native)', mode: 'native' };
    if (base === '.aider.conf.yml')
        return { label: 'Aider (native config)', mode: 'native' };
    if (f.scope === 'subagent')
        return { label: 'Claude Code subagent', mode: 'subagent' };
    if (f.scope === 'memory')
        return { label: 'Claude Code memory', mode: 'memory' };
    if (f.scope === 'command')
        return { label: 'Claude Code commands', mode: 'native' };
    return { label: f.scope, mode: 'unknown' };
}
export function BridgeFiles() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanMsg, setScanMsg] = useState(null);
    const [collapsed, setCollapsed] = useState(new Set());
    const [openId, setOpenId] = useState(null);
    const [previewHarness, setPreviewHarness] = useState(null);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const fetchFiles = async () => {
        try {
            const res = await apiFetch(`${basePath}/files`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setFiles(Array.isArray(data) ? data : []);
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchFiles(); }, []);
    useEffect(() => {
        if (!previewHarness) {
            setPreview(null);
            return;
        }
        setPreviewLoading(true);
        setPreviewError(null);
        apiFetch(`${basePath}/context/resolve?harness=${encodeURIComponent(previewHarness)}`)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(await r.text() || `HTTP ${r.status}`);
            return r.json();
        })
            .then(setPreview)
            .catch(e => setPreviewError(e instanceof Error ? e.message : 'Resolve failed'))
            .finally(() => setPreviewLoading(false));
    }, [previewHarness, apiFetch, basePath]);
    const runScan = async () => {
        setScanning(true);
        setScanMsg(null);
        try {
            const res = await apiFetch(`${basePath}/files/scan`, { method: 'POST' });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const r = await res.json();
            setScanMsg(`Scanned ${r.scanned} · ${r.added} new · ${r.updated} updated · ${r.missing} missing`);
            await fetchFiles();
        }
        catch (e) {
            setScanMsg(e instanceof Error ? e.message : 'Scan failed');
        }
        finally {
            setScanning(false);
        }
    };
    const toggleEnabled = async (f) => {
        const action = f.enabled ? 'disable' : 'enable';
        const res = await apiFetch(`${basePath}/files/${f.id}/${action}`, { method: 'POST' });
        if (res.ok) {
            const updated = await res.json();
            setFiles(prev => prev.map(x => x.id === f.id ? updated : x));
        }
        else {
            alert(await res.text());
        }
    };
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return files;
        return files.filter(f => f.path.toLowerCase().includes(q) ||
            (f.agent_slug || '').toLowerCase().includes(q) ||
            f.scope.toLowerCase().includes(q) ||
            usedBy(f).label.toLowerCase().includes(q));
    }, [files, query]);
    const byScope = useMemo(() => {
        const m = {};
        for (const f of filtered) {
            (m[f.scope] ||= []).push(f);
        }
        return m;
    }, [filtered]);
    const toggleSection = (scope) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(scope))
                next.delete(scope);
            else
                next.add(scope);
            return next;
        });
    };
    if (loading)
        return _jsx("div", { className: "bfiles-container", children: _jsx("p", { children: "Loading\u2026" }) });
    if (error)
        return (_jsxs("div", { className: "bfiles-container", children: [_jsxs("p", { className: "bridge-error", children: ["Error: ", error] }), _jsx("button", { onClick: () => { setLoading(true); fetchFiles(); }, className: "bfiles-btn", children: "Retry" })] }));
    const scopes = SCOPE_ORDER.filter(s => byScope[s]?.length);
    return (_jsxs("div", { className: "bfiles-container", children: [_jsxs("div", { className: "bfiles-header", children: [_jsxs("h2", { children: ["Agent files ", _jsx("span", { className: "bfiles-count", children: files.length })] }), _jsxs("div", { className: "bfiles-header-right", children: [_jsx("input", { type: "text", placeholder: "Search path / slug / scope / agent\u2026", value: query, onChange: e => setQuery(e.target.value), className: "bfiles-search" }), _jsx("button", { className: "bfiles-btn", onClick: fetchFiles, children: "Refresh" }), _jsx("button", { className: "bfiles-btn-primary", onClick: runScan, disabled: scanning, children: scanning ? 'Scanning…' : 'Scan disk' })] })] }), _jsxs("div", { className: "bfiles-explainer", children: [_jsx("strong", { children: "How these files reach agents:" }), " Claude Code reads ", _jsx("code", { children: "CLAUDE.md" }), " directly from disk on every session \u2014 the bridge does not inject it. ", _jsx("code", { children: "AGENTS.md" }), " is injected as ", _jsx("code", { children: "system_prompt" }), " by llm-bridge-server for every other harness (codex, gemini, hermes, \u2026) so the same context applies universally. Per-tool files (", _jsx("code", { children: ".cursorrules" }), ", ", _jsx("code", { children: "GEMINI.md" }), ", etc.) are read natively by their respective tools. Remote runners pull the same files via ", _jsx("code", { children: "/seed/manifest" }), " and reconcile non-destructively (drift is captured as a runner-drift version before any overwrite)."] }), _jsx(MachinesSeedPanel, { apiFetch: apiFetch, basePath: basePath }), _jsxs("div", { className: "bfiles-preview-section", children: [_jsxs("div", { className: "bfiles-preview-header", children: [_jsx("strong", { children: "Resolved injection preview" }), _jsx("span", { className: "bfiles-preview-hint", children: "What does each non-Claude harness receive?" })] }), _jsx("div", { className: "bfiles-preview-tabs", children: INJECTION_HARNESSES.map(h => (_jsx("button", { className: `bfiles-preview-tab ${previewHarness === h.slug ? 'bfiles-preview-tab-active' : ''}`, onClick: () => setPreviewHarness(previewHarness === h.slug ? null : h.slug), children: h.label }, h.slug))) }), previewHarness && (_jsxs("div", { className: "bfiles-preview-body", children: [previewLoading && _jsx("p", { children: "Resolving\u2026" }), previewError && _jsx("p", { className: "bridge-error", children: previewError }), preview && !previewLoading && (_jsxs(_Fragment, { children: [preview.skip_reason && (_jsxs("p", { className: "bfiles-preview-skip", children: ["Skipped: ", preview.skip_reason] })), !preview.skip_reason && preview.manifest.length === 0 && (_jsxs("p", { className: "bfiles-preview-skip", children: ["No AGENTS.md files matched. Add one in ", _jsx("code", { children: "$HOME/AGENTS.md" }), " for global scope, or in a project root."] })), preview.manifest.length > 0 && (_jsxs(_Fragment, { children: [_jsx("ul", { className: "bfiles-manifest-list", children: preview.manifest.map((m, i) => (_jsxs("li", { children: [_jsx("span", { className: "bfiles-manifest-scope", children: m.scope }), _jsx("code", { children: m.path }), _jsxs("span", { className: "bfiles-manifest-bytes", children: [m.bytes, " B"] })] }, i))) }), _jsx("pre", { className: "bfiles-preview-content", children: preview.content })] }))] }))] }))] }), scanMsg && _jsx("p", { className: "bfiles-scan-msg", children: scanMsg }), scopes.length === 0 && _jsx("p", { className: "bfiles-empty", children: "No files indexed. Click Scan disk." }), scopes.map(scope => {
                const meta = SCOPE_META[scope] || { label: scope, emoji: '\u{1F4C4}', description: '' };
                const items = byScope[scope];
                const isCollapsed = collapsed.has(scope);
                return (_jsxs("div", { className: `bfiles-section ${isCollapsed ? 'bfiles-section-collapsed' : ''}`, children: [_jsxs("h3", { className: `bfiles-section-title ${isCollapsed ? 'bfiles-collapsed' : ''}`, onClick: () => toggleSection(scope), children: [_jsx("span", { className: "bfiles-scope-emoji", children: meta.emoji }), meta.label, _jsx("span", { className: "bfiles-section-count", children: items.length }), meta.description && _jsx("span", { className: "bfiles-scope-description", children: meta.description })] }), !isCollapsed && (_jsx("ul", { className: "bfiles-file-list", children: items
                                .slice()
                                .sort((a, b) => a.path.localeCompare(b.path))
                                .map(f => (_jsx(FileRow, { file: f, apiFetch: apiFetch, basePath: basePath, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id), onToggleEnabled: () => toggleEnabled(f), onSaved: updated => setFiles(prev => prev.map(x => x.id === updated.id ? updated : x)) }, f.id))) }))] }, scope));
            })] }));
}
function FileRow({ file, apiFetch, basePath, expanded, onToggle, onToggleEnabled, onSaved }) {
    const [content, setContent] = useState(null);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const dirty = content !== null && draft !== content;
    useEffect(() => {
        if (!expanded || content !== null)
            return;
        setLoading(true);
        apiFetch(`${basePath}/files/${file.id}/content`)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(await r.text() || `HTTP ${r.status}`);
            return r.json();
        })
            .then(j => {
            setContent(j.content || '');
            setDraft(j.content || '');
            setErr(null);
        })
            .catch(e => setErr(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false));
    }, [expanded, content, file.id, apiFetch, basePath]);
    const save = async () => {
        setSaving(true);
        setErr(null);
        try {
            const res = await apiFetch(`${basePath}/files/${file.id}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: draft }),
            });
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            const updated = await res.json();
            setContent(draft);
            onSaved(updated);
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'Save failed');
        }
        finally {
            setSaving(false);
        }
    };
    const basename = file.path.split('/').pop() || file.path;
    const parent = file.path.substring(0, file.path.length - basename.length - 1);
    const consumer = usedBy(file);
    return (_jsxs("li", { className: `bfiles-file ${file.enabled ? '' : 'bfiles-file-disabled'}`, children: [_jsxs("div", { className: "bfiles-file-header", children: [_jsx("button", { className: "bfiles-caret", onClick: onToggle, children: expanded ? '▾' : '▸' }), _jsxs("button", { className: "bfiles-file-title", onClick: onToggle, children: [_jsx("span", { className: "bfiles-file-basename", children: basename }), _jsx("span", { className: "bfiles-file-parent", children: parent })] }), _jsx("span", { className: `bfiles-usedby-tag bfiles-mode-${consumer.mode}`, title: `Consumed by: ${consumer.label}`, children: consumer.label }), file.agent_slug && _jsx("span", { className: "bfiles-slug-tag", children: file.agent_slug }), file.status === 'missing' && _jsx("span", { className: "bfiles-missing-tag", children: "missing" }), _jsx("button", { className: `bfiles-toggle-btn ${file.enabled ? 'bfiles-toggle-on' : 'bfiles-toggle-off'}`, onClick: onToggleEnabled, title: file.enabled ? 'Disable (rename to .disabled)' : 'Enable', children: file.enabled ? 'ON' : 'OFF' })] }), expanded && (_jsxs("div", { className: "bfiles-file-body", children: [loading && _jsx("p", { children: "Loading\u2026" }), err && _jsx("p", { className: "bridge-error", children: err }), content !== null && (_jsxs(_Fragment, { children: [_jsx("textarea", { className: "bfiles-editor", value: draft, onChange: e => setDraft(e.target.value), spellCheck: false }), _jsxs("div", { className: "bfiles-actions", children: [_jsx("button", { className: "bfiles-btn-primary", onClick: save, disabled: !dirty || saving, children: saving ? 'Saving…' : dirty ? 'Save' : 'Saved' }), dirty && (_jsx("button", { className: "bfiles-btn", onClick: () => setDraft(content), children: "Revert" })), _jsxs("span", { className: "bfiles-meta", children: [(file.size / 1024).toFixed(1), " KB \u00B7 mtime ", new Date(file.mtime * 1000).toLocaleString()] })] }), _jsx(FileHistory, { fileID: file.id, apiFetch: apiFetch, basePath: basePath, onRestore: async (versionContent) => { setDraft(versionContent); } })] }))] }))] }));
}
function FileHistory({ fileID, apiFetch, basePath, onRestore }) {
    const [versions, setVersions] = useState(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [previewID, setPreviewID] = useState(null);
    const [previewBody, setPreviewBody] = useState(null);
    const load = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await apiFetch(`${basePath}/files/${fileID}/versions`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            setVersions(await res.json());
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'load failed');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { if (open && versions === null)
        load(); }, [open]);
    const loadPreview = async (vid) => {
        setPreviewID(vid);
        setPreviewBody(null);
        try {
            const res = await apiFetch(`${basePath}/versions/${vid}/content`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const j = await res.json();
            setPreviewBody(j.content || '');
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'preview failed');
        }
    };
    return (_jsxs("div", { className: "bfiles-history", children: [_jsxs("button", { className: "bfiles-btn", onClick: () => setOpen(!open), children: [open ? '▾' : '▸', " History ", versions ? `(${versions.length})` : ''] }), open && (_jsxs("div", { className: "bfiles-history-body", children: [loading && _jsx("p", { children: "Loading\u2026" }), err && _jsx("p", { className: "bridge-error", children: err }), versions && versions.length === 0 && (_jsx("p", { className: "bfiles-empty", children: "No history yet \u2014 first save will create a version." })), versions && versions.length > 0 && (_jsx("ul", { className: "bfiles-version-list", children: versions.map(v => (_jsxs("li", { className: "bfiles-version-row", children: [_jsx("span", { className: "bfiles-version-time", children: new Date(v.created_at * 1000).toLocaleString() }), _jsx("span", { className: "bfiles-version-source", children: v.source }), v.machine_id && _jsxs("span", { className: "bfiles-version-machine", children: ["from ", v.machine_id] }), _jsx("code", { className: "bfiles-version-sha", children: v.sha256.slice(0, 12) }), _jsxs("span", { className: "bfiles-version-size", children: [v.size, " B"] }), v.note && _jsx("span", { className: "bfiles-version-note", children: v.note }), _jsx("button", { className: "bfiles-btn", onClick: () => loadPreview(v.id), children: "View" })] }, v.id))) })), previewID && previewBody !== null && (_jsxs("div", { className: "bfiles-version-preview", children: [_jsxs("div", { className: "bfiles-version-preview-header", children: [_jsxs("strong", { children: ["Version #", previewID] }), _jsx("button", { className: "bfiles-btn", onClick: () => onRestore(previewBody), children: "Load into editor" }), _jsx("button", { className: "bfiles-btn", onClick: () => { setPreviewID(null); setPreviewBody(null); }, children: "Close" })] }), _jsx("pre", { className: "bfiles-version-content", children: previewBody })] }))] }))] }));
}
function MachinesSeedPanel({ apiFetch, basePath }) {
    const [profiles, setProfiles] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [statesByMachine, setStatesByMachine] = useState({});
    const load = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await apiFetch(`${basePath}/seed/profiles`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const list = await res.json();
            setProfiles(list);
            const states = {};
            await Promise.all(list.map(async (p) => {
                const r = await apiFetch(`${basePath}/seed/state?machine_id=${encodeURIComponent(p.machine_id)}`);
                if (r.ok)
                    states[p.machine_id] = await r.json();
            }));
            setStatesByMachine(states);
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'load failed');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { if (open && profiles.length === 0 && !loading)
        load(); }, [open]);
    return (_jsxs("div", { className: "bfiles-machines-panel", children: [_jsxs("div", { className: "bfiles-machines-header", children: [_jsxs("button", { className: "bfiles-btn", onClick: () => setOpen(!open), children: [open ? '▾' : '▸', " Runners & seed state"] }), _jsx("button", { className: "bfiles-btn", onClick: load, disabled: loading, children: loading ? 'Loading…' : 'Refresh' }), _jsx("span", { className: "bfiles-machines-hint", children: "Per-machine view of which files each runner has on disk." })] }), open && (_jsxs("div", { className: "bfiles-machines-body", children: [err && _jsx("p", { className: "bridge-error", children: err }), !loading && profiles.length === 0 && (_jsx("p", { className: "bfiles-empty", children: "No runners enrolled yet." })), profiles.map(p => {
                        const rows = statesByMachine[p.machine_id] || [];
                        const observed = rows.filter(r => r.observed_sha).length;
                        return (_jsxs("div", { className: "bfiles-machine-card", children: [_jsx("strong", { children: p.machine_id }), _jsxs("span", { className: "bfiles-machine-scopes", children: ["scopes: ", p.scopes.join(', ')] }), _jsxs("span", { className: "bfiles-machine-stats", children: [observed, " files observed / ", rows.length, " state rows"] })] }, p.machine_id));
                    })] }))] }));
}
//# sourceMappingURL=BridgeFiles.js.map