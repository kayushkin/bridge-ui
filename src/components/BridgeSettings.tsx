import { useEffect, useState, useCallback } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgePrefs } from '../useBridgePrefs'
import type { FetchFn, HarnessDefaults, HarnessInfo } from '../types'
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

      <PermissionsBypassToggle apiFetch={apiFetch} basePath={basePath} />

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

// PermissionsBypassToggle is the global "skip permission MCP" switch. When
// off (default), every Bash/tool call goes through bridge_perm →
// permission-store rule engine. When on, new sessions launch with
// --permission-mode bypassPermissions (CC never calls our MCP) and every
// running harness has its MCP flipped into always-allow via a single
// /bridge/bypass-permissions broadcast. Saved as bridge-prefs
// .bypass_permissions; the dedicated endpoint takes care of both the
// pref write and the live fan-out.
function PermissionsBypassToggle({ apiFetch, basePath }: { apiFetch: FetchFn; basePath: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSessions, setActiveSessions] = useState<number | null>(null)

  // Load current state on mount.
  useEffect(() => {
    let cancelled = false
    apiFetch(`${basePath}/bridge-prefs`)
      .then(r => r.ok ? r.json() : null)
      .then((prefs: { bypass_permissions?: boolean } | null) => {
        if (!cancelled && prefs) setEnabled(!!prefs.bypass_permissions)
      })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [apiFetch, basePath])

  const toggle = useCallback(async () => {
    if (enabled === null) return
    setBusy(true)
    setError(null)
    const next = !enabled
    try {
      const res = await apiFetch(`${basePath}/bridge/bypass-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { active_sessions?: number; failures?: Record<string, string> }
      setEnabled(next)
      setActiveSessions(data.active_sessions ?? null)
      const failures = Object.keys(data.failures ?? {})
      if (failures.length > 0) {
        setError(`broadcast partial: ${failures.length} session(s) failed`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [enabled, apiFetch, basePath])

  if (enabled === null) {
    return null // initial fetch in flight
  }

  return (
    <div className="bset-bypass-card">
      <h2 className="bset-title">Permissions</h2>
      <div className="bset-bypass-row">
        <label className="bset-bypass-toggle">
          <input type="checkbox" checked={enabled} disabled={busy} onChange={toggle} />
          <span><strong>Bypass permission MCP</strong> — skip all rules; every tool call auto-approves</span>
        </label>
      </div>
      <p className="bset-subtitle">
        {enabled
          ? 'Bypass is ON. New sessions launch in bypassPermissions mode; running sessions have their MCP set to always-allow. Permission rules in /permissions are ignored until you turn this off.'
          : 'Bypass is OFF. Every tool call routes through permission-store rules. Manage rules at /permissions; pending prompts surface inline in chat.'}
      </p>
      {activeSessions !== null && (
        <p className="bset-subtitle">Last broadcast reached {activeSessions} active session{activeSessions === 1 ? '' : 's'}.</p>
      )}
      {error && <p className="bset-error">{error}</p>}
    </div>
  )
}
