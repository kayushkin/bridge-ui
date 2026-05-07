import { useCallback, useEffect, useState } from 'react'
import { useBridgeConfig } from '../../context'
import type { ManagedSession } from '../../types'

// SessionBypassToggle is the per-session permission-bypass switch rendered
// alongside Compact / Tools / Fork in the chat controls bar. The session
// inherits the global toggle state (settings page) at creation; flipping
// this overrides the global for THIS session only — see the snapshot /
// override semantics in llm-bridge-server/internal/server/bypass_inject.go.
//
// Persists via PUT /sessions/{id}/bypass-permissions; the new value lands
// in session.harness_config.bypass_permissions. Read live by the CC
// PreToolUse prehook (takes effect on the next tool call), forwarded to
// non-CC harnesses on next start/resume.
export function SessionBypassToggle({ session }: { session: ManagedSession }) {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const cfg = session.harness_config as Record<string, unknown> | undefined
  const initial = typeof cfg?.bypass_permissions === 'boolean' ? cfg.bypass_permissions : false
  const [enabled, setEnabled] = useState<boolean>(initial)
  const [busy, setBusy] = useState(false)

  // Re-sync if the upstream session prop changes (e.g. another tab toggled it).
  useEffect(() => { setEnabled(initial) }, [initial])

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const next = !enabled
    setEnabled(next) // optimistic
    try {
      const res = await apiFetch(`${basePath}/sessions/${session.bridge_id}/bypass-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setEnabled(!next) // roll back on failure — error surfaces in the network tab; keep the controls bar quiet.
    } finally {
      setBusy(false)
    }
  }, [apiFetch, basePath, session.bridge_id, enabled, busy])

  return (
    <button
      type="button"
      className={`bc-ctrl-btn${enabled ? ' bc-ctrl-btn-active' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={enabled}
      title={enabled
        ? 'Bypass: ON for this session — every tool call auto-approves. Click to turn off.'
        : 'Bypass: OFF for this session — tool calls go through permission rules. Click to turn on.'}
    >
      Bypass{enabled ? ' ✓' : ''}
    </button>
  )
}
