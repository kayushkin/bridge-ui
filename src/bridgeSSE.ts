import type { FetchFn, BridgeEvent, ManagedSession } from './types'

/**
 * What the hub could give a reconnecting client, from its `hello` frame.
 *
 * Three values rather than a bool because "fresh connect" and "you asked to
 * resume and I could not" both leave the client re-seeding, but only the
 * second means frames were lost and something on screen may have been wrong.
 */
export type SessionListResume = 'none' | 'replayed' | 'gap'

/**
 * Frame on the global session-list stream (`GET /session-events`).
 *
 * `unhandled` is not padding. The hub numbers every frame it publishes,
 * including kinds this client does not act on (`signal`), so a reader that
 * only recorded the ids of frames it understood would let its resume cursor
 * fall behind the stream and ask to be replayed frames it has already seen.
 * Every numbered frame is yielded; `eventId` is what the caller sends back.
 */
export type SessionListFrame =
  | { type: 'hello'; streamId: string; resume: SessionListResume; lastEventId: string }
  | { type: 'upsert'; eventId?: string; session: ManagedSession }
  | { type: 'delete'; eventId?: string; session_id: string }
  | { type: 'unhandled'; eventId?: string; eventType: string }

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
 * Reads the hub's `resume` word off a hello payload.
 *
 * An unrecognised or absent word is answered from what this client asked for,
 * because the two cases are not the same claim. Having sent no Last-Event-ID,
 * nothing could have been lost, so `none` is true and `gap` would invent a
 * loss. Having sent one and got back a word this client cannot read, the
 * resume is unproven — `gap` re-seeds and says frames may be missing, which
 * is the honest reading of an answer that cannot be understood.
 */
function resumeOf(raw: unknown, requestedLastEventId: string): SessionListResume {
  if (raw === 'none' || raw === 'replayed' || raw === 'gap') return raw
  return requestedLastEventId ? 'gap' : 'none'
}

/**
 * Connect to the global session-list event stream. Yields one frame per
 * lifecycle change (upsert / delete) plus an initial 'hello' on connect.
 * Mirrors connectSSE's parsing — kept separate so the per-session and global
 * streams have explicit, type-safe entrypoints.
 *
 * Pass the id of the last frame seen to resume: the hub replays exactly what
 * was published after it, and says in `hello` whether it could. Without that
 * the client re-seeds on every reconnect and an upsert that landed while the
 * connection was down is gone for good.
 */
export async function* connectSessionListSSE(
  fetchFn: FetchFn,
  basePath: string,
  lastEventId?: string,
  signal?: AbortSignal,
): AsyncGenerator<SessionListFrame> {
  const headers: Record<string, string> = { 'Accept': 'text/event-stream' }
  if (lastEventId) {
    headers['Last-Event-ID'] = lastEventId
  }

  const res = await fetchFn(`${basePath}/session-events`, {
    headers,
    signal,
  })

  if (!res.ok) {
    throw new Error(`session-list SSE connect failed: ${res.status} ${res.statusText}`)
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
          if (currentEvent.type) {
            try {
              const data = currentEvent.data ? JSON.parse(currentEvent.data) : {}
              if (currentEvent.type === 'hello') {
                yield {
                  type: 'hello',
                  streamId: (data.stream_id as string) ?? '',
                  resume: resumeOf(data.resume, lastEventId ?? ''),
                  lastEventId: (data.last_event_id as string) ?? '',
                }
              } else if (currentEvent.type === 'upsert' && data.session) {
                yield { type: 'upsert', eventId: currentEvent.id, session: data.session as ManagedSession }
              } else if (currentEvent.type === 'delete' && data.session_id) {
                yield { type: 'delete', eventId: currentEvent.id, session_id: data.session_id as string }
              } else {
                yield { type: 'unhandled', eventId: currentEvent.id, eventType: currentEvent.type }
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
        } else if (line.startsWith('id:')) {
          currentEvent.id = line.slice(3).trim()
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
