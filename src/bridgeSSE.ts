import type { FetchFn, BridgeEvent, ManagedSession } from './types'

/** Frame on the global session-list stream (`GET /session-events`). */
export type SessionListFrame =
  | { type: 'hello' }
  | { type: 'upsert'; session: ManagedSession }
  | { type: 'delete'; bridge_id: string }

/**
 * Connect to a bridge session's SSE event stream using fetch + ReadableStream.
 * Unlike native EventSource, this supports auth headers and Last-Event-ID.
 */
export async function* connectSSE(
  fetchFn: FetchFn,
  basePath: string,
  sessionId: string,
  lastEventId?: string,
  signal?: AbortSignal,
): AsyncGenerator<BridgeEvent> {
  const headers: Record<string, string> = {
    'Accept': 'text/event-stream',
  }
  if (lastEventId) {
    headers['Last-Event-ID'] = lastEventId
  }

  const res = await fetchFn(`${basePath}/sessions/${sessionId}/events`, {
    headers,
    signal,
  })

  if (!res.ok) {
    throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: { type: string; data: string; id?: string } = { type: '', data: '' }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line === '') {
          if (currentEvent.data) {
            try {
              const data = JSON.parse(currentEvent.data)
              yield {
                id: currentEvent.id,
                type: currentEvent.type || 'message',
                data,
              }
            } catch {
              // Skip unparseable events
            }
          }
          currentEvent = { type: '', data: '' }
        } else if (line.startsWith('event:')) {
          currentEvent.type = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          currentEvent.data += (currentEvent.data ? '\n' : '') + line.slice(5).trim()
        } else if (line.startsWith('id:')) {
          currentEvent.id = line.slice(3).trim()
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Connect to the global session-list event stream. Yields one frame per
 * lifecycle change (upsert / delete) plus an initial 'hello' on connect.
 * Mirrors connectSSE's parsing — kept separate so the per-session and global
 * streams have explicit, type-safe entrypoints.
 */
export async function* connectSessionListSSE(
  fetchFn: FetchFn,
  basePath: string,
  signal?: AbortSignal,
): AsyncGenerator<SessionListFrame> {
  const res = await fetchFn(`${basePath}/session-events`, {
    headers: { 'Accept': 'text/event-stream' },
    signal,
  })

  if (!res.ok) {
    throw new Error(`session-list SSE connect failed: ${res.status} ${res.statusText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: { type: string; data: string } = { type: '', data: '' }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line === '') {
          if (currentEvent.type) {
            try {
              const data = currentEvent.data ? JSON.parse(currentEvent.data) : {}
              if (currentEvent.type === 'hello') {
                yield { type: 'hello' }
              } else if (currentEvent.type === 'upsert' && data.session) {
                yield { type: 'upsert', session: data.session as ManagedSession }
              } else if (currentEvent.type === 'delete' && data.bridge_id) {
                yield { type: 'delete', bridge_id: data.bridge_id as string }
              }
            } catch {
              // Skip unparseable frames
            }
          }
          currentEvent = { type: '', data: '' }
        } else if (line.startsWith('event:')) {
          currentEvent.type = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          currentEvent.data += (currentEvent.data ? '\n' : '') + line.slice(5).trim()
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
