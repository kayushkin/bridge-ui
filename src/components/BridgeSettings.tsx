import { useEffect, useState, useCallback } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeHarnesses, harnessNameKey, harnessNamesFromKey } from '../useBridgeHarnesses'
import {
  PermissionModeAsk,
  PermissionModeAuto,
  PermissionModeBypass,
  type BridgePrefs,
  type FetchFn,
  type HarnessDefaults,
  type HarnessInfo,
} from '../types'
import { SourceFoldersEditor } from './SourceFoldersEditor'

interface ModelInfo {
  id: string
  name: string
  provider: string
  enabled: boolean
  input_cost: number
  output_cost: number
}

const EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max']

const COMMON_TOOLS = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch',
  'NotebookEdit', 'TodoWrite', 'AskUserQuestion',
]

export function BridgeSettings() {
  const { fetch: apiFetch, basePath, renderHarnessExtension } = useBridgeConfig()
  const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` })
  const { harnesses } = useBridgeHarnesses()
  const [models, setModels] = useState<ModelInfo[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [localDefaults, setLocalDefaults] = useState<Record<string, HarnessDefaults>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data: ModelInfo[]) => {
      setModels(data.filter(m => m.enabled))
    }).catch(() => {})
  }, [apiFetch, basePath])

  // The form is seeded from saved prefs for every harness on the list. Keyed on
  // the harness *names* rather than the list itself: `/harnesses` is polled now,
  // and a tick that only reports a harness going available or changing its label
  // must not reseed the form and throw away edits the user has not saved yet.
  // Only a harness appearing or disappearing needs a fresh seed.
  const nameKey = harnessNameKey(harnesses)
  useEffect(() => {
    const defaults: Record<string, HarnessDefaults> = {}
    for (const name of harnessNamesFromKey(nameKey)) defaults[name] = bridgePrefs.getDefaults(name)
    setLocalDefaults(defaults)
  }, [nameKey, bridgePrefs.getDefaults])

  const toggleExpand = (name: string) => setExpanded(prev => ({ ...prev, [name]: !prev[name] }))

  const updateLocal = (harness: string, field: keyof HarnessDefaults, value: unknown) => {
    setLocalDefaults(prev => ({ ...prev, [harness]: { ...prev[harness], [field]: value } }))
  }

  const toggleTool = (harness: string, tool: string) => {
    setLocalDefaults(prev => {
      const current = prev[harness]?.disabled_tools || []
      const next = current.includes(tool) ? current.filter(t => t !== tool) : [...current, tool]
      return { ...prev, [harness]: { ...prev[harness], disabled_tools: next } }
    })
  }

  const saveDefaults = useCallback(async (harness: string) => {
    setSaving(harness)
    const defaults = localDefaults[harness] || {}
    const cleaned: HarnessDefaults = {}
    if (defaults.model) cleaned.model = defaults.model
    if (defaults.effort) cleaned.effort = defaults.effort
    if (defaults.max_budget !== undefined && defaults.max_budget > 0) cleaned.max_budget = defaults.max_budget
    if (defaults.disabled_tools?.length) cleaned.disabled_tools = defaults.disabled_tools
    bridgePrefs.setHarnessDefaults(harness, cleaned)
    setTimeout(() => setSaving(null), 500)
  }, [localDefaults, bridgePrefs])

  const hasCapability = (harness: HarnessInfo, cap: string) => harness.capabilities?.includes(cap)

  return (
    <div className="bset-container">
      <SourceFoldersEditor />

      <PermissionsModeSelector
        apiFetch={apiFetch}
        basePath={basePath}
        prefs={bridgePrefs.prefs}
        loaded={bridgePrefs.loaded}
        refreshPrefs={bridgePrefs.refreshPrefs}
      />

      <h2 className="bset-title">Harness Defaults</h2>
      <p className="bset-subtitle">Configure default settings for each harness type. These are applied when creating new sessions.</p>

      <div className="bset-grid">
        {harnesses.map(h => {
          const defaults = localDefaults[h.name] || {}
          const isExpanded = expanded[h.name]
          const label = h.label || h.name
          const emoji = h.emoji || ''

          return (
            <div key={h.name} className={`bset-card ${!h.available ? 'bset-unavailable' : ''}`}>
              <div className="bset-card-header" onClick={() => toggleExpand(h.name)}>
                <span className="bset-harness-name">
                  {h.image ? <img className="bset-harness-img" src={`${basePath}${h.image}`} alt={label} /> : <span className="bset-emoji">{emoji}</span>}
                  {label}
                  {!h.available && <span className="bset-unavail-badge">unavailable</span>}
                </span>
                <span className="bset-expand-icon">{isExpanded ? '\u2212' : '+'}</span>
              </div>

              {isExpanded && (
                <div className="bset-card-body">
                  {hasCapability(h, 'model') && (
                    <div className="bset-field">
                      <label>Default Model</label>
                      <select value={defaults.model || ''} onChange={e => updateLocal(h.name, 'model', e.target.value)}>
                        <option value="">&mdash; Use harness default &mdash;</option>
                        {models.filter(m => !h.supported_providers?.length || h.supported_providers.includes(m.provider)).map(m => (
                          <option key={m.id} value={m.id}>{m.id} (${m.input_cost}/${m.output_cost} MTok)</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {hasCapability(h, 'effort') && (
                    <div className="bset-field">
                      <label>Effort Level</label>
                      <select value={defaults.effort || ''} onChange={e => updateLocal(h.name, 'effort', e.target.value)}>
                        <option value="">&mdash; Default &mdash;</option>
                        {EFFORT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </div>
                  )}

                  {hasCapability(h, 'budget') && (
                    <div className="bset-field">
                      <label>Max Budget ($)</label>
                      <input type="number" step="0.5" min="0" placeholder="No limit" value={defaults.max_budget ?? ''} onChange={e => updateLocal(h.name, 'max_budget', e.target.value ? parseFloat(e.target.value) : undefined)} />
                    </div>
                  )}

                  {hasCapability(h, 'tools') && (
                    <div className="bset-field">
                      <label>Disabled Tools</label>
                      <div className="bset-tool-grid">
                        {COMMON_TOOLS.map(tool => {
                          const disabled = defaults.disabled_tools?.includes(tool)
                          return (
                            <button key={tool} type="button" className={`bset-tool-chip ${disabled ? 'bset-tool-disabled' : ''}`} onClick={() => toggleTool(h.name, tool)}>
                              {tool}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="bset-caps-info">
                    <span className="bset-caps-label">Capabilities:</span>
                    {h.capabilities?.map(c => <span key={c} className="bset-cap-badge">{c}</span>)}
                  </div>

                  <button className="bset-save-btn" onClick={() => saveDefaults(h.name)} disabled={saving === h.name}>
                    {saving === h.name ? 'Saved!' : 'Save Defaults'}
                  </button>

                  {renderHarnessExtension?.(h.name)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// PermissionsModeSelector is the global permission-mode selector. The
// selected mode is the default for new sessions (snapshotted into
// HarnessConfig at create time) and the fallback for legacy sessions
// without a per-session mode. Saved as bridge-prefs.permission_mode;
// bridge-server reads it on every prehook call so changes take effect
// immediately for every active and future session.
function PermissionsModeSelector({ apiFetch, basePath, prefs, loaded, refreshPrefs }: {
  apiFetch: FetchFn
  basePath: string
  prefs: BridgePrefs
  loaded: boolean
  refreshPrefs: () => Promise<void>
}) {
  // The mode the user just picked, held only while its POST is in flight. The
  // saved value comes from the shared record; this is the optimistic overlay so
  // the select does not snap back to the old mode for the length of a round
  // trip. Cleared once the record has been re-read, at which point the record
  // is the answer again.
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefer the new field; fall back to the legacy bool so older prefs files
  // migrate visibly on first render.
  const saved = prefs.permission_mode
    ? prefs.permission_mode
    : prefs.bypass_permissions ? PermissionModeBypass : PermissionModeAsk
  const mode = pending ?? saved

  const handleChange = useCallback(async (next: string) => {
    if (next === mode) return
    setBusy(true)
    setError(null)
    setPending(next)
    try {
      const res = await apiFetch(`${basePath}/bridge/permission-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // This endpoint writes the same record `useBridgePrefs` holds, so the
      // shared copy is stale until it is read again. Re-read before dropping
      // the overlay, or the select shows the old mode for a frame.
      await refreshPrefs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      // Either way the record is now the source of truth: on success it holds
      // the new mode, and on failure it holds the mode the server still has,
      // which is the revert.
      setPending(null)
      setBusy(false)
    }
  }, [mode, apiFetch, basePath, refreshPrefs])

  if (!loaded) {
    return null
  }

  return (
    <div className="bset-bypass-card">
      <h2 className="bset-title">Permissions</h2>
      <div className="bset-bypass-row">
        <label className="bset-mode-row">
          <strong>Mode:</strong>
          <select
            className="bset-mode-select"
            value={mode}
            disabled={busy}
            onChange={e => handleChange(e.target.value)}
          >
            <option value={PermissionModeAsk}>Ask — gate every novel tool call</option>
            <option value={PermissionModeAuto}>Auto — allow reads, edits, planning; ask for shell/fetch/agent</option>
            <option value={PermissionModeBypass}>Bypass — allow every tool call</option>
          </select>
        </label>
      </div>
      <p className="bset-subtitle">
        {mode === PermissionModeBypass && 'Bypass is ON. Every tool call auto-approves immediately; Codex sessions launch with sandbox=danger-full-access + approval=never. Permission rules in /permissions are ignored. AskUserQuestion still pauses for your answer.'}
        {mode === PermissionModeAuto && 'Auto-mode allows the bridge-defined safe-tool set (Read, Glob, Grep, LS, Edit, Write, MultiEdit, NotebookRead, NotebookEdit, TodoWrite, ExitPlanMode). Other tools still route through permission-store rules.'}
        {mode === PermissionModeAsk && 'Ask-mode routes every tool call through permission-store rules. Manage rules at /permissions; pending prompts surface inline in chat.'}
      </p>
      <p className="bset-subtitle">
        This is the global default. Each new session snapshots it at creation and can be overridden per-session via the mode selector in the chat controls bar.
      </p>
      {error && <p className="bset-error">{error}</p>}
    </div>
  )
}
