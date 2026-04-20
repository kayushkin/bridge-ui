import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import { connectSSE } from './bridgeSSE'
import type {
  BridgeEvent, ManagedSession, SessionUIState, ActivityKind,
  Message, MessageMeta, CreateSessionOpts, UseBridgeSessionReturn,
} from './types'

// --- Normalize messages from /messages API ---
// The server returns MaterializedMessage with tools at the top level and meta as
// a ResultEvent. Merge top-level tools into meta for uniform access.

function normalizeMessage(m: Message & { harness_message_id?: string }, index: number, sessionId: string): Message {
  const result: Message = {
    ...m,
    id: m.id ?? `hist-${index}`,
    harnessMessageId: m.harnessMessageId ?? m.harness_message_id,
    sessionId: m.sessionId ?? sessionId,
  }

  if (m.tools?.length) {
    result.meta = { ...result.meta, tools: m.tools, toolCalls: m.tools.length }
  }

  return result
}

// --- Event-driven message reducer ---
//
// Every chat event from the server carries a canonical `message_id` (ULID,
// minted by the bridge-server's harness manager). The reducer keys off that
// id: events with a known id update the existing message; events with a new
// id create one. Dedup uses the event's SSE RowID — replays after reconnect
// are idempotent because we never re-apply a row we've already seen.

interface EventEnvelope {
  id?: string                          // SSE id = event RowID
  type: string
  data: Record<string, unknown> & {
    message_id?: string
    harness_message_id?: string
    bridge_id?: string
    timestamp?: string
  }
}

function applyEvent(prev: Message[], ev: EventEnvelope, sessionId: string): Message[] {
  const msgId = ev.data.message_id
  if (!msgId) return prev   // bookkeeping event (system, session_state, …) — no bubble

  const rowId = ev.id ? Number(ev.id) : 0
  const idx = prev.findIndex(m => m.id === msgId)

  if (idx === -1) {
    const role = ev.type === 'user_message' ? 'user' : 'assistant'
    const fresh: Message = {
      id: msgId,
      harnessMessageId: ev.data.harness_message_id,
      role,
      content: '',
      timestamp: ev.data.timestamp || new Date().toISOString(),
      sessionId,
      lastEventRowId: rowId,
    }
    return [...prev, applyDelta(fresh, ev)]
  }

  const existing = prev[idx]
  if (rowId && existing.lastEventRowId && rowId <= existing.lastEventRowId) {
    return prev   // already applied — replay no-op
  }
  const updated: Message = {
    ...applyDelta(existing, ev),
    lastEventRowId: rowId || existing.lastEventRowId,
    harnessMessageId: existing.harnessMessageId ?? ev.data.harness_message_id,
  }
  const next = prev.slice()
  next[idx] = updated
  return next
}

function applyDelta(m: Message, ev: EventEnvelope): Message {
  switch (ev.type) {
    case 'user_message': {
      const result = ev.data.result as { text?: string } | undefined
      return { ...m, content: result?.text ?? m.content, done: true }
    }
    case 'stream': {
      const stream = ev.data.stream as { delta?: { type: string; text?: string; thinking?: string } } | undefined
      const d = stream?.delta
      if (d?.type === 'text_delta') return { ...m, content: m.content + (d.text || '') }
      if (d?.type === 'thinking_delta') return { ...m, thinking: (m.thinking || '') + (d.thinking || '') }
      return m
    }
    case 'thinking': {
      const t = ev.data.thinking as { text?: string } | undefined
      return { ...m, thinking: (m.thinking || '') + (t?.text || '') }
    }
    case 'tool_call': {
      const tc = ev.data.tool_call as { tool_id?: string; name?: string; input?: Record<string, unknown> } | undefined
      if (!tc) return m
      const tools = [...(m.meta?.tools || []), { tool: tc.name || '', input: tc.input }]
      return { ...m, meta: { ...m.meta, tools, toolCalls: tools.length } }
    }
    case 'tool_result': {
      const tr = ev.data.tool_result as { tool_id?: string; name?: string; output?: string; is_error?: boolean } | undefined
      if (!tr) return m
      const tools = (m.meta?.tools || []).slice()
      // Match by name (since tool_id isn't preserved on the client tools[] yet)
      // and prefer the most recent un-resolved tool with that name.
      for (let i = tools.length - 1; i >= 0; i--) {
        if (tools[i].tool === tr.name && !tools[i].output) {
          tools[i] = { ...tools[i], output: tr.output, error: tr.is_error }
          break
        }
      }
      return { ...m, meta: { ...m.meta, tools, toolCalls: tools.length } }
    }
    case 'result': {
      const result = ev.data.result as MessageMeta & { text?: string } | undefined
      const meta: MessageMeta = { ...(result || {}), rawStats: ev.data as Record<string, unknown> }
      return { ...m, content: result?.text || m.content, meta: { ...m.meta, ...meta }, done: true }
    }
    case 'error': {
      return { ...m, done: true }
    }
    default:
      return m
  }
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
  const [messages, setMessages] = useState<Message[]>([])
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

  // Immediately patch a session's state in the local array so uiState
  // recomputes without waiting for the debounced server refresh.
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
          handleSSEEvent(event, sessionId)
        }
      } catch {
        if (abort.signal.aborted) return
        setActivity({ kind: 'idle' })
      }
    })()

    function handleSSEEvent(event: BridgeEvent, sessId: string) {
      const { type, data } = event

      // Apply the event to the message store. A no-op for bookkeeping events
      // (system, session_state, session_info) which carry no message_id.
      setMessages(prev => applyEvent(prev, event as EventEnvelope, sessId))

      // Activity / sidebar / error side effects.
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

  const loadHistory = useCallback(async (sessionId: string) => {
    const loadId = ++historyLoadId.current
    setLoadingHistory(true)
    try {
      const res = await fetchFn(`${basePath}/sessions/${sessionId}/messages`)
      if (!res.ok) {
        setError(`History load failed: ${res.status} ${res.statusText}`)
        return
      }
      const msgs: Message[] = await res.json()

      if (loadId !== historyLoadId.current) return
      if (msgs) setMessages(msgs.map((m, i) => normalizeMessage(m, i, sessionId)))
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
      setMessages([])
      return
    }

    setActiveSessionId(id)
    setMessages([])
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

    // Optimistic user message keyed by clientId. The /send response returns
    // the canonical bridge MessageID; we patch the message in-place so when
    // the user_message event later arrives via SSE it lands on the same row.
    const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Message = {
      id: clientId,
      clientId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      sessionId: activeSessionId,
      done: true,
    }
    setMessages(prev => [...prev, optimistic])
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
        setMessages(prev => prev.map(m =>
          m.clientId === clientId ? { ...m, id: body.message_id!, clientId: undefined } : m,
        ))
      }

      // Reset lastEventId so SSE connects without Last-Event-ID.
      // This makes the server use ListCurrentTurnEventsWithIDs (turn-aware
      // replay) instead of ListEventsSinceID (which replays everything
      // including user_message events from the previous turn boundary).
      lastEventId.current = undefined
      startSSE(activeSessionId)
      refreshSessions()
    } catch (err) {
      setError(`Send failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions])

  const interrupt = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await fetchFn(`${basePath}/sessions/${activeSessionId}/interrupt`, { method: 'POST' })
      wasInterrupted.current = true
      // Mark the open assistant message done so the typing indicator clears.
      setMessages(prev => {
        const idx = prev.length - 1
        if (idx < 0 || prev[idx].role !== 'assistant' || prev[idx].done) return prev
        const next = prev.slice()
        next[idx] = { ...next[idx], done: true }
        return next
      })
      setActivity({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Interrupt failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, refreshSessions])

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
      setMessages(prev => {
        const idx = prev.length - 1
        if (idx < 0 || prev[idx].role !== 'assistant' || prev[idx].done) return prev
        const next = prev.slice()
        next[idx] = { ...next[idx], done: true }
        return next
      })
      wasInterrupted.current = false
      setActivity({ kind: 'idle' })
      refreshSessions()
    } catch (err) {
      setError(`Stop failed: ${err}`)
    }
  }, [fetchFn, basePath, activeSessionId, closeSSE, refreshSessions])

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

  // Cleanup on unmount
  useEffect(() => () => {
    closeSSE()
    debouncedRefresh.cancel()
  }, [closeSSE, debouncedRefresh])

  return useMemo(() => ({
    sessions,
    activeSession,
    messages,
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
    messages,
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

