import { useState, useCallback } from 'react'
import { useBridgeConfig } from '../../context'
import { HookSourceUserInput, type HookEvent } from '../../types'
import { useWorkspace } from './WorkspaceContext'

// PendingPermissionsBanner is the sticky surface for awaiting_resolution
// HookEvents parked by bridge-server's PreToolUse hook. Renders nothing
// when there are no pending hooks.
//
// Card flavor is picked by HookEvent.source:
//   - "user_input" (HookSourceUserInput): the model is asking the human a
//     structured question (e.g. CC's AskUserQuestion). Renders
//     AskUserQuestionCard — option groups whose selections post back via
//     updatedInput, so the model receives the answer directly.
//   - "permission_prompt" (default for tool-gating asks): renders
//     PendingHookCard — generic allow/deny + always-rule surface.
export function PendingPermissionsBanner() {
  const ws = useWorkspace()
  const { fetch: apiFetch, basePath } = useBridgeConfig()

  if (ws.pendingHooks.length === 0) return null

  // permission-store sibling path: /api/bridge → /api/permission-store
  const permStoreBase = basePath.replace(/\/[^/]+$/, '/permission-store')

  return (
    <div className="bc-pending-banner" role="region" aria-label="Pending permission prompts">
      {ws.pendingHooks.map(hook => {
        const key = hook.request_id || `nokey-${hook.event}`
        if (hook.source === HookSourceUserInput && isAskUserQuestionInput(hook.input)) {
          return (
            <AskUserQuestionCard
              key={key}
              hook={hook}
              onResolve={ws.resolveHook}
            />
          )
        }
        return (
          <PendingHookCard
            key={key}
            hook={hook}
            onResolve={ws.resolveHook}
            apiFetch={apiFetch}
            permStoreBase={permStoreBase}
          />
        )
      })}
    </div>
  )
}

interface AskUserQuestionOption {
  label: string
  description?: string
  preview?: string
}
interface AskUserQuestionQuestion {
  question: string
  header: string
  options: AskUserQuestionOption[]
  multiSelect?: boolean
}
interface AskUserQuestionInput {
  questions: AskUserQuestionQuestion[]
}

function isAskUserQuestionInput(input: unknown): input is AskUserQuestionInput {
  if (!input || typeof input !== 'object') return false
  const qs = (input as { questions?: unknown }).questions
  return Array.isArray(qs) && qs.length > 0 && qs.every(q =>
    q && typeof q === 'object'
    && typeof (q as { question?: unknown }).question === 'string'
    && Array.isArray((q as { options?: unknown }).options),
  )
}

function AskUserQuestionCard({
  hook,
  onResolve,
}: {
  hook: HookEvent
  onResolve: ReturnType<typeof useWorkspace>['resolveHook']
}) {
  const input = hook.input as unknown as AskUserQuestionInput
  const questions = input.questions
  const requestId = hook.request_id || ''

  // Per-question selection state: index map -> set of selected option indices.
  // Set is sized 1 for single-select questions, N for multiSelect.
  const [selections, setSelections] = useState<Map<number, Set<number>>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allAnswered = questions.every((_, i) => {
    const s = selections.get(i)
    return s && s.size > 0
  })

  const toggle = useCallback((qi: number, oi: number, multi: boolean) => {
    setSelections(prev => {
      const next = new Map(prev)
      const current = next.get(qi) ?? new Set<number>()
      if (multi) {
        const updated = new Set(current)
        if (updated.has(oi)) updated.delete(oi)
        else updated.add(oi)
        next.set(qi, updated)
      } else {
        next.set(qi, new Set([oi]))
      }
      return next
    })
  }, [])

  const submit = useCallback(async () => {
    if (!requestId || !allAnswered || busy) return
    setBusy(true)
    setError(null)
    try {
      // Build {questionText: answerLabel}. CC's AskUserQuestion accepts a
      // comma-separated string for multiSelect answers (per its input schema:
      // E.preprocess that joins string arrays into a comma list).
      const answers: Record<string, string> = {}
      questions.forEach((q, qi) => {
        const chosen = Array.from(selections.get(qi) ?? new Set<number>())
          .map(oi => q.options[oi]?.label)
          .filter((label): label is string => Boolean(label))
        answers[q.question] = chosen.join(', ')
      })
      await onResolve({
        requestId,
        behavior: 'allow',
        // Send the full original questions array alongside answers so CC's
        // tool.call() can pair them up; the hook's updatedInput replaces the
        // tool input wholesale.
        updatedInput: { questions, answers },
        resolvedBy: 'user',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [requestId, allAnswered, busy, questions, selections, onResolve])

  const decline = useCallback(async () => {
    if (!requestId || busy) return
    setBusy(true)
    setError(null)
    try {
      // Deny surfaces CC's "User declined to answer questions" branch.
      await onResolve({ requestId, behavior: 'deny', resolvedBy: 'user' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [requestId, busy, onResolve])

  return (
    <div className="bc-pending-card bc-ask-card">
      <div className="bc-pending-card-header">
        <strong className="bc-pending-tool">AskUserQuestion</strong>
        <span className="bc-pending-event">awaiting your answer</span>
      </div>
      <div className="bc-ask-questions">
        {questions.map((q, qi) => {
          const selected = selections.get(qi) ?? new Set<number>()
          const multi = Boolean(q.multiSelect)
          return (
            <fieldset key={qi} className="bc-ask-question">
              {q.header && <legend className="bc-ask-header">{q.header}</legend>}
              <p className="bc-ask-question-text">{q.question}</p>
              <div className="bc-ask-options">
                {q.options.map((opt, oi) => {
                  const isSelected = selected.has(oi)
                  return (
                    <label
                      key={oi}
                      className={`bc-ask-option${isSelected ? ' bc-ask-option-selected' : ''}`}
                    >
                      <input
                        type={multi ? 'checkbox' : 'radio'}
                        name={`bc-ask-${requestId}-${qi}`}
                        checked={isSelected}
                        disabled={busy}
                        onChange={() => toggle(qi, oi, multi)}
                      />
                      <span className="bc-ask-option-body">
                        <span className="bc-ask-option-label">{opt.label}</span>
                        {opt.description && (
                          <span className="bc-ask-option-desc">{opt.description}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )
        })}
      </div>
      <div className="bc-pending-actions">
        <button
          type="button"
          className="bc-pending-allow"
          disabled={busy || !allAnswered}
          onClick={submit}
        >
          Submit
        </button>
        <button
          type="button"
          className="bc-pending-deny"
          disabled={busy}
          onClick={decline}
        >
          Decline
        </button>
      </div>
      {error && <p className="bc-pending-error">{error}</p>}
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
