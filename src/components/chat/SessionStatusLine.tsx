import { useEffect, useRef, useState } from 'react'
import {
  useConnState,
  useLiveStatus,
  type LiveStatus,
  type LiveSubagent,
} from '@kayushkin/chat-core'
import { formatHMS } from './bridgeAdapters'
import styles from './Chat.module.css'

// The turns pane's ONE status slot: a fixed-height line under the scroller that
// renders whichever session status is current. Before this existed, four separate
// things popped in and out of the layout between the transcript and the composer —
// the live-activity strip (which also grew a row per subagent), the compacting
// strip, the composer's paused/stopped row, and its error row — and every toggle
// shifted the text the user was reading. Now there is one slot, one height, one
// visual language; only its content swaps.
//
// Subagent detail did not fit a fixed line, so it moved into a popover behind an
// inline "⑂ N agents" chip — one row per subagent, with its promoted-session link.
//
// The slot's visibility is decided by `useSessionStatus` and rendered by the parent
// (TurnList), which also holds the empty spacer that keeps the transcript from
// shifting when the slot empties at end of turn.

/** The slice of Chat's one `useComposer` instance the status slot renders.
 *  `error` is hook-local state, which is why this arrives as a prop rather than
 *  from a second hook call that would never see it. */
export interface ComposerStatus {
  paused: boolean
  resumable: boolean
  error: string | null
  /** Which action `error` describes, for phrasing — set by the Composer's handlers. */
  failedAction: 'stop' | 'resume' | null
}

/** What the slot shows, in priority order — each kind replaces everything below it.
 *  null = nothing to say (the slot disappears, its spacer may linger). */
export type SessionStatus =
  | { kind: 'error'; text: string }
  | { kind: 'disconnected'; text: string }
  | { kind: 'stopped' }
  | { kind: 'paused' }
  | { kind: 'compacting' }
  | { kind: 'live'; live: LiveStatus }
  | null

/**
 * Decide the slot's current content. Priority: an action failure outranks
 * everything (the user just clicked something that refused); a dead stream
 * outranks session facts (nothing below it can be trusted live); stopped/paused
 * outrank compacting/live because they are mutually exclusive with a running
 * turn; live activity keeps the chat-core rule — never gated on session state
 * alone, a non-idle activity is itself evidence of work.
 */
export function useSessionStatus(
  sessionId: string | null,
  streaming: boolean,
  compacting: boolean,
  composerStatus: ComposerStatus,
): SessionStatus {
  const live = useLiveStatus(sessionId)
  const connState = useConnState()
  if (composerStatus.error) {
    const prefix =
      composerStatus.failedAction === 'stop'
        ? "couldn't stop — still running: "
        : composerStatus.failedAction === 'resume'
          ? "couldn't resume — still stopped: "
          : ''
    return { kind: 'error', text: `${prefix}${composerStatus.error}` }
  }
  // 'open' is the only state in which updates are actually flowing (the Composer's
  // own send gate uses the same test).
  if (connState !== 'open') {
    return {
      kind: 'disconnected',
      text:
        connState === 'closed'
          ? 'disconnected — nothing can be sent'
          : 'connecting — nothing can be sent yet',
    }
  }
  if (composerStatus.resumable) return { kind: 'stopped' }
  if (composerStatus.paused) return { kind: 'paused' }
  if (compacting) return { kind: 'compacting' }
  if (streaming || live.activity.kind !== 'idle') return { kind: 'live', live }
  return null
}

/** Compact elapsed readout since an RFC3339 timestamp: `42s`, `3m 07s`, `1h 12m`. */
function formatElapsed(sinceTs: string, nowMs: number): string {
  const startedMs = Date.parse(sinceTs)
  if (Number.isNaN(startedMs)) return ''
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/** The live row's text: the newest in-flight call when the model has one (name +
 *  input summary, with a count when calls run in parallel), else the activity word.
 *  "responding" rather than chat-core's "streaming" — the reader is a person
 *  watching a chat, not the SSE plumbing. */
function mainActivityText(live: LiveStatus): string {
  const newest = live.toolCalls[live.toolCalls.length - 1]
  if (newest) {
    const name = newest.name || 'tool'
    const extra = live.toolCalls.length > 1 ? `  (+${live.toolCalls.length - 1} more)` : ''
    return `${name}${newest.summary ? ` — ${newest.summary}` : ''}${extra}`
  }
  switch (live.activity.kind) {
    case 'thinking':
      return 'thinking'
    case 'streaming':
      return 'responding'
    case 'tool':
      // The activity names a tool but the model has no pairable in-flight entry
      // (an OTel-derived stand-in, or the entry not folded yet) — the name is
      // still the truest thing on hand.
      return live.activity.name || 'tool'
    default:
      // Busy per the server state, nothing heard on the stream yet.
      return 'working'
  }
}

/** What kind of worker a task row is: the agent role when reported, else an honest
 *  generic — a backgrounded shell is not an agent and must not read as one. */
function subagentKindLabel(task: LiveSubagent): string {
  if (task.subagentType) return task.subagentType
  return task.taskType === 'local_bash' ? 'background shell' : 'subagent'
}

interface SessionStatusLineProps {
  /** The decided status. Never null — the parent renders nothing (or the spacer)
   *  instead of this component when there is nothing to say. */
  status: NonNullable<SessionStatus>
  /** Opens a subagent's promoted session — TurnList's `select`. */
  onOpenSession: (sessionId: string) => void
}

/**
 * The `⑂ N agents` chip and the popover behind it: one row per running subagent,
 * with its kind, description, last tool, elapsed, and a link to its own promoted
 * session.
 *
 * Extracted from the status line because the status line is mounted inside the
 * TURNS pane alone (`TurnList.tsx`), so hiding that pane took the only view of a
 * session's running subagents with it. The Timeline pane mounts this too.
 *
 * ⚠️ Pure — it takes the subagents rather than subscribing for them. `useLiveStatus`
 * subscribes to `s.sessions` as well as the turn model, so a component that calls it
 * re-renders on every sidebar poll; keeping that subscription in a thin leaf beside
 * this chip is what stops a whole pane from doing so.
 */
export function SubagentsChip({
  subagents,
  onOpenSession,
}: {
  subagents: readonly LiveSubagent[]
  onOpenSession: (sessionId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // The clock ticks only while the popover is OPEN, not merely while the turn is
  // live. The elapsed readouts it drives are inside the popover and are the only
  // thing on screen that changes per second; a closed popover re-rendering once a
  // second is a whole component tree's worth of work to update nothing visible.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    setNowMs(Date.now())
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // A popover left open for a fleet that has since finished would show stale rows.
  const count = subagents.length
  useEffect(() => {
    if (count === 0) setOpen(false)
  }, [count])

  if (count === 0) return null

  return (
    <div ref={rootRef} className={styles.subagentsAnchor}>
      <button
        className={styles.statusAgentsChip}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Running subagents"
      >
        ⑂ {count} {count === 1 ? 'agent' : 'agents'}
      </button>
      {open && (
        <div className={styles.statusPopover}>
          {subagents.map((task) => (
            <div key={task.taskId} className={styles.statusAgentRow}>
              <span className={styles.statusAgentKind}>{subagentKindLabel(task)}</span>
              {task.description && (
                <span className={styles.statusText} title={task.description}>
                  — {task.description}
                </span>
              )}
              {task.lastToolName && (
                <span className={styles.statusAgentTool}>· {task.lastToolName}</span>
              )}
              <span className={styles.statusTime}>
                {formatHMS(task.startedAt)} · {formatElapsed(task.startedAt, nowMs)}
              </span>
              {task.sessionId && (
                <button
                  className={styles.statusOpen}
                  onClick={() => onOpenSession(task.sessionId!)}
                  title={`Open subagent session ${task.sessionId}`}
                >
                  open ↗
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SessionStatusLine({ status, onOpenSession }: SessionStatusLineProps) {
  // One shared 1s clock for the elapsed readouts, ticking only while the live row
  // is what's shown — no other kind renders a clock.
  const isLive = status.kind === 'live'
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!isLive) return
    setNowMs(Date.now())
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isLive])

  // The subagent chip and its popover own their own open state and clock now;
  // see SubagentsChip above, which the Timeline pane mounts as well.

  return (
    <div className={styles.statusSlot} role="status" aria-live="polite">
      {status.kind === 'error' && (
        <span className={`${styles.statusText} ${styles.statusError}`} title={status.text}>
          ✗ {status.text}
        </span>
      )}
      {status.kind === 'disconnected' && (
        <span className={`${styles.statusText} ${styles.statusWarn}`}>{status.text}</span>
      )}
      {status.kind === 'stopped' && (
        <span className={styles.statusText}>⏸ stopped — its harness process is gone</span>
      )}
      {status.kind === 'paused' && <span className={styles.statusText}>⏸ paused</span>}
      {status.kind === 'compacting' && (
        <>
          <span className={`${styles.statusPulse} ${styles.statusPulseViolet}`} aria-hidden />
          <span className={styles.statusCompacting}>Compacting context…</span>
        </>
      )}
      {status.kind === 'live' && (
        <>
          <span className={styles.statusPulse} aria-hidden />
          {status.live.todo && (
            <>
              <span className={styles.statusTodo} title={status.live.todo.text}>
                {status.live.todo.text}
              </span>
              <span className={styles.statusSep} aria-hidden>
                ·
              </span>
            </>
          )}
          <span className={styles.statusText} title={mainActivityText(status.live)}>
            {mainActivityText(status.live)}
          </span>
          <SubagentsChip subagents={status.live.subagents} onOpenSession={onOpenSession} />
          {status.live.startedAt && (
            <span className={styles.statusTime}>
              {formatHMS(status.live.startedAt)} · {formatElapsed(status.live.startedAt, nowMs)}
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** The empty spacer TurnList renders while lingering after the slot empties: the
 *  same box as the slot with no content and a transparent border, so the transcript
 *  holds its position until the user scrolls. Exported from here so the slot and
 *  its stand-in can never drift apart in height. */
export const STATUS_SPACER_CLASSNAME = `${styles.statusSlot} ${styles.statusSpacer}`
