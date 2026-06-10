import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import { connectSSE, connectSessionListSSE } from './bridgeSSE'
import type {
  BridgeEvent, EventData, ManagedSession, SessionUIState, ActivityKind,
  LogRow, LogRowActor, LogRowKind, ToolEvent, CreateSessionRequest, UseBridgeSessionReturn,
  SessionInfo, MessageMeta, HookEvent,
} from './types'

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

function applyEventToRows(rows: LogRow[], ev: BridgeEvent): LogRow[] {
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

// --- Interrupted-session persistence ---
//
// `paused` is a frontend-only refinement of the canonical `idle` state — it
// means "the user interrupted this session's last turn." We persist the set
// of interrupted bridge_ids in localStorage so the marker survives reloads
// and tab switches, and so the sidebar can show a paused dot for any session
// (not just the active one).

const INTERRUPTED_KEY = 'bridge-ui-interrupted-sessions'

function loadInterruptedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(INTERRUPTED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch { return new Set() }
}

function saveInterruptedIds(s: Set<string>) {
  try { localStorage.setItem(INTERRUPTED_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
}

function deriveSessionUIState(session: ManagedSession, interrupted: Set<string>): SessionUIState {
  // Local interrupt override: until manager-side SessionPaused emission
  // lands, the only signal that the user hit the pause button is the
  // client-side interrupted Set. Honor it for any non-terminal state.
  if (interrupted.has(session.session_id)) {
    const s = session.state
    if (s === 'idle' || s === 'tool_running' || s === 'model_generating' || s === 'running') {
      return 'paused'
    }
  }
  // Map deprecated values written by sessions on the old vocabulary.
  if (session.state === 'running') return 'tool_running'
  if (session.state === 'waiting_on_approval') return 'awaiting_permission'
  // Pass through every other value verbatim — server is authoritative.
  return session.state as SessionUIState
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
  const [interruptedIds, setInterruptedIds] = useState<Set<string>>(loadInterruptedIds)
  // pendingHooks is keyed by request_id so SSE updates can patch in O(1).
  // Sourced from /hooks/pending on session select; updated by EventHook
  // awaiting_resolution (insert) and completed (delete). Drives the
  // sticky permission banner — without this, "ask" verdicts park the
  // tool call indefinitely with no UI surface.
  const [pendingHooks, setPendingHooks] = useState<Record<string, HookEvent>>({})


  const sseAbort = useRef<AbortController | null>(null)
  const lastEventId = useRef<string | undefined>(undefined)
  const activeSessionRef = useRef<ManagedSession | null>(null)
  const historyLoadId = useRef(0)
  const sessionsRef = useRef<ManagedSession[]>([])
  sessionsRef.current = sessions
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId
  const interruptedIdsRef = useRef(interruptedIds)
  interruptedIdsRef.current = interruptedIds
  const compactingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearCompacting = useCallback(() => {
    if (compactingTimer.current) {
      clearTimeout(compactingTimer.current)
      compactingTimer.current = null
    }
    setCompacting(false)
  }, [])

  const markInterrupted = useCallback((id: string) => {
    setInterruptedIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev); next.add(id)
      saveInterruptedIds(next)
      return next
    })
  }, [])

  const unmarkInterrupted = useCallback((id: string) => {
    setInterruptedIds(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev); next.delete(id)
      saveInterruptedIds(next)
      return next
    })
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
    return deriveSessionUIState(activeSession, interruptedIds)
  }, [activeSession, interruptedIds])

  const getSessionUIState = useCallback(
    (session: ManagedSession): SessionUIState => deriveSessionUIState(session, interruptedIds),
    [interruptedIds],
  )

  // Drop interrupted markers for sessions that are no longer in `idle` or no
  // longer present in the sessions list. Anything that's now running, completed,
  // errored, or deleted shouldn't carry a pause marker — when it next reaches
  // idle, that's a fresh idle, not a paused-from-before.
  useEffect(() => {
    if (sessions.length === 0) return
    setInterruptedIds(prev => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const s of sessions) {
        if (s.state === 'idle' && prev.has(s.session_id)) next.add(s.session_id)
      }
      if (next.size === prev.size) {
        let same = true
        for (const id of prev) if (!next.has(id)) { same = false; break }
        if (same) return prev
      }
      saveInterruptedIds(next)
      return next
    })
  }, [sessions])

  // --- SSE connection ---

  const closeSSE = useCallback(() => {
    if (sseAbort.current) {
      sseAbort.current.abort()
      sseAbort.current = null
    }
  }, [])

  const startSSE = useCallback((sessionId: string) => {
    closeSSE()
    const abort = new AbortController()
    sseAbort.current = abort

    ;(async () => {
      try {
        const events = connectSSE(fetchFn, basePath, sessionId, lastEventId.current, abort.signal)
        for await (const event of events) {
          if (event.id) lastEventId.current = event.id
          handleSSEEvent(event)
        }
      } catch {
        if (abort.signal.aborted) return
        // Stream dropped unexpectedly (transient network/background suspend),
        // not a deliberate closeSSE(). Clear the ref so the running-state
        // reconnect effect can re-attach instead of seeing a dead controller.
        if (sseAbort.current === abort) sseAbort.current = null
        setActivity({ kind: 'idle' })
      }
    })()

    function handleSSEEvent(event: BridgeEvent) {
      const { type, data } = event
      const sessId = sessionId

      setLogRows(prev => applyEventToRows(prev, event))

      switch (type) {
        case 'stream': {
          if (data.stream?.delta?.type === 'thinking_delta') setActivity({ kind: 'thinking' })
          else setActivity({ kind: 'streaming' })
          break
        }
        case 'block': {
          if (data.block?.block?.type === 'thinking') setActivity({ kind: 'thinking' })
          else setActivity({ kind: 'streaming' })
          break
        }
        case 'thinking':
          setActivity({ kind: 'thinking' })
          break
        case 'tool_call': {
          setActivity({ kind: 'tool', name: data.tool_call?.name || '' })
          break
        }
        case 'tool_result':
          setActivity({ kind: 'streaming' })
          break
        case 'result':
          setActivity({ kind: 'idle' })
          unmarkInterrupted(sessId)
          patchSessionState(sessId, 'completed')
          refreshSessions()
          break
        case 'system': {
          const sys = data.system
          if (sys?.subtype === 'harness_id_set') refreshSessionsImpl()
          else if (sys?.subtype === 'display_name_changed') refreshSessionsImpl()
          else if (sys?.subtype === 'retry') setError(`Retrying (attempt ${sys.attempt}/${sys.max_retries})...`)
          else if (sys?.subtype === 'compact_boundary' || sys?.subtype === 'compact_ack') clearCompacting()
          break
        }
        case 'session_info':
          refreshSessionsImpl()
          break
        case 'error': {
          setError(data.error?.message || 'Stream error')
          setActivity({ kind: 'idle' })
          patchSessionState(sessId, 'error')
          break
        }
        case 'session_state': {
          const state = data.state?.state
          if (state === 'idle' && !interruptedIdsRef.current.has(sessId)) setActivity({ kind: 'idle' })
          else if (state === 'running') unmarkInterrupted(sessId)
          else if (state === 'completed') { setActivity({ kind: 'idle' }); unmarkInterrupted(sessId) }
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
          setActivity({ kind: 'idle' })
          patchSessionState(sessId, 'completed')
          closeSSE()
          refreshSessions()
          break
      }
    }
  }, [fetchFn, basePath, closeSSE, refreshSessions, refreshSessionsImpl, patchSessionState, unmarkInterrupted, clearCompacting])

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
      setLogRows(rows)
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
    setActivity({ kind: 'idle' })
    clearCompacting()

    if (!id) {
      setActiveSessionId(null)
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
      await loadHistory(id)
      // Hydrate the sticky-banner state. /hooks/pending returns the
      // awaiting_resolution events that haven't been closed by a matching
      // completed yet — required because Last-Event-ID replay only fires
      // on SSE attach, and the SSE attach below is conditional on running.
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
      if (session?.state === 'running') {
        startSSE(id)
      }
    })()
  }, [closeSSE, loadHistory, startSSE, refreshSessionsImpl, clearCompacting])

  useEffect(() => {
    if (activeSession?.state === 'running' && !sseAbort.current) {
      startSSE(activeSession.session_id)
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

  const send = useCallback(async (text: string) => {
    if (!activeSessionId || !text.trim()) return

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
    unmarkInterrupted(activeSessionId)

    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!res.ok) {
        const err = await res.text()
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
      startSSE(activeSessionId)
      refreshSessions()
    } catch (err) {
      setError(`Send failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions, unmarkInterrupted])

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
      await fetchFn(`${basePath}/sessions/${activeSessionId}/interrupt`, { method: 'POST' })
      markInterrupted(activeSessionId)
      markLastAssistantDone()
      setActivity({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Interrupt failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, refreshSessions, markLastAssistantDone, markInterrupted])

  const resume = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/resume`, { method: 'POST' })
      if (!res.ok) {
        setError(`Resume failed: ${res.statusText}`)
        return
      }
      unmarkInterrupted(activeSessionId)
      startSSE(activeSessionId)
      refreshSessions()
    } catch (err) {
      setError(`Resume failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions, unmarkInterrupted])

  const stopSession = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await fetchFn(`${basePath}/sessions/${activeSessionId}/stop`, { method: 'POST' })
      closeSSE()
      markLastAssistantDone()
      unmarkInterrupted(activeSessionId)
      setActivity({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Stop failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, closeSSE, refreshSessions, markLastAssistantDone, unmarkInterrupted])

  const compact = useCallback(async (summary?: string) => {
    if (!activeSessionId) return
    setCompacting(true)
    if (compactingTimer.current) clearTimeout(compactingTimer.current)
    compactingTimer.current = setTimeout(() => {
      compactingTimer.current = null
      setCompacting(false)
    }, 30000)
    try {
      const body: Record<string, string> = {}
      if (summary) body.summary = summary
      await fetchFn(`${basePath}/sessions/${activeSessionId}/compact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
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

  const sendConfig = useCallback(async (config: { model?: string; effort?: string; disabled_tools?: string[]; max_budget?: number }) => {
    if (!activeSessionId) return
    try {
      await fetchFn(`${basePath}/sessions/${activeSessionId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
    } catch (err) {
      setError(`Config update failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId])

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
    pendingHooksList,
    resolveHook,
    attachTokens,
    switchMode,
    refreshAttachToken,
  ])
}
