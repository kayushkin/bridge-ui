import { useEffect, useMemo, useState } from 'react'
import { useBridgeConfig } from '../context'
import type { FetchFn } from '../types'

interface TrackedFile {
  id: number
  path: string
  scope: string
  agent_slug?: string
  enabled: boolean
  fs_hash?: string
  size: number
  mtime: number
  last_scanned_at: number
  status: string
}

interface ResolvedContextEntry {
  path: string
  scope: string
  bytes: number
}

interface ResolvedContext {
  harness: string
  work_dir?: string
  skip_reason?: string
  content: string
  manifest: ResolvedContextEntry[]
}

interface FileVersion {
  id: number
  tracked_file_id: number
  sha256: string
  size: number
  source: string
  machine_id?: string
  note?: string
  created_at: number
}

interface MachineSeedProfile {
  machine_id: string
  scopes: string[]
  created_at: number
  updated_at: number
}

interface MachineSeedStateRow {
  machine_id: string
  tracked_file_id: number
  observed_sha?: string
  observed_at?: number
  last_pushed_version_id?: number
  last_pushed_at?: number
}

interface PromptSection {
  id: number
  collection_id: number
  title: string
  heading?: string
  body: string
  applies_to: string
  priority: number
  enabled: boolean
  source_path?: string
  created_at: number
  updated_at: number
}

interface PromptCollection {
  id: number
  slug: string
  title: string
  scope: string
  root_path: string
  description?: string
  created_at: number
  updated_at: number
}

interface PromptOutput {
  target: string
  path: string
  tracked_file_id?: number
  exists: boolean
  content: string
  current_sha256?: string
}

interface PromptCollectionView {
  collection: PromptCollection
  sections: PromptSection[]
  outputs: PromptOutput[]
}

const SCOPE_META: Record<string, { label: string; emoji: string; description: string }> = {
  global:   { label: 'Global',    emoji: '\u{1F310}', description: '~/.claude and $HOME — applies to every session' },
  project:  { label: 'Project',   emoji: '\u{1F4C1}', description: 'Project-root files — applies when the session runs in that project' },
  subagent: { label: 'Subagents', emoji: '\u{1F916}', description: '~/.claude/agents — Claude Code subagent definitions' },
  memory:   { label: 'Memory',    emoji: '\u{1F9E0}', description: '~/.claude/projects/*/memory — auto-loaded by Claude Code per project' },
  command:  { label: 'Commands',  emoji: '⚡',    description: '~/.claude/commands — slash-command definitions' },
}

const SCOPE_ORDER = ['global', 'project', 'subagent', 'memory', 'command']

const INJECTION_HARNESSES: { slug: string; label: string }[] = [
  { slug: 'codex',  label: 'Codex' },
  { slug: 'hermes', label: 'Hermes' },
  { slug: 'gemini', label: 'Gemini' },
  { slug: 'aider',  label: 'Aider' },
  { slug: 'goose',  label: 'Goose' },
]

function usedBy(f: TrackedFile): { label: string; mode: string } {
  const base = f.path.split('/').pop() || ''
  if (base === 'CLAUDE.md') return { label: 'Claude Code (native)', mode: 'native' }
  if (base === 'AGENTS.md') return { label: 'All non-Claude harnesses (injected)', mode: 'injected' }
  if (base === 'GEMINI.md') return { label: 'Gemini (native)', mode: 'native' }
  if (base === 'copilot-instructions.md') return { label: 'GitHub Copilot (native)', mode: 'native' }
  if (base === '.cursorrules') return { label: 'Cursor (native)', mode: 'native' }
  if (base === '.clinerules') return { label: 'Cline (native)', mode: 'native' }
  if (base === '.windsurfrules') return { label: 'Windsurf (native)', mode: 'native' }
  if (base === '.continuerules') return { label: 'Continue (native)', mode: 'native' }
  if (base === '.aider.conf.yml') return { label: 'Aider (native config)', mode: 'native' }
  if (f.scope === 'subagent') return { label: 'Claude Code subagent', mode: 'subagent' }
  if (f.scope === 'memory') return { label: 'Claude Code memory', mode: 'memory' }
  if (f.scope === 'command') return { label: 'Claude Code commands', mode: 'native' }
  return { label: f.scope, mode: 'unknown' }
}

export function BridgeFiles() {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const [files, setFiles] = useState<TrackedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<number | null>(null)
  const [previewHarness, setPreviewHarness] = useState<string | null>(null)
  const [preview, setPreview] = useState<ResolvedContext | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const fetchFiles = async () => {
    try {
      const res = await apiFetch(`${basePath}/files`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFiles(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiles() }, [])

  useEffect(() => {
    if (!previewHarness) { setPreview(null); return }
    setPreviewLoading(true)
    setPreviewError(null)
    apiFetch(`${basePath}/context/resolve?harness=${encodeURIComponent(previewHarness)}`)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`)
        return r.json() as Promise<ResolvedContext>
      })
      .then(setPreview)
      .catch(e => setPreviewError(e instanceof Error ? e.message : 'Resolve failed'))
      .finally(() => setPreviewLoading(false))
  }, [previewHarness, apiFetch, basePath])

  const runScan = async () => {
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await apiFetch(`${basePath}/files/scan`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const r = await res.json()
      // `updated` counts files whose content hash changed. It used to count
      // every pre-existing row, so this line read "154 updated" after every
      // scan whether or not a single byte moved. Show `unchanged` alongside it
      // so the number has a denominator and a zero is legible as a no-op.
      let msg = `Scanned ${r.scanned} · ${r.added} new · ${r.updated} updated · ${r.unchanged} unchanged · ${r.missing} missing`
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
          .map((e: { path: string; stage: string; error: string }) => `${e.path} (${e.stage}: ${e.error})`)
          .join(' · ')
        msg += ` — ${r.errors.length} unaccounted for, so scanned is an undercount: ${named}`
      }
      setScanMsg(msg)
      await fetchFiles()
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const toggleEnabled = async (f: TrackedFile) => {
    const action = f.enabled ? 'disable' : 'enable'
    const res = await apiFetch(`${basePath}/files/${f.id}/${action}`, { method: 'POST' })
    if (res.ok) {
      const updated: TrackedFile = await res.json()
      setFiles(prev => prev.map(x => x.id === f.id ? updated : x))
    } else {
      alert(await res.text())
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter(f =>
      f.path.toLowerCase().includes(q) ||
      (f.agent_slug || '').toLowerCase().includes(q) ||
      f.scope.toLowerCase().includes(q) ||
      usedBy(f).label.toLowerCase().includes(q)
    )
  }, [files, query])

  const byScope = useMemo(() => {
    const m: Record<string, TrackedFile[]> = {}
    for (const f of filtered) {
      (m[f.scope] ||= []).push(f)
    }
    return m
  }, [filtered])

  const toggleSection = (scope: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  if (loading) return <div className="bfiles-container"><p>Loading…</p></div>
  if (error) return (
    <div className="bfiles-container">
      <p className="bridge-error">Error: {error}</p>
      <button onClick={() => { setLoading(true); fetchFiles() }} className="bfiles-btn">Retry</button>
    </div>
  )

  const scopes = SCOPE_ORDER.filter(s => byScope[s]?.length)

  return (
    <div className="bfiles-container">
      <div className="bfiles-header">
        <h2>Agent files <span className="bfiles-count">{files.length}</span></h2>
        <div className="bfiles-header-right">
          <input
            type="text"
            placeholder="Search path / slug / scope / agent…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="bfiles-search"
          />
          <button className="bfiles-btn" onClick={fetchFiles}>Refresh</button>
          <button className="bfiles-btn-primary" onClick={runScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan disk'}
          </button>
        </div>
      </div>

      <PromptCollectionsPanel apiFetch={apiFetch} basePath={basePath} />

      <div className="bfiles-explainer">
        <strong>How these files reach agents:</strong> the prompt collections above are the editable source. They compile
        into host-level and project-level <code>CLAUDE.md</code> and <code>AGENTS.md</code>, which stay versioned here as
        tracked files. Claude Code reads <code>CLAUDE.md</code> directly from disk; non-Claude harnesses receive
        <code> AGENTS.md</code> through bridge injection. Remote runners pull the same compiled files through
        <code> /seed/manifest</code> and reconcile non-destructively.
      </div>

      <MachinesSeedPanel apiFetch={apiFetch} basePath={basePath} />

      <div className="bfiles-preview-section">
        <div className="bfiles-preview-header">
          <strong>Resolved injection preview</strong>
          <span className="bfiles-preview-hint">What does each non-Claude harness receive?</span>
        </div>
        <div className="bfiles-preview-tabs">
          {INJECTION_HARNESSES.map(h => (
            <button
              key={h.slug}
              className={`bfiles-preview-tab ${previewHarness === h.slug ? 'bfiles-preview-tab-active' : ''}`}
              onClick={() => setPreviewHarness(previewHarness === h.slug ? null : h.slug)}
            >
              {h.label}
            </button>
          ))}
        </div>
        {previewHarness && (
          <div className="bfiles-preview-body">
            {previewLoading && <p>Resolving…</p>}
            {previewError && <p className="bridge-error">{previewError}</p>}
            {preview && !previewLoading && (
              <>
                {preview.skip_reason && (
                  <p className="bfiles-preview-skip">Skipped: {preview.skip_reason}</p>
                )}
                {!preview.skip_reason && preview.manifest.length === 0 && (
                  <p className="bfiles-preview-skip">No AGENTS.md files matched. Add one in <code>$HOME/AGENTS.md</code> for global scope, or in a project root.</p>
                )}
                {preview.manifest.length > 0 && (
                  <>
                    <ul className="bfiles-manifest-list">
                      {preview.manifest.map((m, i) => (
                        <li key={i}>
                          <span className="bfiles-manifest-scope">{m.scope}</span>
                          <code>{m.path}</code>
                          <span className="bfiles-manifest-bytes">{m.bytes} B</span>
                        </li>
                      ))}
                    </ul>
                    <pre className="bfiles-preview-content">{preview.content}</pre>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {scanMsg && <p className="bfiles-scan-msg">{scanMsg}</p>}

      <div className="bfiles-preview-section">
        <div className="bfiles-preview-header">
          <strong>Materialized files</strong>
          <span className="bfiles-preview-hint">Compiled prompt outputs, native tool files, seed state, and history.</span>
        </div>
      </div>

      {scopes.length === 0 && <p className="bfiles-empty">No files indexed. Click Scan disk.</p>}

      {scopes.map(scope => {
        const meta = SCOPE_META[scope] || { label: scope, emoji: '\u{1F4C4}', description: '' }
        const items = byScope[scope]
        const isCollapsed = collapsed.has(scope)
        return (
          <div key={scope} className={`bfiles-section ${isCollapsed ? 'bfiles-section-collapsed' : ''}`}>
            <h3
              className={`bfiles-section-title ${isCollapsed ? 'bfiles-collapsed' : ''}`}
              onClick={() => toggleSection(scope)}
            >
              <span className="bfiles-scope-emoji">{meta.emoji}</span>
              {meta.label}
              <span className="bfiles-section-count">{items.length}</span>
              {meta.description && <span className="bfiles-scope-description">{meta.description}</span>}
            </h3>
            {!isCollapsed && (
              <ul className="bfiles-file-list">
                {items
                  .slice()
                  .sort((a, b) => a.path.localeCompare(b.path))
                  .map(f => (
                    <FileRow
                      key={f.id}
                      file={f}
                      apiFetch={apiFetch}
                      basePath={basePath}
                      expanded={openId === f.id}
                      onToggle={() => setOpenId(openId === f.id ? null : f.id)}
                      onToggleEnabled={() => toggleEnabled(f)}
                      onSaved={updated => setFiles(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    />
                  ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PromptCollectionsPanel({ apiFetch, basePath }: { apiFetch: FetchFn; basePath: string }) {
  const [collections, setCollections] = useState<PromptCollectionView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [createPath, setCreatePath] = useState('')
  const [createTitle, setCreateTitle] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`${basePath}/prompt-collections`)
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      const data = await res.json()
      setCollections(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prompt collections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const global = collections.filter(c => c.collection.scope === 'global')
  const projects = collections.filter(c => c.collection.scope === 'project')

  const createProject = async () => {
    setCreating(true)
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
      })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      setCreatePath('')
      setCreateTitle('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bfiles-preview-section">
      <div className="bfiles-preview-header">
        <strong>Main prompt</strong>
        <span className="bfiles-preview-hint">Structured source for the compiled prompt files.</span>
      </div>
      {loading && <p>Loading prompt collections…</p>}
      {error && <p className="bridge-error">{error}</p>}
      {!loading && global.map(view => (
        <PromptCollectionCard
          key={view.collection.id}
          view={view}
          apiFetch={apiFetch}
          basePath={basePath}
          open={openId === view.collection.id}
          onToggle={() => setOpenId(openId === view.collection.id ? null : view.collection.id)}
          onChanged={load}
        />
      ))}
      <div className="bfiles-preview-header" style={{ marginTop: 18 }}>
        <strong>Project prompts</strong>
        <span className="bfiles-preview-hint">One collection per repo root. Create one even if the repo has no prompt files yet.</span>
      </div>
      <div className="bfiles-actions" style={{ marginBottom: 12 }}>
        <input
          className="bfiles-search"
          placeholder="/home/kayushkincom/repos/my-repo"
          value={createPath}
          onChange={e => setCreatePath(e.target.value)}
        />
        <input
          className="bfiles-search"
          placeholder="Optional title"
          value={createTitle}
          onChange={e => setCreateTitle(e.target.value)}
        />
        <button className="bfiles-btn-primary" onClick={createProject} disabled={creating || !createPath.trim()}>
          {creating ? 'Creating…' : 'Add project prompt'}
        </button>
      </div>
      {!loading && projects.length === 0 && (
        <p className="bfiles-empty">No project prompt collections yet.</p>
      )}
      {!loading && projects.map(view => (
        <PromptCollectionCard
          key={view.collection.id}
          view={view}
          apiFetch={apiFetch}
          basePath={basePath}
          open={openId === view.collection.id}
          onToggle={() => setOpenId(openId === view.collection.id ? null : view.collection.id)}
          onChanged={load}
        />
      ))}
    </div>
  )
}

function PromptCollectionCard({
  view, apiFetch, basePath, open, onToggle, onChanged,
}: {
  view: PromptCollectionView
  apiFetch: FetchFn
  basePath: string
  open: boolean
  onToggle: () => void
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  const compile = async () => {
    setBusy(true)
    try {
      const res = await apiFetch(`${basePath}/prompt-collections/${view.collection.id}/compile`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bfiles-machine-card" style={{ marginBottom: 12 }}>
      <div className="bfiles-file-header">
        <button className="bfiles-caret" onClick={onToggle}>{open ? '▾' : '▸'}</button>
        <button className="bfiles-file-title" onClick={onToggle}>
          <span className="bfiles-file-basename">{view.collection.title}</span>
          <span className="bfiles-file-parent">{view.collection.root_path}</span>
        </button>
        <span className="bfiles-usedby-tag bfiles-mode-injected">{view.collection.scope}</span>
        <button className="bfiles-btn" onClick={compile} disabled={busy}>
          {busy ? 'Compiling…' : 'Compile now'}
        </button>
      </div>
      {open && (
        <div className="bfiles-file-body">
          <p className="bfiles-machines-hint">
            Edit sections here. Saving a section recompiles the target files and nudges connected runners to reconcile.
          </p>
          {view.outputs.map(output => (
            <div key={output.target} className="bfiles-version-preview" style={{ marginBottom: 12 }}>
              <div className="bfiles-version-preview-header">
                <strong>{output.target === 'claude' ? 'CLAUDE.md' : 'AGENTS.md'}</strong>
                <span className="bfiles-meta">{output.path}</span>
              </div>
              <pre className="bfiles-version-content">{output.content || '(no sections for this target yet)'}</pre>
            </div>
          ))}
          <div className="bfiles-history-body">
            {view.sections.map(section => (
              <PromptSectionEditor
                key={section.id}
                section={section}
                apiFetch={apiFetch}
                basePath={basePath}
                onChanged={onChanged}
              />
            ))}
          </div>
          <AddPromptSectionForm
            collectionID={view.collection.id}
            apiFetch={apiFetch}
            basePath={basePath}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  )
}

function PromptSectionEditor({
  section, apiFetch, basePath, onChanged,
}: {
  section: PromptSection
  apiFetch: FetchFn
  basePath: string
  onChanged: () => Promise<void>
}) {
  const [draft, setDraft] = useState(section)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(section)

  useEffect(() => { setDraft(section) }, [section])

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await apiFetch(`${basePath}/prompt-sections/${section.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      await onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await apiFetch(`${basePath}/prompt-sections/${section.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      await onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bfiles-version-preview" style={{ marginBottom: 12 }}>
      <div className="bfiles-actions" style={{ marginBottom: 8 }}>
        <input
          className="bfiles-search"
          value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}
          placeholder="Section title"
        />
        <select
          className="bfiles-search"
          value={draft.applies_to}
          onChange={e => setDraft({ ...draft, applies_to: e.target.value })}
        >
          <option value="all">All harnesses</option>
          <option value="claude">Claude only</option>
          <option value="agents">Non-Claude only</option>
        </select>
        <input
          className="bfiles-search"
          type="number"
          value={draft.priority}
          onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })}
          placeholder="Priority"
        />
        <label className="bfiles-meta">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={e => setDraft({ ...draft, enabled: e.target.checked })}
          /> enabled
        </label>
      </div>
      <input
        className="bfiles-search"
        style={{ width: '100%', marginBottom: 8 }}
        value={draft.heading || ''}
        onChange={e => setDraft({ ...draft, heading: e.target.value })}
        placeholder="Heading line, e.g. # Directives"
      />
      <textarea
        className="bfiles-editor"
        value={draft.body}
        onChange={e => setDraft({ ...draft, body: e.target.value })}
        spellCheck={false}
      />
      <div className="bfiles-actions">
        <button className="bfiles-btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : dirty ? 'Save section' : 'Saved'}
        </button>
        <button className="bfiles-btn" onClick={() => setDraft(section)} disabled={!dirty || saving}>
          Revert
        </button>
        <button className="bfiles-btn" onClick={remove} disabled={saving}>
          Delete
        </button>
      </div>
      {err && <p className="bridge-error">{err}</p>}
    </div>
  )
}

function AddPromptSectionForm({
  collectionID, apiFetch, basePath, onChanged,
}: {
  collectionID: number
  apiFetch: FetchFn
  basePath: string
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [heading, setHeading] = useState('')
  const [body, setBody] = useState('')
  const [appliesTo, setAppliesTo] = useState('all')
  const [priority, setPriority] = useState(1000)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await apiFetch(`${basePath}/prompt-collections/${collectionID}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, heading, body, applies_to: appliesTo, priority, enabled: true,
        }),
      })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      setTitle('')
      setHeading('')
      setBody('')
      setAppliesTo('all')
      setPriority(1000)
      setOpen(false)
      await onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return <button className="bfiles-btn-primary" onClick={() => setOpen(true)}>Add section</button>
  }

  return (
    <div className="bfiles-version-preview">
      <div className="bfiles-actions" style={{ marginBottom: 8 }}>
        <input className="bfiles-search" value={title} onChange={e => setTitle(e.target.value)} placeholder="Section title" />
        <select className="bfiles-search" value={appliesTo} onChange={e => setAppliesTo(e.target.value)}>
          <option value="all">All harnesses</option>
          <option value="claude">Claude only</option>
          <option value="agents">Non-Claude only</option>
        </select>
        <input className="bfiles-search" type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} />
      </div>
      <input className="bfiles-search" style={{ width: '100%', marginBottom: 8 }} value={heading} onChange={e => setHeading(e.target.value)} placeholder="Heading line" />
      <textarea className="bfiles-editor" value={body} onChange={e => setBody(e.target.value)} spellCheck={false} />
      <div className="bfiles-actions">
        <button className="bfiles-btn-primary" onClick={submit} disabled={saving || !title.trim()}>
          {saving ? 'Creating…' : 'Create section'}
        </button>
        <button className="bfiles-btn" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
      </div>
      {err && <p className="bridge-error">{err}</p>}
    </div>
  )
}

function FileRow({ file, apiFetch, basePath, expanded, onToggle, onToggleEnabled, onSaved }: {
  file: TrackedFile
  apiFetch: FetchFn
  basePath: string
  expanded: boolean
  onToggle: () => void
  onToggleEnabled: () => void
  onSaved: (f: TrackedFile) => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dirty = content !== null && draft !== content

  useEffect(() => {
    if (!expanded || content !== null) return
    setLoading(true)
    apiFetch(`${basePath}/files/${file.id}/content`)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`)
        return r.json()
      })
      .then(j => {
        setContent(j.content || '')
        setDraft(j.content || '')
        setErr(null)
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [expanded, content, file.id, apiFetch, basePath])

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await apiFetch(`${basePath}/files/${file.id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      const updated: TrackedFile = await res.json()
      setContent(draft)
      onSaved(updated)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const basename = file.path.split('/').pop() || file.path
  const parent = file.path.substring(0, file.path.length - basename.length - 1)
  const consumer = usedBy(file)

  return (
    <li className={`bfiles-file ${file.enabled ? '' : 'bfiles-file-disabled'}`}>
      <div className="bfiles-file-header">
        <button className="bfiles-caret" onClick={onToggle}>{expanded ? '▾' : '▸'}</button>
        <button className="bfiles-file-title" onClick={onToggle}>
          <span className="bfiles-file-basename">{basename}</span>
          <span className="bfiles-file-parent">{parent}</span>
        </button>
        <span className={`bfiles-usedby-tag bfiles-mode-${consumer.mode}`} title={`Consumed by: ${consumer.label}`}>
          {consumer.label}
        </span>
        {file.agent_slug && <span className="bfiles-slug-tag">{file.agent_slug}</span>}
        {file.status === 'missing' && <span className="bfiles-missing-tag">missing</span>}
        <button
          className={`bfiles-toggle-btn ${file.enabled ? 'bfiles-toggle-on' : 'bfiles-toggle-off'}`}
          onClick={onToggleEnabled}
          title={file.enabled ? 'Disable (rename to .disabled)' : 'Enable'}
        >
          {file.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {expanded && (
        <div className="bfiles-file-body">
          {loading && <p>Loading…</p>}
          {err && <p className="bridge-error">{err}</p>}
          {content !== null && (
            <>
              <textarea
                className="bfiles-editor"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
              />
              <div className="bfiles-actions">
                <button
                  className="bfiles-btn-primary"
                  onClick={save}
                  disabled={!dirty || saving}
                >
                  {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                </button>
                {dirty && (
                  <button className="bfiles-btn" onClick={() => setDraft(content)}>
                    Revert
                  </button>
                )}
                <span className="bfiles-meta">
                  {(file.size / 1024).toFixed(1)} KB · mtime {new Date(file.mtime * 1000).toLocaleString()}
                </span>
              </div>
              <FileHistory
                fileID={file.id}
                apiFetch={apiFetch}
                basePath={basePath}
                onRestore={async (versionContent) => { setDraft(versionContent) }}
              />
            </>
          )}
        </div>
      )}
    </li>
  )
}

function FileHistory({ fileID, apiFetch, basePath, onRestore }: {
  fileID: number
  apiFetch: FetchFn
  basePath: string
  onRestore: (content: string) => void
}) {
  const [versions, setVersions] = useState<FileVersion[] | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [previewID, setPreviewID] = useState<number | null>(null)
  const [previewBody, setPreviewBody] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await apiFetch(`${basePath}/files/${fileID}/versions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setVersions(await res.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open && versions === null) load() }, [open])

  const loadPreview = async (vid: number) => {
    setPreviewID(vid)
    setPreviewBody(null)
    try {
      const res = await apiFetch(`${basePath}/versions/${vid}/content`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setPreviewBody(j.content || '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'preview failed')
    }
  }

  return (
    <div className="bfiles-history">
      <button className="bfiles-btn" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} History {versions ? `(${versions.length})` : ''}
      </button>
      {open && (
        <div className="bfiles-history-body">
          {loading && <p>Loading…</p>}
          {err && <p className="bridge-error">{err}</p>}
          {versions && versions.length === 0 && (
            <p className="bfiles-empty">No history yet — first save will create a version.</p>
          )}
          {versions && versions.length > 0 && (
            <ul className="bfiles-version-list">
              {versions.map(v => (
                <li key={v.id} className="bfiles-version-row">
                  <span className="bfiles-version-time">{new Date(v.created_at * 1000).toLocaleString()}</span>
                  <span className="bfiles-version-source">{v.source}</span>
                  {v.machine_id && <span className="bfiles-version-machine">from {v.machine_id}</span>}
                  <code className="bfiles-version-sha">{v.sha256.slice(0, 12)}</code>
                  <span className="bfiles-version-size">{v.size} B</span>
                  {v.note && <span className="bfiles-version-note">{v.note}</span>}
                  <button className="bfiles-btn" onClick={() => loadPreview(v.id)}>View</button>
                </li>
              ))}
            </ul>
          )}
          {previewID && previewBody !== null && (
            <div className="bfiles-version-preview">
              <div className="bfiles-version-preview-header">
                <strong>Version #{previewID}</strong>
                <button className="bfiles-btn" onClick={() => onRestore(previewBody)}>Load into editor</button>
                <button className="bfiles-btn" onClick={() => { setPreviewID(null); setPreviewBody(null) }}>Close</button>
              </div>
              <pre className="bfiles-version-content">{previewBody}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MachinesSeedPanel({ apiFetch, basePath }: { apiFetch: FetchFn; basePath: string }) {
  const [profiles, setProfiles] = useState<MachineSeedProfile[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [statesByMachine, setStatesByMachine] = useState<Record<string, MachineSeedStateRow[]>>({})

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await apiFetch(`${basePath}/seed/profiles`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const list: MachineSeedProfile[] = await res.json()
      setProfiles(list)
      const states: Record<string, MachineSeedStateRow[]> = {}
      await Promise.all(list.map(async p => {
        const r = await apiFetch(`${basePath}/seed/state?machine_id=${encodeURIComponent(p.machine_id)}`)
        if (r.ok) states[p.machine_id] = await r.json()
      }))
      setStatesByMachine(states)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open && profiles.length === 0 && !loading) load() }, [open])

  return (
    <div className="bfiles-machines-panel">
      <div className="bfiles-machines-header">
        <button className="bfiles-btn" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} Runners & seed state
        </button>
        <button className="bfiles-btn" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="bfiles-machines-hint">
          Per-machine view of which files each runner has on disk.
        </span>
      </div>
      {open && (
        <div className="bfiles-machines-body">
          {err && <p className="bridge-error">{err}</p>}
          {!loading && profiles.length === 0 && (
            <p className="bfiles-empty">No runners enrolled yet.</p>
          )}
          {profiles.map(p => {
            const rows = statesByMachine[p.machine_id] || []
            const observed = rows.filter(r => r.observed_sha).length
            return (
              <div key={p.machine_id} className="bfiles-machine-card">
                <strong>{p.machine_id}</strong>
                <span className="bfiles-machine-scopes">scopes: {p.scopes.join(', ')}</span>
                <span className="bfiles-machine-stats">{observed} files observed / {rows.length} state rows</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
