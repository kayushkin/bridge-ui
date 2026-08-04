import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import { connectSSE, connectSessionListSSE } from './bridgeSSE'
import { createSSEEventBatcher, isDeferrableEventType, type SSEEventBatcher } from './sseEventBatching'
import type {
  BridgeEvent, BudgetHalt, EventData, ManagedSession, SessionUIState, ActivityKind,
  LogRow, LogRowActor, LogRowKind, ToolEvent, CreateSessionRequest, UseBridgeSessionReturn,
  SessionInfo, MessageMeta, HookEvent,
} from './types'
import { ErrCodeBudgetExceeded } from './types'

// --- Event envelope ---
//
// Unified shape for both live SSE events and history-replayed events. History
// events arrive as bare `msg.Event` objects (with `event_id` injected by
// log-store); live events arrive in the SSE BridgeEvent envelope where the
// stored event is under `data` and the SSE `id:` line carries the row id.

function wrapHistoryEvent(ev: EventData): BridgeEvent {
  const id = typeof ev.event_id === 'number' ? String(ev.event_id) : undefined
  return {
    id,
    type: ev.type || 'message',
    data: ev,
  }
}

function eventIdOf(ev: BridgeEvent): number {
  if (typeof ev.data.event_id === 'number') return ev.data.event_id
  if (ev.id) return Number(ev.id) || 0
  return 0
}

// --- Spend ceiling ---

// budgetHaltFromRefusal reads bridge-server's between-turns refusal: a 402
// whose JSON body names the code and both dollar figures, so a client can
// say what happened without a second round trip.
//
// Reports null for everything else, including a 402 that is not a budget
// refusal and a body that does not parse. The caller then falls through to
// its ordinary error path, so a refusal shape this code does not recognise
// still reaches the user as text instead of being swallowed into a banner
// that would describe it wrongly.
function budgetHaltFromRefusal(sessionId: string, status: number, body: string): BudgetHalt | null {
  if (status !== 402) return null
  let parsed: { error?: { code?: string; message?: string; spend_usd?: number; max_budget_usd?: number } }
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  const err = parsed.error
  if (!err || err.code !== ErrCodeBudgetExceeded) return null
  return {
    sessionId,
    message: err.message || 'this session has reached its spend ceiling',
    spendUSD: err.spend_usd,
    maxBudgetUSD: err.max_budget_usd,
  }
}

// --- LogRow reducer ---
//
// Rule: an event only coalesces with an existing row when the group key
// matches. Group key = `${message_id}_${kind}` so different event kinds under
// the same message_id stay as separate rows (a turn's text, thinking, and
// individual tool calls all render as their own rows). Tool calls/results
// pair by `tool_${tool_id}` so a call and its result merge regardless of
// which assistant bubble they appeared in. Events with no group key stand
// alone, keyed by their event_id. Dedup is per-event_id.

function actorFor(eventType: string): LogRowActor {
  switch (eventType) {
    case 'user_message':
      return 'user'
    case 'system':
    case 'session_state':
    case 'session_info':
    case 'api_call':
    case 'api_spend_total':
    case 'usage_total':
    case 'turn_complete':
      return 'system'
    default:
      return 'assistant'
  }
}

function rowKindOf(ev: BridgeEvent): LogRowKind {
  switch (ev.type) {
    case 'user_message': return 'user_message'
    case 'stream': {
      const dt = ev.data.stream?.delta?.type
      if (dt === 'thinking_delta') return 'thinking'
      if (dt === 'text_delta') return 'text'
      return 'stream'
    }
    case 'block': {
      const bt = ev.data.block?.block?.type
      if (bt === 'thinking') return 'thinking'
      if (bt === 'text') return 'text'
      return 'block'
    }
    case 'thinking': return 'thinking'
    case 'tool_call':
    case 'tool_result': return 'tool'
    case 'result': return 'result'
    case 'error': return 'error'
    case 'system': return 'system'
    case 'session_state': return 'session_state'
    case 'session_info': return 'session_info'
    case 'plan': return 'plan'
    case 'approval': return 'approval'
    case 'hook': return 'hook'
    case 'api_call': return 'api_call'
    case 'api_spend_total': return 'api_spend_total'
    case 'usage_total': return 'usage_total'
    case 'turn_complete': return 'turn_complete'
    default: return 'other'
  }
}

function groupKeyFor(ev: BridgeEvent): string | null {
  const kind = rowKindOf(ev)
  // tool_call / tool_result pair by tool_id — independent of which assistant
  // bubble's message_id they arrived under.
  if (kind === 'tool') {
    const toolId = ev.data.tool_call?.tool_id || ev.data.tool_result?.tool_id
    return toolId ? `tool_${toolId}` : null
  }
  // Hook lifecycle events (started → progress → awaiting_resolution → completed)
  // pair by request_id so a single row carries the latest phase + resolution.
  // Hooks without a request_id (most observation hooks) stand alone.
  if (kind === 'hook') {
    const rid = ev.data.hook?.request_id
    return rid ? `hook_${rid}` : null
  }
  const msgId = ev.data.message_id
  if (!msgId) return null
  return `${msgId}_${kind}`
}

function freshRow(ev: BridgeEvent, gKey: string | null): LogRow {
  const msgId = ev.data.message_id
  const evId = eventIdOf(ev)
  return {
    key: gKey || `evt_${evId}`,
    clientId: undefined,
    clientRequestId: ev.data.client_request_id,
    turnId: ev.data.turn_id,
    messageId: msgId,
    harnessMessageId: ev.data.harness_message_id,
    eventIds: [],
    actor: actorFor(ev.type),
    kind: rowKindOf(ev),
    eventType: ev.type,
    subtype: subtypeOf(ev),
    timestamp: ev.data.timestamp || new Date().toISOString(),
    events: [],
  }
}

function subtypeOf(ev: BridgeEvent): string | undefined {
  if (ev.type === 'system') return ev.data.system?.subtype
  if (ev.type === 'thinking') return ev.data.thinking?.subtype
  if (ev.type === 'block') return ev.data.block?.block?.type
  return undefined
}

function applyDelta(row: LogRow, ev: BridgeEvent): LogRow {
  const events = [...row.events, ev.data as unknown as Record<string, unknown>]
  const base: LogRow = { ...row, events }

  switch (ev.type) {
    case 'user_message': {
      return { ...base, text: ev.data.result?.text ?? row.text, done: true }
    }
    case 'stream': {
      const d = ev.data.stream?.delta
      let next = base
      if (d?.type === 'text_delta') next = { ...next, text: (row.text || '') + (d.text || '') }
      else if (d?.type === 'thinking_delta') next = { ...next, thinking: (row.thinking || '') + (d.thinking || '') }
      return next
    }
    case 'block': {
      const b = ev.data.block?.block
      if (!b) return base
      if (b.type === 'text' && b.text_block) {
        return { ...base, text: (row.text || '') + (b.text_block.text || '') }
      }
      if (b.type === 'thinking' && b.thinking_block) {
        return { ...base, thinking: (row.thinking || '') + (b.thinking_block.text || '') }
      }
      return base
    }
    case 'thinking': {
      return { ...base, thinking: (row.thinking || '') + (ev.data.thinking?.text || '') }
    }
    case 'tool_call': {
      const tc = ev.data.tool_call
      if (!tc) return base
      const tools = [...(row.tools || []), { tool_id: tc.tool_id || '', tool: tc.name || '', input: tc.input } satisfies ToolEvent]
      return { ...base, tools }
    }
    case 'tool_result': {
      const tr = ev.data.tool_result
      if (!tr) return base
      const tools = (row.tools || []).slice()
      // Match by tool_id (canonical pairing) and fall back to name for pre-id events.
      let idx = tr.tool_id ? tools.findIndex(t => t.tool_id === tr.tool_id) : -1
      if (idx === -1) {
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].tool === tr.name && !tools[i].output) { idx = i; break }
        }
      }
      if (idx !== -1) {
        tools[idx] = { ...tools[idx], output: tr.output, error: tr.is_error }
      }
      return { ...base, tools }
    }
    case 'result': {
      const result = ev.data.result
      const meta: MessageMeta = { ...(result || {}), rawStats: ev.data as unknown as Record<string, unknown> }
      return {
        ...base,
        text: result?.text || row.text,
        usage: result?.usage ?? row.usage,
        meta: { ...row.meta, ...meta },
        done: true,
      }
    }
    case 'error': {
      return { ...base, errorMessage: ev.data.error?.message || 'error', done: true }
    }
    case 'system': {
      const sys = ev.data.system
      if (!sys) return base
      const { subtype, message, ...rest } = sys
      void subtype
      return {
        ...base,
        toolUseId: sys.tool_use_id || row.toolUseId,
        systemMessage: message,
        systemFields: Object.keys(rest).length > 0 ? rest : undefined,
        done: true,
      }
    }
    case 'session_state': {
      const st = ev.data.state
      if (!st) return base
      return {
        ...base,
        stateTransition: { to: st.state || '', from: st.previous, reason: st.reason },
        done: true,
      }
    }
    case 'session_info': {
      const info = ev.data.info as SessionInfo | undefined
      return { ...base, sessionInfo: info, done: true }
    }
    case 'hook': {
      const hook = ev.data.hook
      if (!hook) return base
      // Coalesce awaiting_resolution → completed under the same row by
      // overwriting hook (later phase wins). 'done' flips on completed so
      // the row collapses out of the active set.
      return {
        ...base,
        hook,
        toolUseId: row.toolUseId,
        done: hook.phase === 'completed',
      }
    }
    case 'api_call': {
      const apiCall = ev.data.api_call
      if (!apiCall) return base
      return { ...base, apiCall, done: true }
    }
    case 'api_spend_total': {
      const apiSpendTotal = ev.data.api_spend_total
      if (!apiSpendTotal) return base
      return { ...base, apiSpendTotal, done: true }
    }
    default:
      return base
  }
}

// Exported for the render checks, which assert that applying a batch of events
// in one pass lands on exactly the rows that applying them one at a time does.
// Nothing outside this module and those checks calls it.
export function applyEventToRows(rows: LogRow[], ev: BridgeEvent): LogRow[] {
  const evId = eventIdOf(ev)
  const gKey = groupKeyFor(ev)

  if (gKey) {
    const idx = rows.findIndex(r => r.key === gKey)
    if (idx === -1) {
      const fresh = freshRow(ev, gKey)
      const updated = applyDelta(fresh, ev)
      updated.eventIds = evId ? [evId] : []
      return [...rows, updated]
    }
    const existing = rows[idx]
    if (evId && existing.eventIds.includes(evId)) return rows
    const updated = applyDelta(existing, ev)
    updated.key = gKey
    updated.eventIds = evId ? [...existing.eventIds, evId] : existing.eventIds
    if (!existing.harnessMessageId && ev.data.harness_message_id) {
      updated.harnessMessageId = ev.data.harness_message_id
    }
    if (!existing.clientRequestId && ev.data.client_request_id) {
      updated.clientRequestId = ev.data.client_request_id
    }
    if (!existing.turnId && ev.data.turn_id) {
      updated.turnId = ev.data.turn_id
    }
    if (!existing.messageId && ev.data.message_id) {
      updated.messageId = ev.data.message_id
    }
    const next = rows.slice()
    next[idx] = updated
    return next
  }

  // Standalone row, keyed by event_id. Dedup against its own eventIds[0].
  if (evId && rows.some(r => r.eventIds[0] === evId)) return rows
  const fresh = freshRow(ev, null)
  const updated = applyDelta(fresh, ev)
  updated.eventIds = evId ? [evId] : []
  return [...rows, updated]
}

// sameActivity reports whether two activity values say the same thing.
//
// The tool name is part of what the indicator shows, so two `tool` activities
// naming different tools are different; every other kind carries no payload and
// is decided by the kind alone. Exported for the render checks.
export function sameActivity(a: ActivityKind, b: ActivityKind): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'tool' && b.kind === 'tool') return a.name === b.name
  return true
}

// --- Debounce helper ---

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = ((...args: unknown[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, ms)
  }) as T & { cancel: () => void }
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null } }
  return debounced
}

// --- Control refusals ---
//
// A control (interrupt, stop, compact) asks the harness to do something and then
// the UI records that it happened: mark the session paused, close the last
// assistant row, drop the activity to idle, put the Compacting chip up. Every one
// of those is a claim about the harness, and none of them is true if the server
// refused the request.
//
// So skipping the status check does not make a control quiet, it makes it lie.
// The refusal is invisible AND the optimistic updates run: the user presses Stop,
// the session says paused, the turn is drawn as finished, and the harness keeps
// streaming into a row the UI has closed. `handleInterrupt` 409s while a tool
// still holds the turn, so this is an everyday answer, not an outage.
//
// chat-core settled the same question for dashv2 and wrote the contract down
// (`src/react/hooks.ts`): `stop()` sets the error and rethrows "rather than
// optimistically marking the session idle — a failed stop must be visible, never
// swallowed into a fake-idle." This is that rule, in the shape this hook uses:
// every caller reads the refusal, shows it, and returns before touching state.
//
// Exported for the render checks — `npm run check` pins the message shape.
export async function controlRefusal(
  res: { ok: boolean; status: number; statusText: string; text(): Promise<string> },
): Promise<string | null> {
  if (res.ok) return null
  // The server's own words first. A 409 from `handleInterrupt` names which tool
  // holds the turn, and that is the difference between an error the user can act
  // on and one that only says "no".
  const body = await res.text().catch(() => '')
  return `${res.status} ${body.trim() || res.statusText || 'request refused'}`
}

// The server's own answer, in the current vocabulary and nothing else: the two
// deprecated values get their modern spelling and everything else passes
// through verbatim.
//
// The server now answers `paused` itself, on the interrupt handler, so there is
// no client-side layer left above this — it is both the state a CONTROL is
// gated on and the state the UI renders. What used to sit on top was a
// localStorage set of interrupted ids recording what the user PRESSED rather
// than what the harness did, which meant a refused interrupt still read as
// paused while the turn ran on.
export function projectServerSessionState(session: ManagedSession): SessionUIState {
  if (session.state === 'running') return 'tool_running'
  if (session.state === 'waiting_on_approval') return 'awaiting_permission'
  return session.state as SessionUIState
}

// shouldHoldSSE reports whether a session state warrants a live SSE
// connection. True for every non-terminal state where the server may push
// events on its own (the agent is working) OR a hook is open and will emit
// a resolution — most importantly awaiting_permission, where the session
// can sit for minutes waiting on a human and the stream is prone to being
// dropped by an idle proxy/backgrounded tab. The legacy `running` /
// `waiting_on_approval` values are kept so sessions on the old vocabulary
// still reconnect. Quiescent states (idle / awaiting_user / paused) and
// terminal states (completed / error / aborted / disconnected) are excluded
// — those emit nothing until a user action (send / resume), which attaches
// the stream itself.
const sseHoldingStates = new Set<string>([
  'starting',
  'model_generating',
  'tool_running',
  'compacting',
  'awaiting_permission',
  'rate_limited',
  'running', // deprecated alias for tool_running
  'waiting_on_approval', // deprecated alias for awaiting_permission
])
function shouldHoldSSE(state: string | undefined): boolean {
  return state != null && sseHoldingStates.has(state)
}

// --- Hook ---

export function useBridgeSession(): UseBridgeSessionReturn {
  const { fetch: fetchFn, basePath } = useBridgeConfig()

  const [sessions, setSessions] = useState<ManagedSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [activity, setActivity] = useState<ActivityKind>({ kind: 'idle' })
  const [compacting, setCompacting] = useState(false)
  // Every stream delta reports the activity it implies, and for a whole model
  // response that is the same value thousands of times over. A fresh object each
  // time is a fresh identity, so React re-rendered every consumer of `activity`
  // for a value that had not changed. Keep the previous object when it says the
  // same thing and React bails out instead.
  const setActivityIfChanged = useCallback((next: ActivityKind) => {
    setActivity(prev => (sameActivity(prev, next) ? prev : next))
  }, [])
  // pendingHooks is keyed by request_id so SSE updates can patch in O(1).
  // Sourced from /hooks/pending on session select; updated by EventHook
  // awaiting_resolution (insert) and completed (delete). Drives the
  // sticky permission banner — without this, "ask" verdicts park the
  // tool call indefinitely with no UI surface.
  const [pendingHooks, setPendingHooks] = useState<Record<string, HookEvent>>({})
  // budgetHalt is the sticky record that the server's spend ceiling stopped
  // this session — see BudgetHalt. It deliberately does not go through
  // setError: the plain error string lives in the Thread pane, which the
  // user can hide, and a halt the user cannot see is a session that looks
  // merely broken. BudgetCeilingBanner renders it alongside the composer
  // instead, with the control that lifts the ceiling.
  const [budgetHalt, setBudgetHalt] = useState<BudgetHalt | null>(null)


  const sseAbort = useRef<AbortController | null>(null)
  // One batcher for the hook's lifetime. It coalesces a frame's stream deltas
  // into a single rows commit; see sseEventBatching.ts for why a frame is the
  // right granularity and why this cannot delay visible text.
  const eventBatcher = useRef<SSEEventBatcher | null>(null)
  if (eventBatcher.current === null) {
    eventBatcher.current = createSSEEventBatcher(events => {
      setLogRows(prev => events.reduce(applyEventToRows, prev))
    })
  }
  const lastEventId = useRef<string | undefined>(undefined)
  const activeSessionRef = useRef<ManagedSession | null>(null)
  const historyLoadId = useRef(0)
  const sessionsRef = useRef<ManagedSession[]>([])
  sessionsRef.current = sessions
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId
  const compactingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearCompacting = useCallback(() => {
    if (compactingTimer.current) {
      clearTimeout(compactingTimer.current)
      compactingTimer.current = null
    }
    setCompacting(false)
  }, [])

  // --- Session refresh (debounced) ---

  const refreshSessionsImpl = useCallback(async () => {
    try {
      const res = await fetchFn(`${basePath}/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
        setConnected(true)
      } else {
        setConnected(false)
      }
    } catch {
      setConnected(false)
    }
  }, [fetchFn, basePath])

  const debouncedRefresh = useMemo(
    () => debounce(refreshSessionsImpl, 500),
    [refreshSessionsImpl],
  )

  const refreshSessions = useCallback(() => {
    debouncedRefresh()
  }, [debouncedRefresh])

  useEffect(() => { refreshSessionsImpl() }, [refreshSessionsImpl])

  // Global session-list SSE subscription. The initial fetch above seeds the
  // list; this stream then patches it in place on every server-side mutation
  // (create / state / rename / folder / delete), so the sidebar stays live
  // without re-fetching `/sessions`. Reconnects with backoff on disconnect.
  useEffect(() => {
    let cancelled = false
    let abort: AbortController | null = null
    let retryDelay = 1000

    const run = async () => {
      while (!cancelled) {
        abort = new AbortController()
        try {
          const stream = connectSessionListSSE(fetchFn, basePath, abort.signal)
          for await (const frame of stream) {
            if (cancelled) return
            if (frame.type === 'hello') {
              retryDelay = 1000
              continue
            }
            if (frame.type === 'upsert') {
              const incoming = frame.session
              setSessions(prev => {
                const i = prev.findIndex(s => s.session_id === incoming.session_id)
                if (i === -1) return [incoming, ...prev]
                const next = prev.slice()
                next[i] = { ...next[i], ...incoming }
                return next
              })
            } else if (frame.type === 'delete') {
              setSessions(prev => prev.filter(s => s.session_id !== frame.session_id))
            }
          }
        } catch {
          if (cancelled || abort?.signal.aborted) return
        }
        if (cancelled) return
        await new Promise(r => setTimeout(r, retryDelay))
        retryDelay = Math.min(retryDelay * 2, 30000)
      }
    }

    run()
    return () => {
      cancelled = true
      abort?.abort()
    }
  }, [fetchFn, basePath])

  // --- Derived state ---

  const activeSession = sessions.find(s => s.session_id === activeSessionId) || null
  activeSessionRef.current = activeSession

  const patchSessionState = useCallback((sessionId: string, state: string) => {
    setSessions(prev => prev.map(s =>
      s.session_id === sessionId ? { ...s, state } : s,
    ))
  }, [])

  const uiState: SessionUIState = useMemo(() => {
    if (!activeSession) return 'empty'
    return projectServerSessionState(activeSession)
  }, [activeSession])

  const getSessionUIState = useCallback(
    (session: ManagedSession): SessionUIState => projectServerSessionState(session),
    [],
  )

  // --- SSE connection ---

  const closeSSE = useCallback(() => {
    if (sseAbort.current) {
      sseAbort.current.abort()
      sseAbort.current = null
    }
    // Commit what the closing stream already delivered — do not drop it. A
    // stream that dies mid-turn is re-attached by the reconnect effect, and that
    // path runs through here: discarding the buffer would lose up to a frame of
    // text the server had already sent. Discarding belongs to a session switch,
    // which says so by calling cancel() itself.
    eventBatcher.current?.flush()
  }, [])

  const startSSE = useCallback((sessionId: string) => {
    closeSSE()
    const abort = new AbortController()
    sseAbort.current = abort

    ;(async () => {
      // Self-healing reconnect loop. The per-session event stream has no retry
      // of its own (connectSSE just returns when the reader ends), and a stream
      // can die two ways: it *errors* (proxy/network reset — surfaces as a
      // throw) or it *ends cleanly* (server closes it, or an idle proxy drops
      // it after a long quiet stretch — the `for await` simply completes with
      // no throw). Neither path used to re-attach: the clean-end path left
      // sseAbort.current pointing at a dead controller, so the reconnect effect
      // (keyed on session-state *changes* and guarded by !sseAbort.current)
      // could never fire. A long-running agent that sits in a holding state
      // waiting on background work (e.g. a slow download) would drop its stream
      // mid-turn and go deaf — its eventual response only surfaced when the
      // next /send re-attached the stream, making it look like the agent reply
      // was gated on a user reply. So: whenever the stream is gone but the
      // session is still in a state where the server may push on its own,
      // reconnect with backoff, resuming from lastEventId so nothing is missed.
      let retryDelay = 1000
      while (!abort.signal.aborted) {
        try {
          const events = connectSSE(fetchFn, basePath, sessionId, lastEventId.current, abort.signal)
          for await (const event of events) {
            if (event.id) lastEventId.current = event.id
            retryDelay = 1000 // healthy stream — reset backoff
            handleSSEEvent(event)
          }
          // Fell out cleanly: server (or a proxy) closed the stream.
        } catch {
          if (abort.signal.aborted) break
          // Errored mid-stream — fall through to the reconnect decision below.
        }
        if (abort.signal.aborted) break
        // Reconnect only while the session still warrants a live stream. Once
        // it's quiescent/terminal the server emits nothing until a user action,
        // which attaches its own stream — so stop and release the controller so
        // the reconnect effect can re-fire when the session next goes active.
        const state = activeSessionRef.current?.session_id === sessionId
          ? activeSessionRef.current?.state
          : undefined
        if (!shouldHoldSSE(state)) {
          setActivityIfChanged({ kind: 'idle' })
          break
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        retryDelay = Math.min(retryDelay * 2, 30000)
      }
      // Only release the ref if a newer startSSE hasn't already replaced it.
      if (sseAbort.current === abort) sseAbort.current = null
    })()

    function handleSSEEvent(event: BridgeEvent) {
      const { type, data } = event
      const sessId = sessionId

      // Deferrable events wait for the next frame; everything else flushes the
      // buffer and is applied in the same commit, so the handlers below see rows
      // carrying every delta that arrived before their event. isDeferrableEventType
      // owns that policy — see sseEventBatching.ts.
      if (isDeferrableEventType(type)) eventBatcher.current!.push(event)
      else eventBatcher.current!.pushAndFlush(event)

      switch (type) {
        case 'stream': {
          if (data.stream?.delta?.type === 'thinking_delta') setActivityIfChanged({ kind: 'thinking' })
          else setActivityIfChanged({ kind: 'streaming' })
          break
        }
        case 'block': {
          if (data.block?.block?.type === 'thinking') setActivityIfChanged({ kind: 'thinking' })
          else setActivityIfChanged({ kind: 'streaming' })
          break
        }
        case 'thinking':
          setActivityIfChanged({ kind: 'thinking' })
          break
        case 'tool_call': {
          setActivityIfChanged({ kind: 'tool', name: data.tool_call?.name || '' })
          break
        }
        case 'tool_result':
          setActivityIfChanged({ kind: 'streaming' })
          break
        case 'result':
          setActivityIfChanged({ kind: 'idle' })
          patchSessionState(sessId, 'completed')
          refreshSessions()
          break
        case 'system': {
          const sys = data.system
          if (sys?.subtype === 'harness_id_set') refreshSessionsImpl()
          else if (sys?.subtype === 'display_name_changed') refreshSessionsImpl()
          else if (sys?.subtype === 'retry') setError(`Retrying (attempt ${sys.attempt}/${sys.max_retries})...`)
          // compact_ack only confirms the request was received — compaction is
          // still in progress, so keep the indicator up. compact_boundary is the
          // real completion signal that clears it.
          else if (sys?.subtype === 'compact_boundary') clearCompacting()
          break
        }
        case 'session_info':
          refreshSessionsImpl()
          break
        case 'error': {
          const message = data.error?.message || 'Stream error'
          // The mid-turn half of the spend gate: bridge-server interrupts
          // the session and announces the breach once, as an error event
          // carrying this code. It is a halt with an escape hatch, not a
          // failure, so it goes to the banner rather than the error line.
          // The event carries no dollar figures — refreshSessions pulls the
          // session row, which does, and the banner reads them from there.
          if (data.error?.code === ErrCodeBudgetExceeded) {
            setBudgetHalt({ sessionId: sessId, message })
            refreshSessions()
          } else {
            setError(message)
          }
          setActivityIfChanged({ kind: 'idle' })
          patchSessionState(sessId, 'error')
          break
        }
        case 'session_state': {
          // `paused` is a settled state like idle and completed: the turn is
          // over. Dropping the activity indicator on it is what stops the
          // spinner after an interrupt, which the client marker used to do.
          const state = data.state?.state
          if (state === 'idle' || state === 'completed' || state === 'paused') {
            setActivityIfChanged({ kind: 'idle' })
          }
          if (state) patchSessionState(sessId, state)
          refreshSessions()
          break
        }
        case 'hook': {
          const hook = data.hook
          if (!hook || !hook.request_id) break
          if (hook.phase === 'awaiting_resolution') {
            setPendingHooks(prev => ({ ...prev, [hook.request_id!]: hook }))
          } else if (hook.phase === 'completed') {
            setPendingHooks(prev => {
              if (!(hook.request_id! in prev)) return prev
              const next = { ...prev }
              delete next[hook.request_id!]
              return next
            })
          }
          break
        }
        case 'close':
          setActivityIfChanged({ kind: 'idle' })
          patchSessionState(sessId, 'completed')
          closeSSE()
          refreshSessions()
          break
      }
    }
  }, [fetchFn, basePath, closeSSE, refreshSessions, refreshSessionsImpl, patchSessionState, clearCompacting])

  // --- History loading ---
  //
  // Fetch raw events from /history (each event JSON has event_id injected by
  // log-store), replay through the reducer to build logRows, and capture the
  // max event_id so SSE reconnect resumes cleanly.

  const loadHistory = useCallback(async (sessionId: string) => {
    const loadId = ++historyLoadId.current
    setLoadingHistory(true)
    try {
      const res = await fetchFn(`${basePath}/sessions/${sessionId}/history`)
      if (!res.ok) {
        setError(`History load failed: ${res.status} ${res.statusText}`)
        return
      }
      const raws: EventData[] = await res.json()

      // Two guards: bail if a newer load started, or if the user has navigated
      // to a different session entirely (so we don't clobber that session's
      // rows with this one's history).
      if (loadId !== historyLoadId.current) return
      if (activeSessionIdRef.current !== sessionId) return

      let rows: LogRow[] = []
      let maxEventId = 0
      for (const raw of raws || []) {
        const ev = wrapHistoryEvent(raw)
        rows = applyEventToRows(rows, ev)
        const id = eventIdOf(ev)
        if (id > maxEventId) maxEventId = id
      }
      // Preserve any optimistic user rows (clientId set) added while this load
      // was in flight and not yet represented in the loaded history — e.g. a
      // message sent immediately after creating a session (the lazily-started
      // new chat does exactly this). Switching sessions clears rows first, so
      // `prev` here only holds rows for the session we just loaded.
      setLogRows(prev => {
        const loadedKeys = new Set(rows.map(r => r.key))
        const optimistic = prev.filter(r => r.clientId && !loadedKeys.has(r.key))
        return optimistic.length ? [...rows, ...optimistic] : rows
      })
      lastEventId.current = maxEventId > 0 ? String(maxEventId) : undefined
    } catch (err) {
      setError(`History load failed: ${err}`)
    } finally {
      if (loadId === historyLoadId.current) setLoadingHistory(false)
    }
  }, [fetchFn, basePath])

  // --- Session selection ---

  const selectSession = useCallback((id: string) => {
    closeSSE()
    setError(null)
    // A halt belongs to the session that hit its ceiling. Carrying it across
    // a switch would put another session's banner over an unrelated chat.
    setBudgetHalt(null)
    setActivityIfChanged({ kind: 'idle' })
    clearCompacting()

    if (!id) {
      setActiveSessionId(null)
      eventBatcher.current?.cancel()
      setLogRows([])
      setPendingHooks({})
      return
    }

    // Only wipe rows when actually switching sessions. A re-select of the
    // current session (e.g. an effect re-firing after a sessions-list refresh)
    // must not blank the screen — loadHistory will atomically replace rows
    // once it resolves.
    const switching = activeSessionIdRef.current !== id
    setActiveSessionId(id)
    activeSessionIdRef.current = id
    if (switching) {
      // Discard, not flush: these events belong to the session being left, and
      // the rows they would land in are about to be another session's.
      eventBatcher.current?.cancel()
      setLogRows([])
      setPendingHooks({})
      lastEventId.current = undefined
    }

    ;(async () => {
      // If this bridge instance hasn't seen the session yet (e.g. it was
      // just created via a *different* useBridgeSession instance), refresh
      // the list so derived state — activeSession, machine, harness info —
      // populates immediately instead of waiting for the next event.
      if (!sessionsRef.current.find(s => s.session_id === id)) {
        await refreshSessionsImpl()
      }
      // The /sessions list omits the heavy `info` blob (harness tools, slash
      // commands, skills, MCP servers) to keep the list small. A live session
      // gets its info back via the session-list SSE upsert, but an idle one
      // that emits no upsert would leave the tools panel and system-prompt
      // modal empty. Hydrate it once on select: GET /sessions/{id} always
      // includes info. omitempty means a missing info won't clobber an
      // existing one, so this is safe to merge.
      if (!sessionsRef.current.find(s => s.session_id === id)?.info) {
        try {
          const res = await fetchFn(`${basePath}/sessions/${id}`)
          if (res.ok && activeSessionIdRef.current === id) {
            const full = await res.json() as ManagedSession
            if (full?.info) {
              setSessions(prev => prev.map(s =>
                s.session_id === id ? { ...s, info: full.info } : s))
            }
          }
        } catch {
          // Non-fatal — panel stays empty until a session_info event arrives.
        }
      }
      await loadHistory(id)
      // Hydrate the sticky-banner state. /hooks/pending returns the
      // awaiting_resolution events that haven't been closed by a matching
      // completed yet — required because Last-Event-ID replay only fires
      // on SSE attach, and the SSE attach below is conditional on the
      // session being in a live (SSE-holding) state.
      try {
        const res = await fetchFn(`${basePath}/sessions/${id}/hooks/pending`)
        if (res.ok && activeSessionIdRef.current === id) {
          const events = await res.json() as Array<{ hook?: HookEvent }>
          const next: Record<string, HookEvent> = {}
          for (const ev of events) {
            const h = ev.hook
            if (h?.request_id && h.phase === 'awaiting_resolution') {
              next[h.request_id] = h
            }
          }
          setPendingHooks(next)
        }
      } catch {
        // Non-fatal — banner just won't pre-populate.
      }
      // Read the latest sessions list at resolution time, not the value
      // captured when this callback was created — the session may have been
      // freshly created and not yet present in the closure snapshot.
      const session = sessionsRef.current.find(s => s.session_id === id)
      if (shouldHoldSSE(session?.state)) {
        startSSE(id)
      }
    })()
  }, [closeSSE, loadHistory, startSSE, refreshSessionsImpl, clearCompacting])

  useEffect(() => {
    if (shouldHoldSSE(activeSession?.state) && !sseAbort.current) {
      startSSE(activeSession!.session_id)
    }
  }, [activeSession?.state, activeSession?.session_id, startSSE])

  // --- Stuck-running reconciler ---
  //
  // A freshly created harness reports state='running' while it boots, then
  // emits a `session_state: idle` event when ready. If that event lands
  // before our SSE attaches (or is otherwise missed), the Composer stays
  // disabled forever — no further state changes can rescue it without a
  // manual refresh. Watchdog: when the active session sits in `running`
  // with no activity, repoll /sessions every 2s for up to ~10s. As soon as
  // the server reports a different state, the deps change and the loop
  // unwinds on its own.
  useEffect(() => {
    if (!activeSessionId) return
    if (activeSession?.state !== 'running') return
    if (activity.kind !== 'idle') return
    let attempts = 0
    const t = window.setInterval(() => {
      attempts++
      refreshSessionsImpl()
      if (attempts >= 5) window.clearInterval(t)
    }, 2000)
    return () => window.clearInterval(t)
  }, [activeSessionId, activeSession?.state, activity.kind, refreshSessionsImpl])

  // --- Visibility change reconnection ---

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeSessionId) {
        // A backgrounded tab has its SSE fetch suspended by the browser, so a
        // stream that finished (or was interrupted) while hidden leaves a stale
        // in-progress row and a dead-but-non-null sseAbort. refreshSessionsImpl
        // alone only updates the sessions list, never the log rows — that's why
        // refocus looked broken while session-switching worked. Re-run the full
        // reconcile that a switch does: force-close the dead SSE, reload history
        // (renders the now-complete message), and re-attach only if the server
        // still reports running.
        selectSession(activeSessionId)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeSessionId, selectSession])

  // --- Actions ---

  // Type / purpose / origin are required on the wire but the frontend
  // defaults them so call sites don't have to know about classification.
  // Callers can override by providing any of the three explicitly.
  // attachTokens caches the per-session pty attach token returned by
  // POST /sessions and POST /sessions/{id}/mode responses. Keyed by
  // bridge id. The server doesn't expose a refresh endpoint — a hub's
  // token only exists in memory alongside its pty — so this map is the
  // only place bridge-ui can retrieve a usable token. Sessions not
  // created/switched in this browser tab won't have an entry; the UI
  // exposes a mode-switch action that mints a fresh one.
  const [attachTokens, setAttachTokens] = useState<Record<string, string>>({})

  const createSession = useCallback(async (opts: Partial<CreateSessionRequest> & Pick<CreateSessionRequest, 'harness'>): Promise<ManagedSession | null> => {
    try {
      const body: CreateSessionRequest = {
        type: 'interactive',
        purpose: 'chat',
        origin: 'frontend',
        ...opts,
      } as CreateSessionRequest
      const res = await fetchFn(`${basePath}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError(`Failed to create session: ${res.statusText}`)
        return null
      }
      // POST /sessions returns ManagedSession with an optional
      // attach_token sibling for pty sessions — keep the token in state
      // so the BridgeAttach component can dial /attach without a second
      // round-trip. Empty for events-mode sessions.
      const sessWithToken = await res.json() as ManagedSession & { attach_token?: string }
      const sess: ManagedSession = sessWithToken
      if (sessWithToken.attach_token) {
        setAttachTokens(prev => ({ ...prev, [sess.session_id]: sessWithToken.attach_token! }))
      }
      await refreshSessionsImpl()
      selectSession(sess.session_id)
      return sess
    } catch (err) {
      setError(`Failed to create session: ${err}`)
      return null
    }
  }, [fetchFn, basePath, refreshSessionsImpl, selectSession])

  // refreshAttachToken fetches the per-hub attach token from
  // GET /sessions/{id}/attach-token. Called by AttachLeaf on mount when
  // there's no cached token (typically after a page refresh wiped the
  // in-memory map). Returns the token, or null when the server has no
  // live hub for this session — the UI then prompts the user to flip
  // mode to mint one.
  const refreshAttachToken = useCallback(async (sessionId: string): Promise<string | null> => {
    try {
      const res = await fetchFn(`${basePath}/sessions/${sessionId}/attach-token`)
      if (!res.ok) return null
      const body = await res.json() as { attach_token?: string }
      const token = body.attach_token ?? ''
      if (token) {
        setAttachTokens(prev => ({ ...prev, [sessionId]: token }))
        return token
      }
      return null
    } catch {
      return null
    }
  }, [fetchFn, basePath])

  // switchMode flips a live session between events and pty modes. The
  // server kills the current harness process and respawns in the new
  // mode using --resume, so the user's CC history is preserved across
  // the swap. Returns the new attach token on a successful pty switch
  // (cached in attachTokens automatically); returns null on any
  // failure or for events-mode switches.
  const switchMode = useCallback(async (sessionId: string, mode: 'events' | 'pty'): Promise<string | null> => {
    try {
      const res = await fetchFn(`${basePath}/sessions/${sessionId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) {
        const halt = budgetHaltFromRefusal(sessionId, res.status, await res.text())
        if (halt) {
          setBudgetHalt(halt)
          return null
        }
        setError(`Failed to switch mode: ${res.statusText}`)
        return null
      }
      const sessWithToken = await res.json() as ManagedSession & { attach_token?: string }
      if (sessWithToken.attach_token) {
        setAttachTokens(prev => ({ ...prev, [sessionId]: sessWithToken.attach_token! }))
      } else if (mode === 'events') {
        // Events-mode session has no live pty, so the cached token is
        // unusable. Drop it to keep the map honest.
        setAttachTokens(prev => {
          if (!(sessionId in prev)) return prev
          const next = { ...prev }
          delete next[sessionId]
          return next
        })
      }
      await refreshSessionsImpl()
      return sessWithToken.attach_token ?? null
    } catch (err) {
      setError(`Failed to switch mode: ${err}`)
      return null
    }
  }, [fetchFn, basePath, refreshSessionsImpl])

  // explicitSessionId lets a caller send to a session it just created,
  // before the activeSessionId state has re-rendered into this closure —
  // the lazily-started "pending" new chat relies on this. Defaults to the
  // active session.
  const send = useCallback(async (text: string, explicitSessionId?: string) => {
    const targetSessionId = explicitSessionId || activeSessionId
    if (!targetSessionId || !text.trim()) return

    // Optimistic user row keyed by clientId. When /send returns with the
    // canonical bridge MessageID we patch the row's key to the grouping key
    // (`${messageId}_user_message`) so the user_message SSE event coalesces
    // into the same row.
    const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const optimistic: LogRow = {
      key: clientId,
      clientId,
      eventIds: [],
      actor: 'user',
      kind: 'user_message',
      eventType: 'user_message',
      timestamp: new Date().toISOString(),
      text,
      events: [],
      done: true,
    }
    setLogRows(prev => [...prev, optimistic])
    setError(null)

    try {
      const res = await fetchFn(`${basePath}/sessions/${targetSessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!res.ok) {
        const err = await res.text()
        const halt = budgetHaltFromRefusal(targetSessionId, res.status, err)
        if (halt) {
          setBudgetHalt(halt)
          return
        }
        setError(`Send failed: ${err}`)
        return
      }
      const body = await res.json().catch(() => ({})) as { message_id?: string }
      if (body.message_id) {
        const newKey = `${body.message_id}_user_message`
        setLogRows(prev => prev.map(r =>
          r.clientId === clientId ? { ...r, messageId: body.message_id, key: newKey } : r,
        ))
      }

      lastEventId.current = undefined
      startSSE(targetSessionId)
      refreshSessions()
    } catch (err) {
      setError(`Send failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions])

  const markLastAssistantDone = useCallback(() => {
    setLogRows(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].actor === 'assistant' && !prev[i].done) {
          const next = prev.slice()
          next[i] = { ...next[i], done: true }
          return next
        }
      }
      return prev
    })
  }, [])

  const interrupt = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/interrupt`, { method: 'POST' })
      const refusal = await controlRefusal(res)
      if (refusal) {
        // Nothing below runs. The three lines that follow all assert the turn
        // stopped, and it did not — `turnRunning` reads the server's state, so
        // the Stop button stays where it is and the user can press it again.
        setError(`Interrupt failed: ${refusal}`)
        return
      }
      markLastAssistantDone()
      setActivityIfChanged({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Interrupt failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, refreshSessions, markLastAssistantDone])

  const resume = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/resume`, { method: 'POST' })
      if (!res.ok) {
        const halt = budgetHaltFromRefusal(activeSessionId, res.status, await res.text())
        if (halt) {
          setBudgetHalt(halt)
          return
        }
        setError(`Resume failed: ${res.statusText}`)
        return
      }
      startSSE(activeSessionId)
      refreshSessions()
    } catch (err) {
      setError(`Resume failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions])

  const stopSession = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/stop`, { method: 'POST' })
      const refusal = await controlRefusal(res)
      if (refusal) {
        // `closeSSE()` is the one that hurts here: a refused stop that still tore
        // the stream down would leave the UI blind to a session that is very much
        // still running, and nothing would reopen it.
        setError(`Stop failed: ${refusal}`)
        return
      }
      closeSSE()
      markLastAssistantDone()
      setActivityIfChanged({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Stop failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, closeSSE, refreshSessions, markLastAssistantDone])

  const compact = useCallback(async (summary?: string) => {
    if (!activeSessionId) return
    setCompacting(true)
    if (compactingTimer.current) clearTimeout(compactingTimer.current)
    // Safety net: clear the indicator if no compact_boundary arrives. Compacting
    // a large context can take a while, so give it a generous window — the
    // boundary event normally clears it well before this fires.
    compactingTimer.current = setTimeout(() => {
      compactingTimer.current = null
      setCompacting(false)
    }, 180000)
    try {
      const body: Record<string, string> = {}
      if (summary) body.summary = summary
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/compact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const refusal = await controlRefusal(res)
      if (refusal) {
        // The indicator's only other exit is a `compact_boundary` event, which a
        // compaction that never started will never send. Leaving it up parks
        // "Compacting" on screen for the whole three-minute safety net.
        setError(`Compact failed: ${refusal}`)
        clearCompacting()
      }
    } catch (err) {
      setError(`Compact failed: ${err}`)
      clearCompacting()
    }
  }, [fetchFn, basePath, activeSessionId, clearCompacting])

  const forkSession = useCallback(async (displayName?: string) => {
    if (!activeSessionId) return
    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName || '',
          type: 'interactive',
        }),
      })
      if (!res.ok) {
        setError(`Fork failed: ${res.statusText}`)
        return
      }
      const forked: ManagedSession = await res.json()
      await refreshSessionsImpl()
      selectSession(forked.session_id)
    } catch (err) {
      setError(`Fork failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, refreshSessionsImpl, selectSession])

  const renameSession = useCallback(async (bridgeID: string, displayName: string) => {
    const res = await fetchFn(`${basePath}/sessions/${bridgeID}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    })
    if (!res.ok) {
      setError(`Rename failed: ${res.statusText}`)
      return
    }
    await refreshSessionsImpl()
  }, [fetchFn, basePath, refreshSessionsImpl])

  // postConfig is the shared body of sendConfig and raiseBudgetCeiling.
  // Reports the server's refusal text, or null when the config was applied.
  //
  // The refusal used to be dropped on the floor: the response was awaited
  // and never examined, so a rejected max_budget, a 404 on a deleted
  // session and a successful change were indistinguishable to the caller.
  // That is tolerable for a preference the user can see did not take; it is
  // not tolerable for the control that lifts a spend halt, where silence
  // reads as "raised" and the very next send is refused again.
  const postConfig = useCallback(async (
    config: { model?: string; effort?: string; disabled_tools?: string[]; max_budget?: number },
    sessionId: string,
  ): Promise<string | null> => {
    try {
      const res = await fetchFn(`${basePath}/sessions/${sessionId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const body = (await res.text()).trim()
        return body || res.statusText || `HTTP ${res.status}`
      }
      return null
    } catch (err) {
      return String(err)
    }
  }, [fetchFn, basePath])

  const sendConfig = useCallback(async (config: { model?: string; effort?: string; disabled_tools?: string[]; max_budget?: number }, explicitSessionId?: string) => {
    const targetSessionId = explicitSessionId || activeSessionId
    if (!targetSessionId) return
    const failure = await postConfig(config, targetSessionId)
    if (failure) {
      setError(`Config update failed: ${failure}`)
      return
    }
    refreshSessions()
  }, [postConfig, activeSessionId, refreshSessions])

  // raiseBudgetCeiling is the escape hatch out of a spend halt. The ceiling
  // is server state, so bridge-server persists it and only forwards to the
  // harness when one is still running — which, after a halt, it is not.
  //
  // The halt is cleared only once the server has confirmed the new ceiling.
  // Clearing it optimistically would hide the banner while the session was
  // still capped, and the next send would be refused with no visible cause.
  const raiseBudgetCeiling = useCallback(async (maxBudgetUSD: number, explicitSessionId?: string): Promise<string | null> => {
    const targetSessionId = explicitSessionId || activeSessionId
    if (!targetSessionId) return 'no active session'
    const failure = await postConfig({ max_budget: maxBudgetUSD }, targetSessionId)
    if (failure) return failure
    setBudgetHalt(prev => (prev && prev.sessionId === targetSessionId ? null : prev))
    refreshSessions()
    return null
  }, [postConfig, activeSessionId, refreshSessions])

  const resolveHook = useCallback(async (input: {
    requestId: string
    behavior: 'allow' | 'deny'
    updatedInput?: unknown
    message?: string
    resolvedBy?: string
  }) => {
    if (!activeSessionId) {
      setError('resolve hook: no active session')
      return
    }
    if (!input.requestId) {
      setError('resolve hook: request_id required')
      return
    }
    // Optimistic clear — the matching phase=completed SSE event will
    // arrive shortly and is idempotent with this map update.
    setPendingHooks(prev => {
      if (!(input.requestId in prev)) return prev
      const next = { ...prev }
      delete next[input.requestId]
      return next
    })
    try {
      const body: Record<string, unknown> = {
        behavior: input.behavior,
        resolved_by: input.resolvedBy || 'user',
      }
      if (input.updatedInput !== undefined) body.updated_input = input.updatedInput
      if (input.message) body.message = input.message
      const res = await fetchFn(
        `${basePath}/sessions/${activeSessionId}/hooks/${encodeURIComponent(input.requestId)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const errText = await res.text()
        setError(`Resolve hook failed: ${errText}`)
      }
    } catch (err) {
      setError(`Resolve hook failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId])

  const pendingHooksList = useMemo<HookEvent[]>(
    () => Object.values(pendingHooks),
    [pendingHooks],
  )

  useEffect(() => () => {
    closeSSE()
    debouncedRefresh.cancel()
    if (compactingTimer.current) clearTimeout(compactingTimer.current)
  }, [closeSSE, debouncedRefresh])

  return useMemo(() => ({
    sessions,
    activeSession,
    logRows,
    uiState,
    getSessionUIState,
    activity,
    connected,
    compacting,
    error,
    loadingHistory,
    createSession,
    selectSession,
    send,
    interrupt,
    resume,
    stop: stopSession,
    compact,
    fork: forkSession,
    renameSession,
    sendConfig,
    refreshSessions,
    budgetHalt,
    raiseBudgetCeiling,
    pendingHooks: pendingHooksList,
    resolveHook,
    attachTokens,
    switchMode,
    refreshAttachToken,
  }), [
    sessions,
    activeSession,
    logRows,
    uiState,
    getSessionUIState,
    activity,
    connected,
    compacting,
    error,
    loadingHistory,
    createSession,
    selectSession,
    send,
    interrupt,
    resume,
    stopSession,
    compact,
    forkSession,
    renameSession,
    sendConfig,
    refreshSessions,
    budgetHalt,
    raiseBudgetCeiling,
    pendingHooksList,
    resolveHook,
    attachTokens,
    switchMode,
    refreshAttachToken,
  ])
}
