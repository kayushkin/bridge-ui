import { useCallback, useEffect, useState } from 'react'
import type { SourceFolderMapping, SourceFolderApplyResult } from '@kayushkin/llm-bridge-types'
import { useBridgeConfig } from '../context'
import { useBridgeFolders } from '../useBridgeFolders'

// Editor for the runtime source→folder map. Each row maps a session.source
// tag (e.g. "scheduler", "conformance") to a folder. Rows with default=true
// come from LLMBRIDGE_SOURCE_FOLDERS; default=false rows are runtime overrides
// stored in source_folders. PUT replaces; DELETE reverts to the env default.
//
// On Save, the editor offers to rebucket existing sessions whose folder was
// empty or matched the prior effective folder for that source. Manual moves
// (folder differs from the prior effective) are preserved.
export function SourceFoldersEditor() {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const folders = useBridgeFolders()
  const [rows, setRows] = useState<SourceFolderMapping[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [applyToExisting, setApplyToExisting] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [newSource, setNewSource] = useState('')
  const [newFolder, setNewFolder] = useState('')

  const refresh = useCallback(async () => {
    const res = await apiFetch(`${basePath}/source-folders`)
    if (!res.ok) return
    const data: SourceFolderMapping[] = await res.json()
    setRows(data)
    setDraft(Object.fromEntries(data.map(r => [r.source, r.folder_name])))
  }, [apiFetch, basePath])

  useEffect(() => { refresh() }, [refresh])

  const save = useCallback(async (source: string) => {
    const folder = draft[source]?.trim()
    if (!folder) return
    setBusy(source); setStatus(null)
    const res = await apiFetch(`${basePath}/source-folders/${encodeURIComponent(source)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_name: folder, apply_to_existing: applyToExisting }),
    })
    setBusy(null)
    if (!res.ok) {
      setStatus(`save failed: ${await res.text()}`)
      return
    }
    const result: SourceFolderApplyResult = await res.json()
    setStatus(applyToExisting
      ? `${source} → ${folder} (${result.updated} session${result.updated === 1 ? '' : 's'} rebucketed)`
      : `${source} → ${folder}`)
    await refresh()
  }, [apiFetch, basePath, draft, applyToExisting, refresh])

  const revert = useCallback(async (source: string) => {
    setBusy(source); setStatus(null)
    const res = await apiFetch(`${basePath}/source-folders/${encodeURIComponent(source)}`, { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) {
      setStatus(`revert failed: ${await res.text()}`)
      return
    }
    setStatus(`${source}: reverted to env default`)
    await refresh()
  }, [apiFetch, basePath, refresh])

  const addNew = useCallback(async () => {
    const src = newSource.trim()
    const fld = newFolder.trim()
    if (!src || !fld) return
    setBusy(src); setStatus(null)
    const res = await apiFetch(`${basePath}/source-folders/${encodeURIComponent(src)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_name: fld, apply_to_existing: applyToExisting }),
    })
    setBusy(null)
    if (!res.ok) {
      setStatus(`add failed: ${await res.text()}`)
      return
    }
    const result: SourceFolderApplyResult = await res.json()
    setStatus(applyToExisting
      ? `+ ${src} → ${fld} (${result.updated} rebucketed)`
      : `+ ${src} → ${fld}`)
    setNewSource(''); setNewFolder('')
    await refresh()
  }, [apiFetch, basePath, newSource, newFolder, applyToExisting, refresh])

  return (
    <div className="bset-container">
      <h2 className="bset-title">Session Source Folders</h2>
      <p className="bset-subtitle">
        Auto-file new sessions into a sidebar folder based on their <code>source</code> tag
        (set by the caller — autoworker, scheduler, conformance, etc.). Rows marked <em>default</em>
        come from LLMBRIDGE_SOURCE_FOLDERS; saving over them creates a runtime override.
      </p>

      <label className="bset-field" style={{ marginBottom: '0.5rem' }}>
        <input type="checkbox" checked={applyToExisting} onChange={e => setApplyToExisting(e.target.checked)} />
        {' '}Apply to existing sessions (preserves manual moves)
      </label>

      <table className="bset-sf-table">
        <thead>
          <tr><th>Source</th><th>Folder</th><th>Origin</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.source}>
              <td><code>{r.source}</code></td>
              <td>
                <select
                  value={draft[r.source] ?? r.folder_name}
                  onChange={e => setDraft(prev => ({ ...prev, [r.source]: e.target.value }))}
                  disabled={busy === r.source}
                >
                  {folders.folderOrder.map(f => <option key={f} value={f}>{f}</option>)}
                  {!folders.folderOrder.includes(r.folder_name) && (
                    <option value={r.folder_name}>{r.folder_name} (missing)</option>
                  )}
                </select>
              </td>
              <td>{r.default ? <em>default</em> : 'override'}</td>
              <td>
                <button
                  className="bset-save-btn"
                  onClick={() => save(r.source)}
                  disabled={busy === r.source || (draft[r.source] ?? r.folder_name) === r.folder_name}
                >Save</button>
                {!r.default && (
                  <button
                    className="bset-save-btn"
                    onClick={() => revert(r.source)}
                    disabled={busy === r.source}
                    style={{ marginLeft: '0.5rem' }}
                  >Revert</button>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td><input placeholder="new source tag" value={newSource} onChange={e => setNewSource(e.target.value)} /></td>
            <td>
              <select value={newFolder} onChange={e => setNewFolder(e.target.value)}>
                <option value="">— pick folder —</option>
                {folders.folderOrder.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </td>
            <td></td>
            <td>
              <button className="bset-save-btn" onClick={addNew} disabled={!newSource.trim() || !newFolder || busy !== null}>
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      {status && <p className="bset-subtitle">{status}</p>}
    </div>
  )
}
