import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import { connectSSE } from './bridgeSSE'
import type {
  BridgeEvent, ManagedSession, SessionUIState, ActivityKind,
  LogRow, LogRowActor, ToolEvent, CreateSessionOpts, UseBridgeSessionReturn,
  SessionInfo, TokenUsage, MessageMeta,
} from './types'

// --- Event envelope ---
//
// Unified shape for both live SSE events and history-replayed events. History
// events arrive as bare `msg.Event` objects (with `event_id` injected by
// log-store); live events arrive in the SSE BridgeEvent envelope where the
// stored event is under `data` and the SSE `id:` line carries the row id.

interface EventEnvelope {
  id?: string                           // SSE `id:` line, stringified row id
  type: string
  data: Record<string, unknown> & {
    event_id?: number
    message_id?: string
    harness_message_id?: string
    client_request_id?: string
    bridge_id?: string
    timestamp?: string
    [key: string]: unknown
  }
}

function wrapHistoryEvent(ev: Record<string, unknown>): EventEnvelope {
  const id = typeof ev.event_id === 'number' ? String(ev.event_id) : undefined
  return {
    id,
    type: String(ev.type ?? 'message'),
    data: ev as EventEnvelope['data'],
  }
}

function eventIdOf(ev: EventEnvelope): number {
  if (typeof ev.data.event_id === 'number') return ev.data.event_id
  if (ev.id) return Number(ev.id) || 0
  return 0
}

// --- LogRow reducer ---
//
// Rule: events with a bridge message_id coalesce into one row (stream deltas
// accumulate, tool_call + tool_result merge, result finalizes). Events with
// no message_id (system, session_state, session_info) stand alone, keyed by
// their event_id. Dedup is per-event_id.

function actorFor(eventType: string): LogRowActor {
  switch (eventType) {
    case 'user_message':
      return 'user'
    case 'system':
    case 'session_state':
    case 'session_info':
      return 'system'
    default:
      return 'assistant'
  }
}

function freshRow(ev: EventEnvelope): LogRow {
  const msgId = ev.data.message_id
  const evId = eventIdOf(ev)
  return {
    key: msgId || `evt_${evId}`,
    clientId: undefined,
    clientRequestId: ev.data.client_request_id,
    messageId: msgId,
    harnessMessageId: ev.data.harness_message_id,
    eventIds: [],
    actor: actorFor(ev.type),
    eventType: ev.type,
    subtype: subtypeOf(ev),
    timestamp: String(ev.data.timestamp || new Date().toISOString()),
    events: [],
  }
}

function subtypeOf(ev: EventEnvelope): string | undefined {
  if (ev.type === 'system') {
    const sys = ev.data.system as { subtype?: string } | undefined
    return sys?.subtype
  }
  if (ev.type === 'thinking') {
    const t = ev.data.thinking as { subtype?: string } | undefined
    return t?.subtype
  }
  return undefined
}

function applyDelta(row: LogRow, ev: EventEnvelope): LogRow {
  const events = [...row.events, ev.data]
  const base: LogRow = { ...row, events }

  switch (ev.type) {
    case 'user_message': {
      const result = ev.data.result as { text?: string } | undefined
      return { ...base, text: result?.text ?? row.text, done: true }
    }
    case 'stream': {
      const stream = ev.data.stream as {
        delta?: { type: string; text?: string; thinking?: string }
        usage?: TokenUsage
      } | undefined
      const d = stream?.delta
      let next = base
      if (d?.type === 'text_delta') next = { ...next, text: (row.text || '') + (d.text || '') }
      else if (d?.type === 'thinking_delta') next = { ...next, thinking: (row.thinking || '') + (d.thinking || '') }
      if (stream?.usage) next = { ...next, usage: stream.usage }
      return next
    }
    case 'thinking': {
      const t = ev.data.thinking as { text?: string } | undefined
      return { ...base, thinking: (row.thinking || '') + (t?.text || '') }
    }
    case 'tool_call': {
      const tc = ev.data.tool_call as { tool_id?: string; name?: string; input?: Record<string, unknown> } | undefined
      if (!tc) return base
      const tools = [...(row.tools || []), { tool: tc.name || '', input: tc.input } satisfies ToolEvent]
      return { ...base, tools }
    }
    case 'tool_result': {
      const tr = ev.data.tool_result as { tool_id?: string; name?: string; output?: string; is_error?: boolean } | undefined
      if (!tr) return base
      const tools = (row.tools || []).slice()
      for (let i = tools.length - 1; i >= 0; i--) {
        if (tools[i].tool === tr.name && !tools[i].output) {
          tools[i] = { ...tools[i], output: tr.output, error: tr.is_error }
          break
        }
      }
      return { ...base, tools }
    }
    case 'result': {
      const result = ev.data.result as (MessageMeta & { text?: string; usage?: TokenUsage }) | undefined
      const meta: MessageMeta = { ...(result || {}), rawStats: ev.data as Record<string, unknown> }
      return {
        ...base,
        text: result?.text || row.text,
        usage: result?.usage ?? row.usage,
        meta: { ...row.meta, ...meta },
        done: true,
      }
    }
    case 'error': {
      const err = ev.data.error as { message?: string } | undefined
      return { ...base, errorMessage: err?.message || 'error', done: true }
    }
    case 'system': {
      const sys = ev.data.system as { subtype?: string; message?: string; [k: string]: unknown } | undefined
      if (!sys) return base
      const { subtype, message, ...rest } = sys
      void subtype
      return {
        ...base,
        systemMessage: message,
        systemFields: Object.keys(rest).length > 0 ? rest : undefined,
        done: true,
      }
    }
    case 'session_state': {
      const st = ev.data.state as { state?: string; previous?: string; reason?: string } | undefined
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
    default:
      return base
  }
}

function applyEventToRows(rows: LogRow[], ev: EventEnvelope): LogRow[] {
  const evId = eventIdOf(ev)
  const msgId = ev.data.message_id

  if (msgId) {
    const idx = rows.findIndex(r => r.messageId === msgId)
    if (idx === -1) {
      const fresh = freshRow(ev)
      const updated = applyDelta(fresh, ev)
      updated.eventIds = evId ? [evId] : []
      return [...rows, updated]
    }
    const existing = rows[idx]
    if (evId && existing.eventIds.includes(evId)) return rows
    const updated = applyDelta(existing, ev)
    updated.eventIds = evId ? [...existing.eventIds, evId] : existing.eventIds
    if (!existing.harnessMessageId && ev.data.harness_message_id) {
      updated.harnessMessageId = ev.data.harness_message_id
    }
    if (!existing.clientRequestId && ev.data.client_request_id) {
      updated.clientRequestId = ev.data.client_request_id
    }
    const next = rows.slice()
    next[idx] = updated
    return next
  }

  // Standalone row, keyed by event_id. Dedup against its own eventIds[0].
  if (evId && rows.some(r => r.eventIds[0] === evId)) return rows
  const fresh = freshRow(ev)
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

  const wasInterrupted = useRef(false)
  const sseAbort = useRef<AbortController | null>(null)
  const lastEventId = useRef<string | undefined>(undefined)
  const activeSessionRef = useRef<ManagedSession | null>(null)
  const historyLoadId = useRef(0)

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

  // --- Derived state ---

  const activeSession = sessions.find(s => s.bridge_id === activeSessionId) || null
  activeSessionRef.current = activeSession

  const patchSessionState = useCallback((sessionId: string, state: string) => {
    setSessions(prev => prev.map(s =>
      s.bridge_id === sessionId ? { ...s, state } : s,
    ))
  }, [])

  const uiState: SessionUIState = useMemo(() => {
    if (!activeSession) return 'empty'
    if (activeSession.state === 'running') return 'running'
    if (activeSession.state === 'idle' && wasInterrupted.current) return 'paused'
    if (activeSession.state === 'idle') return 'idle'
    return activeSession.state as SessionUIState
  }, [activeSession])

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
        setActivity({ kind: 'idle' })
      }
    })()

    function handleSSEEvent(event: BridgeEvent) {
      const { type, data } = event
      const sessId = sessionId

      setLogRows(prev => applyEventToRows(prev, event as EventEnvelope))

      switch (type) {
        case 'stream': {
          const delta = (data.stream as { delta?: { type?: string } } | undefined)?.delta
          if (delta?.type === 'thinking_delta') setActivity({ kind: 'thinking' })
          else setActivity({ kind: 'streaming' })
          break
        }
        case 'thinking':
          setActivity({ kind: 'thinking' })
          break
        case 'tool_call': {
          const tc = data.tool_call as { name?: string } | undefined
          setActivity({ kind: 'tool', name: tc?.name || '' })
          break
        }
        case 'tool_result':
          setActivity({ kind: 'streaming' })
          break
        case 'result':
          setActivity({ kind: 'idle' })
          wasInterrupted.current = false
          patchSessionState(sessId, 'completed')
          refreshSessions()
          break
        case 'system': {
          const sys = data.system as { subtype?: string; attempt?: number; max_retries?: number } | undefined
          if (sys?.subtype === 'harness_id_set') refreshSessionsImpl()
          else if (sys?.subtype === 'retry') setError(`Retrying (attempt ${sys.attempt}/${sys.max_retries})...`)
          break
        }
        case 'session_info':
          refreshSessionsImpl()
          break
        case 'error': {
          const errData = data.error as { message?: string } | undefined
          setError(errData?.message || 'Stream error')
          setActivity({ kind: 'idle' })
          patchSessionState(sessId, 'error')
          break
        }
        case 'session_state': {
          const state = (data.state as { state?: string } | undefined)?.state
          if (state === 'idle' && !wasInterrupted.current) setActivity({ kind: 'idle' })
          else if (state === 'running') wasInterrupted.current = false
          else if (state === 'completed') setActivity({ kind: 'idle' })
          if (state) patchSessionState(sessId, state)
          refreshSessions()
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
  }, [fetchFn, basePath, closeSSE, refreshSessions, refreshSessionsImpl, patchSessionState])

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
      const raws: Array<Record<string, unknown>> = await res.json()

      if (loadId !== historyLoadId.current) return

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
    wasInterrupted.current = false
    setError(null)
    setActivity({ kind: 'idle' })

    if (!id) {
      setActiveSessionId(null)
      setLogRows([])
      return
    }

    setActiveSessionId(id)
    setLogRows([])
    lastEventId.current = undefined

    ;(async () => {
      await loadHistory(id)
      const session = sessions.find(s => s.bridge_id === id)
      if (session?.state === 'running') {
        startSSE(id)
      }
      if (session?.state === 'idle') {
        wasInterrupted.current = false
      }
    })()
  }, [closeSSE, loadHistory, startSSE, sessions])

  useEffect(() => {
    if (activeSession?.state === 'running' && !sseAbort.current) {
      startSSE(activeSession.bridge_id)
    }
  }, [activeSession?.state, activeSession?.bridge_id, startSSE])

  // --- Visibility change reconnection ---

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeSessionId) {
        refreshSessionsImpl()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeSessionId, refreshSessionsImpl])

  // --- Actions ---

  const createSession = useCallback(async (opts: CreateSessionOpts): Promise<ManagedSession | null> => {
    try {
      const clientId = opts.clientId ?? `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const body: Record<string, unknown> = {
        harness: opts.harness,
        display_name: opts.displayName,
        agent_id: opts.agentId,
        instance_id: opts.instanceId,
        auto_start: false,
        client_id: clientId,
      }
      const res = await fetchFn(`${basePath}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError(`Failed to create session: ${res.statusText}`)
        return null
      }
      const sess: ManagedSession = await res.json()
      await refreshSessionsImpl()
      selectSession(sess.bridge_id)
      return sess
    } catch (err) {
      setError(`Failed to create session: ${err}`)
      return null
    }
  }, [fetchFn, basePath, refreshSessionsImpl, selectSession])

  const send = useCallback(async (text: string) => {
    if (!activeSessionId || !text.trim()) return

    // Optimistic user row keyed by clientId. When /send returns with the
    // canonical bridge MessageID we patch it onto the row; the subsequent
    // user_message SSE event then coalesces into the same row.
    const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const optimistic: LogRow = {
      key: clientId,
      clientId,
      eventIds: [],
      actor: 'user',
      eventType: 'user_message',
      timestamp: new Date().toISOString(),
      text,
      events: [],
      done: true,
    }
    setLogRows(prev => [...prev, optimistic])
    setError(null)
    wasInterrupted.current = false

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
        setLogRows(prev => prev.map(r =>
          r.clientId === clientId ? { ...r, messageId: body.message_id, key: body.message_id! } : r,
        ))
      }

      lastEventId.current = undefined
      startSSE(activeSessionId)
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
      await fetchFn(`${basePath}/sessions/${activeSessionId}/interrupt`, { method: 'POST' })
      wasInterrupted.current = true
      markLastAssistantDone()
      setActivity({ kind: 'idle' })
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
        setError(`Resume failed: ${res.statusText}`)
        return
      }
      wasInterrupted.current = false
      startSSE(activeSessionId)
      refreshSessions()
    } catch (err) {
      setError(`Resume failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions])

  const stopSession = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await fetchFn(`${basePath}/sessions/${activeSessionId}/stop`, { method: 'POST' })
      closeSSE()
      markLastAssistantDone()
      wasInterrupted.current = false
      setActivity({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Stop failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, closeSSE, refreshSessions, markLastAssistantDone])

  const compact = useCallback(async (summary?: string) => {
    if (!activeSessionId) return
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
    }
  }, [fetchFn, basePath, activeSessionId])

  const forkSession = useCallback(async (displayName?: string) => {
    if (!activeSessionId) return
    try {
      const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName || '',
          client_id: `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        }),
      })
      if (!res.ok) {
        setError(`Fork failed: ${res.statusText}`)
        return
      }
      const forked: ManagedSession = await res.json()
      await refreshSessionsImpl()
      selectSession(forked.bridge_id)
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

  useEffect(() => () => {
    closeSSE()
    debouncedRefresh.cancel()
  }, [closeSSE, debouncedRefresh])

  return useMemo(() => ({
    sessions,
    activeSession,
    logRows,
    uiState,
    activity,
    connected,
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
  }), [
    sessions,
    activeSession,
    logRows,
    uiState,
    activity,
    connected,
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
  ])
}
