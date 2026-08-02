import { useSyncExternalStore } from 'react'
import { sharedInstance } from './sharedInstance'
import type { FetchFn } from './types'

// A poll of one URL, shared by every component that asks for it.
//
// The hooks in this library used to each own their `useState` + `setInterval`,
// so a page that called `useBridgeInstances()` from three components ran three
// 30-second polls of `/instances` and held three copies of the answer. dash's
// `/dashv2` does exactly that, and so does its sibling call to
// `useBridgeMachines()`. Nothing was wrong with any single caller; the cost
// only shows up when you count the timers on the page.
//
// SharedPoll moves the timer and the snapshot out of the component. The first
// subscriber starts the poll, the rest attach to the answer it already has,
// and the last one to leave stops the timer. N callers cost one request.
//
// Deliberately not a cache library. It keeps the exact behaviour the hooks had
// — `loading` means "the first attempt has not settled yet" and stays false
// afterwards, a failed refresh keeps the last good data and sets `error`, and
// an unchanged payload keeps the previous array so React can bail out of the
// re-render. What changes is only how many sockets that costs.

export const POLL_INTERVAL_MS = 30000

export interface PollSnapshot<T> {
  readonly data: T
  readonly loading: boolean
  readonly error: string | null
}

/** What one attempt to load the resource produced. A load reports failure as a
 *  value rather than throwing so the store never has to guess how to render an
 *  exception, and so each caller keeps its own error wording. */
export type LoadResult<T> = { ok: true; value: T } | { ok: false; error: string }

type Listener = () => void

export class SharedPoll<T> {
  readonly intervalMs: number

  private readonly load: () => Promise<LoadResult<T>>
  private readonly listeners = new Set<Listener>()
  /** Counted separately from `listeners`, because a Set collapses two
   *  subscribers that happen to pass the same function and the timer would
   *  then stop while one of them is still watching. */
  private subscribers = 0
  private snapshot: PollSnapshot<T>
  /** Serialized last payload, so an unchanged answer keeps the old identity. */
  private lastJSON = ''
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight: Promise<void> | null = null

  constructor(load: () => Promise<LoadResult<T>>, initial: T, intervalMs: number = POLL_INTERVAL_MS) {
    this.load = load
    this.intervalMs = intervalMs
    this.snapshot = { data: initial, loading: true, error: null }
  }

  getSnapshot = (): PollSnapshot<T> => this.snapshot

  /** True while a timer is running, i.e. while somebody is watching. */
  get polling(): boolean {
    return this.timer !== null
  }

  get subscriberCount(): number {
    return this.subscribers
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    this.subscribers++
    if (this.subscribers === 1) this.start()
    let live = true
    return () => {
      // React can call an unsubscribe twice; only the first call counts, or the
      // count goes negative and the timer outlives its last subscriber.
      if (!live) return
      live = false
      this.listeners.delete(listener)
      this.subscribers--
      if (this.subscribers === 0) this.stop()
    }
  }

  /** Load now. Concurrent calls share one request — three components each
   *  awaiting a refresh after a write used to mean three GETs. */
  refresh = (): Promise<void> => {
    if (this.inFlight) return this.inFlight
    const attempt = this.run().finally(() => {
      if (this.inFlight === attempt) this.inFlight = null
    })
    this.inFlight = attempt
    return attempt
  }

  private start(): void {
    void this.refresh()
    if (this.timer === null) {
      this.timer = setInterval(() => { void this.refresh() }, this.intervalMs)
    }
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    // The snapshot is kept on purpose. A component that unmounts and comes back
    // — a tab switch, a route change — renders the last answer straight away
    // instead of flashing an empty list, and `start` refreshes it in the same
    // breath. The store is one object per URL, so holding it costs nothing.
  }

  private async run(): Promise<void> {
    let result: LoadResult<T>
    try {
      result = await this.load()
    } catch (err) {
      // `load` is meant to report failure as a value. If one ever throws
      // anyway, that must not become an unhandled rejection on the timer.
      result = { ok: false, error: `${err}` }
    }
    if (!result.ok) {
      this.emit({ data: this.snapshot.data, loading: false, error: result.error })
      return
    }
    const json = JSON.stringify(result.value)
    if (json === this.lastJSON) {
      this.emit({ data: this.snapshot.data, loading: false, error: null })
      return
    }
    this.lastJSON = json
    this.emit({ data: result.value, loading: false, error: null })
  }

  private emit(next: PollSnapshot<T>): void {
    const current = this.snapshot
    if (current.data === next.data && current.loading === next.loading && current.error === next.error) {
      // Nothing a caller can see has changed. Publishing a fresh object here
      // would re-render every subscriber on every tick, which is the cost this
      // whole file exists to remove.
      return
    }
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

/** One store per (auth'd fetch, URL). The table itself is `sharedInstance`,
 *  which the prefs record shares — see that file for why it is keyed on the
 *  fetch function rather than the URL alone. */
export function sharedPoll<T>(owner: object, key: string, create: () => SharedPoll<T>): SharedPoll<T> {
  return sharedInstance(owner, key, create)
}

/** Subscribe to a shared poll for as long as the component is mounted. */
export function useSharedPoll<T>(poll: SharedPoll<T>): PollSnapshot<T> {
  return useSyncExternalStore(poll.subscribe, poll.getSnapshot, poll.getSnapshot)
}

/** GET a JSON array, with the error wording the hooks have always used:
 *  `HTTP <status>` for a refused request and the stringified throw otherwise. */
export async function loadJSONList<T>(fetchFn: FetchFn, url: string): Promise<LoadResult<T[]>> {
  try {
    const res = await fetchFn(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, value: ((await res.json()) as T[] | null) ?? [] }
  } catch (err) {
    return { ok: false, error: `${err}` }
  }
}
