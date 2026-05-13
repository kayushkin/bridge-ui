import { useEffect, useState, useCallback } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgePrefs } from '../useBridgePrefs'
import {
  PermissionModeAsk,
  PermissionModeAuto,
  PermissionModeBypass,
  type FetchFn,
  type HarnessDefaults,
  type HarnessInfo,
} from '../types'
import { SourceFoldersEditor } from './SourceFoldersEditor'
import { InberAgentsConfig } from './InberAgentsConfig'

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
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` })
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [localDefaults, setLocalDefaults] = useState<Record<string, HarnessDefaults>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
    apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data: ModelInfo[]) => {
      setModels(data.filter(m => m.enabled))
    }).catch(() => {})
  }, [apiFetch, basePath])

  useEffect(() => {
    const defaults: Record<string, HarnessDefaults> = {}
    for (const h of harnesses) defaults[h.name] = bridgePrefs.getDefaults(h.name)
    setLocalDefaults(defaults)
  }, [harnesses, bridgePrefs.getDefaults])

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

      <PermissionsModeSelector apiFetch={apiFetch} basePath={basePath} />

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

                  {h.name === 'inber' && <InberAgentsConfig />}
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
function PermissionsModeSelector({ apiFetch, basePath }: { apiFetch: FetchFn; basePath: string }) {
  const [mode, setMode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`${basePath}/bridge-prefs`)
      .then(r => r.ok ? r.json() : null)
      .then((prefs: { permission_mode?: string; bypass_permissions?: boolean } | null) => {
        if (cancelled || !prefs) return
        // Prefer the new field; fall back to legacy bool so older prefs
        // files migrate visibly on first render.
        if (prefs.permission_mode) setMode(prefs.permission_mode)
        else if (prefs.bypass_permissions) setMode(PermissionModeBypass)
        else setMode(PermissionModeAsk)
      })
      .catch(() => { if (!cancelled) setMode(PermissionModeAsk) })
    return () => { cancelled = true }
  }, [apiFetch, basePath])

  const handleChange = useCallback(async (next: string) => {
    if (mode === null || next === mode) return
    setBusy(true)
    setError(null)
    const prev = mode
    setMode(next)
    try {
      const res = await apiFetch(`${basePath}/bridge/permission-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      setMode(prev)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [mode, apiFetch, basePath])

  if (mode === null) {
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
