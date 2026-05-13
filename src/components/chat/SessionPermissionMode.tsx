import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBridgeConfig } from '../../context'
import {
  PermissionModeAsk,
  PermissionModeAuto,
  PermissionModeBypass,
  type HarnessInfo,
  type ManagedSession,
} from '../../types'

// SessionPermissionMode is the per-session permission-mode selector rendered
// alongside Compact / Tools / Fork in the chat controls bar. The session
// inherits the global mode at creation; this control overrides it for
// THIS session only — see snapshotPermissionModeIntoSession on the server
// for the create-time logic.
//
// Persists via PUT /sessions/{id}/permission-mode; the new value lands in
// session.harness_config.permission_mode. Read live by the PreToolUse
// prehook (takes effect on the next tool call) and forwarded to the
// harness as a start param on next spawn/resume.
//
// Options are filtered by the harness's SupportedPermissionModes — "auto"
// is hidden for harnesses that don't know how to translate it.
const MODE_LABELS: Record<string, string> = {
  [PermissionModeAsk]: 'Ask',
  [PermissionModeAuto]: 'Auto',
  [PermissionModeBypass]: 'Bypass',
}

const MODE_TITLES: Record<string, string> = {
  [PermissionModeAsk]: 'Ask before novel tool calls.',
  [PermissionModeAuto]: 'Auto-allow safe tools (reads + edits + planning); ask for shell, fetch, agent spawns.',
  [PermissionModeBypass]: 'Auto-allow every tool call. AskUserQuestion still pauses for your answer.',
}

export function SessionPermissionMode({
  session,
  harnesses,
}: {
  session: ManagedSession
  harnesses?: HarnessInfo[]
}) {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const cfg = session.harness_config as Record<string, unknown> | undefined
  const initial = useMemo(() => readMode(cfg), [cfg])
  const [mode, setMode] = useState<string>(initial)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setMode(initial) }, [initial])

  const supported = useMemo<string[]>(() => {
    const info = harnesses?.find(h => h.name === session.harness)
    const advertised = info?.supported_permission_modes
    if (advertised && advertised.length > 0) return advertised
    return [PermissionModeAsk, PermissionModeBypass]
  }, [harnesses, session.harness])

  const handleChange = useCallback(async (next: string) => {
    if (busy || next === mode) return
    setBusy(true)
    const prev = mode
    setMode(next)
    try {
      const res = await apiFetch(`${basePath}/sessions/${session.session_id}/permission-mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setMode(prev)
    } finally {
      setBusy(false)
    }
  }, [apiFetch, basePath, session.session_id, mode, busy])

  return (
    <div className="bc-ctrl-mode" title={MODE_TITLES[mode] ?? ''}>
      <select
        className="bc-ctrl-mode-select"
        value={mode}
        disabled={busy}
        onChange={e => handleChange(e.target.value)}
        aria-label="Permission mode"
      >
        {supported.map(m => (
          <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>
        ))}
      </select>
    </div>
  )
}

function readMode(cfg: Record<string, unknown> | undefined): string {
  if (!cfg) return PermissionModeAsk
  const explicit = cfg.permission_mode
  if (typeof explicit === 'string' && explicit !== '') return explicit
  if (cfg.bypass_permissions === true) return PermissionModeBypass
  return PermissionModeAsk
}
