import { useSyncExternalStore } from 'react'
import { connectSessionListSSE } from './bridgeSSE'
import type { SessionListFrame, SessionListResume } from './bridgeSSE'
import { sharedInstance } from './sharedInstance'
import type { FetchFn, ManagedSession } from './types'

// The live session list: one `GET /sessions` seed, one `/session-events`
// connection, and every consumer on the page reading the same answer.
//
// This replaces two polls and a race.
//
// The polls: `BridgeSessions` re-fetched `/sessions` every 15 seconds for a
// payload byte-for-byte identical to what `upsert` and `delete` already carry,
// and `useBridgeSession` ran a stuck-running watchdog that re-fetched every
// two seconds whenever the active session sat in `running`. Both existed for
// one reason — the global stream wrote no `id:` line, so a reconnect could not
// replay what it missed and a dropped frame was dropped for good. The hub
// numbers its frames now (llm-bridge-server `250f3e7`), so a reconnect asks
// for exactly what it missed and neither poll has anything left to cover.
//
// The race is the one retiring the polls would otherwise have exposed. Seeding
// and subscribing used to be two independent effects, so a mutation landing
// between the two was applied to a list the seed then overwrote. Here the
// connection opens first and live frames are held until the seed they must be
// applied on top of has arrived.
//
// Shared, for the same reason `SharedPoll` is: `useBridgeSession` is called
// once per chat pane and `BridgeSessions` calls it again, so a split-pane
// layout opened one SSE connection per pane and held one copy of the list per
// pane. N consumers now cost one connection.

/** Longest wait between reconnect attempts. */
export const SESSION_LIST_MAX_RETRY_MS = 30000

/** First wait after a dropped connection, doubled up to the maximum. */
export const SESSION_LIST_BASE_RETRY_MS = 1000

export interface SessionListSnapshot {
  readonly sessions: ManagedSession[]
  /** True until the first seed settles, however it settles. */
  readonly loading: boolean
  /** True while the seed is answering and the stream is up. */
  readonly connected: boolean
  /** What the last `hello` reported. */
  readonly resume: SessionListResume
  /**
   * How many times the hub has answered a resume with `gap`.
   *
   * Counted rather than flagged because a gap is an event, not a state: the
   * list is correct again the moment the re-seed lands, so a boolean would
   * have to be cleared by hand and would read as "currently broken". A count
   * that only goes up is something a surface can watch change.
   */
  readonly gaps: number
}

/**
 * Applies one session-list frame to the list.
 *
 * Returns the same array when nothing changed, so React can bail out of the
 * re-render — an `upsert` whose fields all match is the common case on a busy
 * stream. `hello` and `unhandled` never change the list.
 */
export function applySessionListFrame(
  sessions: ManagedSession[],
  frame: SessionListFrame,
): ManagedSession[] {
  if (frame.type === 'upsert') {
    const incoming = frame.session
    const i = sessions.findIndex(s => s.session_id === incoming.session_id)
    if (i === -1) return [incoming, ...sessions]
    const merged = { ...sessions[i], ...incoming }
    if (sameSession(sessions[i], merged)) return sessions
    const next = sessions.slice()
    next[i] = merged
    return next
  }
  if (frame.type === 'delete') {
    if (!sessions.some(s => s.session_id === frame.session_id)) return sessions
    return sessions.filter(s => s.session_id !== frame.session_id)
  }
  return sessions
}

/** Shallow field-by-field equality, which is what an upsert merge can change. */
function sameSession(a: ManagedSession, b: ManagedSession): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  const ra = a as unknown as Record<string, unknown>
  const rb = b as unknown as Record<string, unknown>
  return ka.every(k => ra[k] === rb[k])
}

/**
 * Whether a `hello` leaves the client having to re-read `GET /sessions`.
 *
 * Only `replayed` does not: the hub has already delivered every frame
 * published since the id the client sent, so its list is current. `none` is a
 * fresh connect with nothing to replay and `gap` is a resume the hub could not
 * honour, and both leave the list unproven.
 */
export function sessionListMustReseed(resume: SessionListResume): boolean {
  return resume !== 'replayed'
}

type Listener = () => void

const EMPTY: ManagedSession[] = []

export class SessionListStore {
  private readonly fetchFn: FetchFn
  private readonly basePath: string
  private readonly listeners = new Set<Listener>()
  /** Counted apart from `listeners`, which collapses two identical functions. */
  private subscribers = 0
  private snapshot: SessionListSnapshot = {
    sessions: EMPTY, loading: true, connected: false, resume: 'none', gaps: 0,
  }

  /** The id of the last numbered frame applied, sent back on reconnect. */
  private lastEventId = ''
  private abort: AbortController | null = null
  private running = false
  private seedInFlight: Promise<void> | null = null

  constructor(fetchFn: FetchFn, basePath: string) {
    this.fetchFn = fetchFn
    this.basePath = basePath
  }

  getSnapshot = (): SessionListSnapshot => this.snapshot

  get subscriberCount(): number {
    return this.subscribers
  }

  /** True while a connection is being held open, i.e. while somebody watches. */
  get streaming(): boolean {
    return this.running
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    this.subscribers++
    if (this.subscribers === 1) this.start()
    let live = true
    return () => {
      // React can call an unsubscribe twice; only the first counts, or the
      // count goes negative and the connection outlives its last subscriber.
      if (!live) return
      live = false
      this.listeners.delete(listener)
      this.subscribers--
      if (this.subscribers === 0) this.stop()
    }
  }

  /**
   * Re-read `GET /sessions` now.
   *
   * Still needed with the stream up: a mutation this client just made is
   * confirmed by its own response, and callers refresh to pick up fields the
   * stream does not carry. Concurrent calls share one request.
   */
  refresh = (): Promise<void> => {
    if (this.seedInFlight) return this.seedInFlight
    const attempt = this.seed().finally(() => {
      if (this.seedInFlight === attempt) this.seedInFlight = null
    })
    this.seedInFlight = attempt
    return attempt
  }

  /**
   * Merge fields into one session locally, without a round trip.
   *
   * For state the client learns before the list does — the per-session event
   * stream reports a turn ending well before the hub's upsert arrives — and
   * for hydrating a field a list payload omits. The next upsert overwrites it,
   * which is the point: this is a head start on the server's answer, never a
   * substitute for it.
   */
  patch = (sessionId: string, fields: Partial<ManagedSession>): void => {
    const i = this.snapshot.sessions.findIndex(s => s.session_id === sessionId)
    if (i === -1) return
    const merged = { ...this.snapshot.sessions[i], ...fields }
    if (sameSession(this.snapshot.sessions[i], merged)) return
    const next = this.snapshot.sessions.slice()
    next[i] = merged
    this.emit({ ...this.snapshot, sessions: next })
  }

  private start(): void {
    if (this.running) return
    this.running = true
    void this.run()
  }

  private stop(): void {
    this.running = false
    this.abort?.abort()
    this.abort = null
    // The sessions are kept on purpose, the same way SharedPoll keeps its last
    // answer: a pane that unmounts and comes back renders the list it had
    // instead of flashing empty, and the reconnect re-seeds in the same breath.
    // lastEventId is kept too — a resume across a remount is exactly the gap
    // this file exists to close.
  }

  private async run(): Promise<void> {
    let retryDelay = SESSION_LIST_BASE_RETRY_MS
    while (this.running) {
      const abort = new AbortController()
      this.abort = abort
      try {
        const stream = connectSessionListSSE(this.fetchFn, this.basePath, this.lastEventId, abort.signal)
        for await (const frame of stream) {
          if (!this.running) return
          if (frame.type === 'hello') {
            retryDelay = SESSION_LIST_BASE_RETRY_MS
            this.emit({
              ...this.snapshot,
              connected: true,
              resume: frame.resume,
              gaps: this.snapshot.gaps + (frame.resume === 'gap' ? 1 : 0),
            })
            // Awaiting the seed inside the loop is what orders the two. The
            // generator cannot yield while this is pending, so every frame
            // published meanwhile waits in the connection and is applied on
            // top of the seed rather than under it. Seeding from a separate
            // effect — which is what this replaced — had no such ordering,
            // and a mutation landing in that window was overwritten.
            if (sessionListMustReseed(frame.resume)) await this.refresh()
            continue
          }
          this.applyFrame(frame)
        }
      } catch {
        if (!this.running || abort.signal.aborted) return
      }
      if (!this.running) return
      this.emit({ ...this.snapshot, connected: false })
      await new Promise(r => setTimeout(r, retryDelay))
      retryDelay = Math.min(retryDelay * 2, SESSION_LIST_MAX_RETRY_MS)
    }
  }

  /** Applies a frame and advances the resume cursor past it. */
  private applyFrame(frame: SessionListFrame): void {
    if (frame.type !== 'hello' && frame.eventId) {
      this.lastEventId = frame.eventId
    }
    const next = applySessionListFrame(this.snapshot.sessions, frame)
    if (next !== this.snapshot.sessions) {
      this.emit({ ...this.snapshot, sessions: next })
    }
  }

  private async seed(): Promise<void> {
    try {
      const res = await this.fetchFn(`${this.basePath}/sessions`)
      if (!res.ok) {
        this.emit({ ...this.snapshot, loading: false, connected: false })
        return
      }
      const data = ((await res.json()) as ManagedSession[] | null) ?? EMPTY
      this.emit({ ...this.snapshot, sessions: data, loading: false, connected: true })
    } catch {
      this.emit({ ...this.snapshot, loading: false, connected: false })
    }
  }

  private emit(next: SessionListSnapshot): void {
    const current = this.snapshot
    if (
      current.sessions === next.sessions
      && current.loading === next.loading
      && current.connected === next.connected
      && current.resume === next.resume
      && current.gaps === next.gaps
    ) {
      // Nothing a caller can see has changed. Publishing a fresh object anyway
      // re-renders every subscriber, which is the cost sharing removes.
      return
    }
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

/** One store per (auth'd fetch, base path) — see `sharedInstance` for why the
 *  fetch function owns the table rather than the path alone. */
export function sharedSessionList(fetchFn: FetchFn, basePath: string): SessionListStore {
  return sharedInstance(fetchFn, `session-list:${basePath}`, () => new SessionListStore(fetchFn, basePath))
}

/** Subscribe to the shared session list for as long as the component is mounted. */
export function useSharedSessionList(store: SessionListStore): SessionListSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
