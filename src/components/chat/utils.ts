import type { SessionUIState } from '../../types'

// The states in which the harness holds the turn and more of it is still
// coming. Everything else — the quiet states (idle, awaiting_user, paused),
// the waits that need a human or a clock (awaiting_permission,
// rate_limited), and the terminal ones (completed, error, aborted) — means
// no further assistant output arrives without a fresh action, so whatever
// the last turn looks like in the log, nothing is being produced for it now.
// Those waits have their own surfaces (the permission banner, the status
// chip); a "streaming…" badge during them would say something untrue.
const workingStates = new Set<SessionUIState>([
  'starting',
  'model_generating',
  'tool_running',
  'compacting',
])

export function harnessIsWorkingOnTurn(state: SessionUIState): boolean {
  return workingStates.has(state)
}

// The states in which POST /sessions/{id}/resume will actually be accepted —
// the client-visible proxy for "the server holds no live process for this
// session". handleResumeSession refuses with 409 whenever it still has one
// (llm-bridge-server internal/server/sessions.go, pinned by
// TestResumeSession_AlreadyRunning), so offering Resume anywhere else is
// offering a button that cannot work.
//
// `paused` is deliberately NOT here, and that is the whole point of the set.
// It is now a real server state — the interrupt handler writes it — but that
// changed only where it comes from, not what it means. Interrupt does not end
// the process: Manager.Stop calls proc.Interrupt(), llm-bridge-claudecode
// catches the signal and keeps running, and the process stays registered. So
// a paused session is exactly the session /resume refuses. Keyed on `paused`,
// Resume 409'd every single time it was pressed, and the user read
// "Resume failed: Conflict" as a symptom of the interrupt.
//
// A paused session needs no Resume anyway — its harness is alive and sending
// the next message continues it.
//
// The quiet states stay out for their own reasons: `idle` cannot tell a live
// process between turns from a dead one whose row never caught up,
// `completed` is written by "mark done" without touching the process, and
// `error`/`rate_limited` are mid-life. None of them need Resume anyway —
// /send starts a process when the registry has none, so any dead session
// revives by being sent to. Resume is the way back WITHOUT putting words in
// the session's mouth.
//
// This mirrors RESUMABLE_STATES in chat-core (src/react/hooks.ts), which
// dash's chat page shipped first. When `e1732f61` (SessionPaused on interrupt) is
// decided and the manager starts emitting a real paused state, `paused`
// joins both sets and nothing else changes.
const resumableStates = new Set<SessionUIState>([
  'aborted',
  'disconnected',
])

export function sessionCanBeResumed(state: SessionUIState): boolean {
  return resumableStates.has(state)
}


export function idTail(id: string, n = 10): string {
  return id.length > n ? `…${id.slice(-n)}` : id
}

// Private to flattenToRows since the deleted chat's log views went with it.
function renderValue(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return `${v}`
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export function flattenToRows(obj: Record<string, unknown>, prefix = ''): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  for (const [key, val] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${key}` : key
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      rows.push(...flattenToRows(val as Record<string, unknown>, label))
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const item = val[i]
        if (item != null && typeof item === 'object') {
          rows.push(...flattenToRows(item as Record<string, unknown>, `${label}[${i}]`))
        } else {
          rows.push([`${label}[${i}]`, renderValue(item)])
        }
      }
    } else {
      rows.push([label, renderValue(val)])
    }
  }
  return rows
}
