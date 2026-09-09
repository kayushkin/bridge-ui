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
            // `updated` counts files whose content hash changed. It used to count
            // every pre-existing row, so this line read "154 updated" after every
            // scan whether or not a single byte moved. Show `unchanged` alongside it
            // so the number has a denominator and a zero is legible as a no-op.
            let msg = `Scanned ${r.scanned} · ${r.added} new · ${r.updated} updated · ${r.unchanged} unchanged · ${r.missing} missing`;
            // `errors` names the files the scan could not account for. Until
            // agent-store started reporting them, a file that failed to hash or to
            // upsert was dropped from every counter above, so `Scanned 153` on a box
            // with 154 tracked files rendered as a complete run. When any are
            // present, `scanned` is an undercount and this line has to say so.
            //
            // Rendered only when the list is non-empty, and never as "0 failed": a
            // server too old to report the field would otherwise have this line
            // asserting a clean run on its behalf, which is the same lie in a new
            // place. The paths are listed because the question an agent runs a scan
            // to answer is whether one particular file landed, and a count cannot
            // answer it.
            if (Array.isArray(r.errors) && r.errors.length > 0) {
                const named = r.errors
                    .map((e) => `${e.path} (${e.stage}: ${e.error})`)
                    .join(' · ');
                msg += ` — ${r.errors.length} unaccounted for, so scanned is an undercount: ${named}`;
            }
            setScanMsg(msg);
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
    return (_jsxs("div", { className: "bfiles-container", children: [_jsxs("div", { className: "bfiles-header", children: [_jsxs("h2", { children: ["Agent files ", _jsx("span", { className: "bfiles-count", children: files.length })] }), _jsxs("div", { className: "bfiles-header-right", children: [_jsx("input", { type: "text", placeholder: "Search path / slug / scope / agent\u2026", value: query, onChange: e => setQuery(e.target.value), className: "bfiles-search" }), _jsx("button", { className: "bfiles-btn", onClick: fetchFiles, children: "Refresh" }), _jsx("button", { className: "bfiles-btn-primary", onClick: runScan, disabled: scanning, children: scanning ? 'Scanning…' : 'Scan disk' })] })] }), _jsx(PromptCollectionsPanel, { apiFetch: apiFetch, basePath: basePath }), _jsxs("div", { className: "bfiles-explainer", children: [_jsx("strong", { children: "How these files reach agents:" }), " the prompt collections above are the editable source. They compile into host-level and project-level ", _jsx("code", { children: "CLAUDE.md" }), " and ", _jsx("code", { children: "AGENTS.md" }), ", which stay versioned here as tracked files. Claude Code reads ", _jsx("code", { children: "CLAUDE.md" }), " directly from disk; non-Claude harnesses receive", _jsx("code", { children: " AGENTS.md" }), " through bridge injection. Remote runners pull the same compiled files through", _jsx("code", { children: " /seed/manifest" }), " and reconcile non-destructively."] }), _jsx(MachinesSeedPanel, { apiFetch: apiFetch, basePath: basePath }), _jsxs("div", { className: "bfiles-preview-section", children: [_jsxs("div", { className: "bfiles-preview-header", children: [_jsx("strong", { children: "Resolved injection preview" }), _jsx("span", { className: "bfiles-preview-hint", children: "What does each non-Claude harness receive?" })] }), _jsx("div", { className: "bfiles-preview-tabs", children: INJECTION_HARNESSES.map(h => (_jsx("button", { className: `bfiles-preview-tab ${previewHarness === h.slug ? 'bfiles-preview-tab-active' : ''}`, onClick: () => setPreviewHarness(previewHarness === h.slug ? null : h.slug), children: h.label }, h.slug))) }), previewHarness && (_jsxs("div", { className: "bfiles-preview-body", children: [previewLoading && _jsx("p", { children: "Resolving\u2026" }), previewError && _jsx("p", { className: "bridge-error", children: previewError }), preview && !previewLoading && (_jsxs(_Fragment, { children: [preview.skip_reason && (_jsxs("p", { className: "bfiles-preview-skip", children: ["Skipped: ", preview.skip_reason] })), !preview.skip_reason && preview.manifest.length === 0 && (_jsxs("p", { className: "bfiles-preview-skip", children: ["No AGENTS.md files matched. Add one in ", _jsx("code", { children: "$HOME/AGENTS.md" }), " for global scope, or in a project root."] })), preview.manifest.length > 0 && (_jsxs(_Fragment, { children: [_jsx("ul", { className: "bfiles-manifest-list", children: preview.manifest.map((m, i) => (_jsxs("li", { children: [_jsx("span", { className: "bfiles-manifest-scope", children: m.scope }), _jsx("code", { children: m.path }), _jsxs("span", { className: "bfiles-manifest-bytes", children: [m.bytes, " B"] })] }, i))) }), _jsx("pre", { className: "bfiles-preview-content", children: preview.content })] }))] }))] }))] }), scanMsg && _jsx("p", { className: "bfiles-scan-msg", children: scanMsg }), _jsx("div", { className: "bfiles-preview-section", children: _jsxs("div", { className: "bfiles-preview-header", children: [_jsx("strong", { children: "Materialized files" }), _jsx("span", { className: "bfiles-preview-hint", children: "Compiled prompt outputs, native tool files, seed state, and history." })] }) }), scopes.length === 0 && _jsx("p", { className: "bfiles-empty", children: "No files indexed. Click Scan disk." }), scopes.map(scope => {
                const meta = SCOPE_META[scope] || { label: scope, emoji: '\u{1F4C4}', description: '' };
                const items = byScope[scope];
                const isCollapsed = collapsed.has(scope);
                return (_jsxs("div", { className: `bfiles-section ${isCollapsed ? 'bfiles-section-collapsed' : ''}`, children: [_jsxs("h3", { className: `bfiles-section-title ${isCollapsed ? 'bfiles-collapsed' : ''}`, onClick: () => toggleSection(scope), children: [_jsx("span", { className: "bfiles-scope-emoji", children: meta.emoji }), meta.label, _jsx("span", { className: "bfiles-section-count", children: items.length }), meta.description && _jsx("span", { className: "bfiles-scope-description", children: meta.description })] }), !isCollapsed && (_jsx("ul", { className: "bfiles-file-list", children: items
                                .slice()
                                .sort((a, b) => a.path.localeCompare(b.path))
                                .map(f => (_jsx(FileRow, { file: f, apiFetch: apiFetch, basePath: basePath, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id), onToggleEnabled: () => toggleEnabled(f), onSaved: updated => setFiles(prev => prev.map(x => x.id === updated.id ? updated : x)) }, f.id))) }))] }, scope));
            })] }));
}
function PromptCollectionsPanel({ apiFetch, basePath }) {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [createPath, setCreatePath] = useState('');
    const [createTitle, setCreateTitle] = useState('');
    const load = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`${basePath}/prompt-collections`);
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            const data = await res.json();
            setCollections(Array.isArray(data) ? data : []);
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load prompt collections');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);
    const global = collections.filter(c => c.collection.scope === 'global');
    const projects = collections.filter(c => c.collection.scope === 'project');
    const createProject = async () => {
        setCreating(true);
        try {
            const res = await apiFetch(`${basePath}/prompt-collections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope: 'project',
                    root_path: createPath.trim(),
                    title: createTitle.trim(),
                    description: 'Shared prompt source for this project.',
                }),
            });
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            setCreatePath('');
            setCreateTitle('');
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Create failed');
        }
        finally {
            setCreating(false);
        }
    };
    return (_jsxs("div", { className: "bfiles-preview-section", children: [_jsxs("div", { className: "bfiles-preview-header", children: [_jsx("strong", { children: "Main prompt" }), _jsx("span", { className: "bfiles-preview-hint", children: "Structured source for the compiled prompt files." })] }), loading && _jsx("p", { children: "Loading prompt collections\u2026" }), error && _jsx("p", { className: "bridge-error", children: error }), !loading && global.map(view => (_jsx(PromptCollectionCard, { view: view, apiFetch: apiFetch, basePath: basePath, open: openId === view.collection.id, onToggle: () => setOpenId(openId === view.collection.id ? null : view.collection.id), onChanged: load }, view.collection.id))), _jsxs("div", { className: "bfiles-preview-header", style: { marginTop: 18 }, children: [_jsx("strong", { children: "Project prompts" }), _jsx("span", { className: "bfiles-preview-hint", children: "One collection per repo root. Create one even if the repo has no prompt files yet." })] }), _jsxs("div", { className: "bfiles-actions", style: { marginBottom: 12 }, children: [_jsx("input", { className: "bfiles-search", placeholder: "/home/kayushkincom/repos/my-repo", value: createPath, onChange: e => setCreatePath(e.target.value) }), _jsx("input", { className: "bfiles-search", placeholder: "Optional title", value: createTitle, onChange: e => setCreateTitle(e.target.value) }), _jsx("button", { className: "bfiles-btn-primary", onClick: createProject, disabled: creating || !createPath.trim(), children: creating ? 'Creating…' : 'Add project prompt' })] }), !loading && projects.length === 0 && (_jsx("p", { className: "bfiles-empty", children: "No project prompt collections yet." })), !loading && projects.map(view => (_jsx(PromptCollectionCard, { view: view, apiFetch: apiFetch, basePath: basePath, open: openId === view.collection.id, onToggle: () => setOpenId(openId === view.collection.id ? null : view.collection.id), onChanged: load }, view.collection.id)))] }));
}
function PromptCollectionCard({ view, apiFetch, basePath, open, onToggle, onChanged, }) {
    const [busy, setBusy] = useState(false);
    const compile = async () => {
        setBusy(true);
        try {
            const res = await apiFetch(`${basePath}/prompt-collections/${view.collection.id}/compile`, { method: 'POST' });
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            await onChanged();
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "bfiles-machine-card", style: { marginBottom: 12 }, children: [_jsxs("div", { className: "bfiles-file-header", children: [_jsx("button", { className: "bfiles-caret", onClick: onToggle, children: open ? '▾' : '▸' }), _jsxs("button", { className: "bfiles-file-title", onClick: onToggle, children: [_jsx("span", { className: "bfiles-file-basename", children: view.collection.title }), _jsx("span", { className: "bfiles-file-parent", children: view.collection.root_path })] }), _jsx("span", { className: "bfiles-usedby-tag bfiles-mode-injected", children: view.collection.scope }), _jsx("button", { className: "bfiles-btn", onClick: compile, disabled: busy, children: busy ? 'Compiling…' : 'Compile now' })] }), open && (_jsxs("div", { className: "bfiles-file-body", children: [_jsx("p", { className: "bfiles-machines-hint", children: "Edit sections here. Saving a section recompiles the target files and nudges connected runners to reconcile." }), view.outputs.map(output => (_jsxs("div", { className: "bfiles-version-preview", style: { marginBottom: 12 }, children: [_jsxs("div", { className: "bfiles-version-preview-header", children: [_jsx("strong", { children: output.target === 'claude' ? 'CLAUDE.md' : 'AGENTS.md' }), _jsx("span", { className: "bfiles-meta", children: output.path })] }), _jsx("pre", { className: "bfiles-version-content", children: output.content || '(no sections for this target yet)' })] }, output.target))), _jsx("div", { className: "bfiles-history-body", children: view.sections.map(section => (_jsx(PromptSectionEditor, { section: section, apiFetch: apiFetch, basePath: basePath, onChanged: onChanged }, section.id))) }), _jsx(AddPromptSectionForm, { collectionID: view.collection.id, apiFetch: apiFetch, basePath: basePath, onChanged: onChanged })] }))] }));
}
function PromptSectionEditor({ section, apiFetch, basePath, onChanged, }) {
    const [draft, setDraft] = useState(section);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const dirty = JSON.stringify(draft) !== JSON.stringify(section);
    useEffect(() => { setDraft(section); }, [section]);
    const save = async () => {
        setSaving(true);
        setErr(null);
        try {
            const res = await apiFetch(`${basePath}/prompt-sections/${section.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            await onChanged();
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'Save failed');
        }
        finally {
            setSaving(false);
        }
    };
    const remove = async () => {
        setSaving(true);
        setErr(null);
        try {
            const res = await apiFetch(`${basePath}/prompt-sections/${section.id}`, { method: 'DELETE' });
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            await onChanged();
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'Delete failed');
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { className: "bfiles-version-preview", style: { marginBottom: 12 }, children: [_jsxs("div", { className: "bfiles-actions", style: { marginBottom: 8 }, children: [_jsx("input", { className: "bfiles-search", value: draft.title, onChange: e => setDraft({ ...draft, title: e.target.value }), placeholder: "Section title" }), _jsxs("select", { className: "bfiles-search", value: draft.applies_to, onChange: e => setDraft({ ...draft, applies_to: e.target.value }), children: [_jsx("option", { value: "all", children: "All harnesses" }), _jsx("option", { value: "claude", children: "Claude only" }), _jsx("option", { value: "agents", children: "Non-Claude only" })] }), _jsx("input", { className: "bfiles-search", type: "number", value: draft.priority, onChange: e => setDraft({ ...draft, priority: Number(e.target.value) }), placeholder: "Priority" }), _jsxs("label", { className: "bfiles-meta", children: [_jsx("input", { type: "checkbox", checked: draft.enabled, onChange: e => setDraft({ ...draft, enabled: e.target.checked }) }), " enabled"] })] }), _jsx("input", { className: "bfiles-search", style: { width: '100%', marginBottom: 8 }, value: draft.heading || '', onChange: e => setDraft({ ...draft, heading: e.target.value }), placeholder: "Heading line, e.g. # Directives" }), _jsx("textarea", { className: "bfiles-editor", value: draft.body, onChange: e => setDraft({ ...draft, body: e.target.value }), spellCheck: false }), _jsxs("div", { className: "bfiles-actions", children: [_jsx("button", { className: "bfiles-btn-primary", onClick: save, disabled: !dirty || saving, children: saving ? 'Saving…' : dirty ? 'Save section' : 'Saved' }), _jsx("button", { className: "bfiles-btn", onClick: () => setDraft(section), disabled: !dirty || saving, children: "Revert" }), _jsx("button", { className: "bfiles-btn", onClick: remove, disabled: saving, children: "Delete" })] }), err && _jsx("p", { className: "bridge-error", children: err })] }));
}
function AddPromptSectionForm({ collectionID, apiFetch, basePath, onChanged, }) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [heading, setHeading] = useState('');
    const [body, setBody] = useState('');
    const [appliesTo, setAppliesTo] = useState('all');
    const [priority, setPriority] = useState(1000);
    const [err, setErr] = useState(null);
    const submit = async () => {
        setSaving(true);
        setErr(null);
        try {
            const res = await apiFetch(`${basePath}/prompt-collections/${collectionID}/sections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title, heading, body, applies_to: appliesTo, priority, enabled: true,
                }),
            });
            if (!res.ok)
                throw new Error(await res.text() || `HTTP ${res.status}`);
            setTitle('');
            setHeading('');
            setBody('');
            setAppliesTo('all');
            setPriority(1000);
            setOpen(false);
            await onChanged();
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'Create failed');
        }
        finally {
            setSaving(false);
        }
    };
    if (!open) {
        return _jsx("button", { className: "bfiles-btn-primary", onClick: () => setOpen(true), children: "Add section" });
    }
    return (_jsxs("div", { className: "bfiles-version-preview", children: [_jsxs("div", { className: "bfiles-actions", style: { marginBottom: 8 }, children: [_jsx("input", { className: "bfiles-search", value: title, onChange: e => setTitle(e.target.value), placeholder: "Section title" }), _jsxs("select", { className: "bfiles-search", value: appliesTo, onChange: e => setAppliesTo(e.target.value), children: [_jsx("option", { value: "all", children: "All harnesses" }), _jsx("option", { value: "claude", children: "Claude only" }), _jsx("option", { value: "agents", children: "Non-Claude only" })] }), _jsx("input", { className: "bfiles-search", type: "number", value: priority, onChange: e => setPriority(Number(e.target.value)) })] }), _jsx("input", { className: "bfiles-search", style: { width: '100%', marginBottom: 8 }, value: heading, onChange: e => setHeading(e.target.value), placeholder: "Heading line" }), _jsx("textarea", { className: "bfiles-editor", value: body, onChange: e => setBody(e.target.value), spellCheck: false }), _jsxs("div", { className: "bfiles-actions", children: [_jsx("button", { className: "bfiles-btn-primary", onClick: submit, disabled: saving || !title.trim(), children: saving ? 'Creating…' : 'Create section' }), _jsx("button", { className: "bfiles-btn", onClick: () => setOpen(false), disabled: saving, children: "Cancel" })] }), err && _jsx("p", { className: "bridge-error", children: err })] }));
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