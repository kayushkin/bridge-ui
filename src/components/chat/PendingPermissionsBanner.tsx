import { useState, useCallback } from 'react'
import { useBridgeConfig } from '../../context'
import type { HookEvent } from '../../types'
import { useWorkspace } from './WorkspaceContext'

// PendingPermissionsBanner is the sticky surface for awaiting_resolution
// HookEvents emitted by bridge_perm when permission-store returned an "ask"
// outcome. Pinned to the top of the workspace; renders nothing when there
// are no pending hooks.
//
// Each pending hook gets four buttons:
//   - Allow once     — POST resolve {behavior: allow}
//   - Deny           — POST resolve {behavior: deny}
//   - Always allow   — create a global rule, then resolve allow
//   - Always deny    — create a global rule, then resolve deny
//
// Always-rules are scoped global by design (per the locked spec). For Bash
// the pattern is derived from the command's first word so re-running the
// same kind of command (e.g. another `git push`) doesn't re-prompt; for
// non-Bash tools the rule has no pattern (matches every call of that tool).
// Users can refine the auto-created rule later in /permissions.
export function PendingPermissionsBanner() {
  const ws = useWorkspace()
  const { fetch: apiFetch, basePath } = useBridgeConfig()

  if (ws.pendingHooks.length === 0) return null

  // permission-store sits as a dash sibling of bridge: /api/bridge → /api/permission-store
  const permStoreBase = basePath.replace(/\/[^/]+$/, '/permission-store')

  return (
    <div className="bc-pending-banner" role="region" aria-label="Pending permission prompts">
      {ws.pendingHooks.map(hook => (
        <PendingHookCard
          key={hook.request_id || `nokey-${hook.event}`}
          hook={hook}
          onResolve={ws.resolveHook}
          apiFetch={apiFetch}
          permStoreBase={permStoreBase}
        />
      ))}
    </div>
  )
}

function PendingHookCard({
  hook,
  onResolve,
  apiFetch,
  permStoreBase,
}: {
  hook: HookEvent
  onResolve: ReturnType<typeof useWorkspace>['resolveHook']
  apiFetch: ReturnType<typeof useBridgeConfig>['fetch']
  permStoreBase: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestId = hook.request_id || ''
  const tool = hook.tool_name || ''
  const isBash = tool === 'Bash'
  const command = isBash ? String(hook.input?.command ?? '') : ''
  const firstWord = isBash ? (command.trim().split(/\s+/)[0] || '') : ''

  const inputPreview = isBash
    ? command || '(empty command)'
    : JSON.stringify(hook.input ?? {}, null, 2)

  const resolveOnce = useCallback(async (behavior: 'allow' | 'deny') => {
    if (!requestId) return
    setBusy(true)
    setError(null)
    try {
      await onResolve({ requestId, behavior, resolvedBy: 'user' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [requestId, onResolve])

  const resolveAlways = useCallback(async (behavior: 'allow' | 'deny') => {
    if (!requestId || !tool) return
    setBusy(true)
    setError(null)
    try {
      const pattern = isBash && firstWord ? `^${escapeRegex(firstWord)}\\b` : ''
      const ruleBody = {
        scope: 'global',
        priority: 200,
        tool,
        pattern,
        outcome: behavior,
        message: `auto-created from approval banner: ${behavior} ${tool}${pattern ? ' ' + pattern : ''}`,
        enabled: true,
      }
      const res = await apiFetch(`${permStoreBase}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleBody),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`rule create failed: HTTP ${res.status} ${text}`)
      }
      await onResolve({
        requestId,
        behavior,
        resolvedBy: behavior === 'allow' ? 'allow_always' : 'always_deny',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [requestId, tool, isBash, firstWord, apiFetch, permStoreBase, onResolve])

  const alwaysLabel = isBash && firstWord ? firstWord : tool || 'this'

  return (
    <div className="bc-pending-card">
      <div className="bc-pending-card-header">
        <strong className="bc-pending-tool">{tool || hook.event || 'tool call'}</strong>
        <span className="bc-pending-event">{hook.event}</span>
      </div>
      <pre className="bc-pending-input">{inputPreview}</pre>
      <div className="bc-pending-actions">
        <button type="button" className="bc-pending-allow" disabled={busy} onClick={() => resolveOnce('allow')}>
          Allow once
        </button>
        <button type="button" className="bc-pending-deny" disabled={busy} onClick={() => resolveOnce('deny')}>
          Deny
        </button>
        <button type="button" className="bc-pending-always-allow" disabled={busy} onClick={() => resolveAlways('allow')} title={`Create a global rule that auto-allows future "${alwaysLabel}" calls`}>
          Always allow {alwaysLabel}
        </button>
        <button type="button" className="bc-pending-always-deny" disabled={busy} onClick={() => resolveAlways('deny')} title={`Create a global rule that auto-denies future "${alwaysLabel}" calls`}>
          Always deny {alwaysLabel}
        </button>
      </div>
      {error && <p className="bc-pending-error">{error}</p>}
    </div>
  )
}

// escapeRegex turns a plain string into a literal regex match. Used so a
// command like `git status` becomes `^git\b` not `^git\b` after extra
// metacharacter processing.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
