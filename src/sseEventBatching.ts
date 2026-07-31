// Per-frame batching for a session's event stream.
//
// While a model generates, the stream delivers roughly one event per token.
// Measured on the largest session on this host: 13,776 events, 13,672 of them
// `stream` deltas, arriving at a sustained 195 per second and peaking at 353.
// Each one was its own setState, so React reconciled the whole chat pane — every
// turn row, every markdown tree — several hundred times a second.
//
// A browser paints at most once per animation frame. Every reconciliation but
// the last one in a frame is therefore thrown away before it reaches the screen.
// Collapsing a frame's events into one state commit removes that wasted work and
// cannot delay a visible character: the text still lands on the first frame
// after it arrives, which is the earliest anything can be shown.
//
// This module is mechanism only. It does not know which events are cheap to
// defer — the caller says so by choosing `push` or `pushAndFlush`. That split is
// what keeps ordering exact: an event that also drives session state flushes
// everything buffered ahead of it in the same commit, so its handler never sees
// rows that are missing deltas which arrived first.

import type { BridgeEvent } from './types'

// A scheduler exists so tests can drive flushes by hand. Production uses frames;
// a test uses a queue it steps itself, which is the only way to assert what a
// batch contained without racing a real frame.
export interface FrameScheduler {
  request(callback: () => void): number
  cancel(handle: number): void
}

// requestAnimationFrame is absent under server rendering and in node, where this
// module is imported by the render checks. Resolve per call rather than at import
// time: reading a missing global at import would throw before any caller had a
// chance to pass its own scheduler.
export const animationFrameScheduler: FrameScheduler = {
  request(callback) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(() => callback())
    // 16ms is one frame at 60Hz. This path is a fallback for environments with
    // no frame clock, not a throttle chosen for its own sake.
    return setTimeout(callback, 16) as unknown as number
  },
  cancel(handle) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
    else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
  },
}

// isDeferrableEventType says which events may wait for the next frame.
//
// `stream` is the only high-rate type — 13,672 of the 13,776 events in the
// largest session on this host — and the only one whose handler touches nothing
// but the activity indicator. Everything else drives session state, an error
// banner, a permission prompt or a sessions-list refresh, and those handlers run
// straight after the rows commit, so they must see rows that already carry every
// delta which arrived ahead of them.
//
// The hook and the checks both read this, so a change to the policy cannot pass
// a check that still encodes the old one.
export function isDeferrableEventType(type: string): boolean {
  return type === 'stream'
}

export interface SSEEventBatcher {
  // Buffer an event for delivery on the next frame.
  push(event: BridgeEvent): void
  // Buffer an event and deliver the whole buffer now, in arrival order.
  pushAndFlush(event: BridgeEvent): void
  // Deliver whatever is buffered now. A no-op when nothing is buffered.
  flush(): void
  // Drop everything buffered and any pending frame. Used when the stream this
  // buffer belongs to is closed or the user switches session: delivering those
  // events afterwards would write one session's deltas into another's rows.
  cancel(): void
  // How many events are waiting. For tests and diagnostics.
  pending(): number
}

export function createSSEEventBatcher(
  deliver: (events: BridgeEvent[]) => void,
  scheduler: FrameScheduler = animationFrameScheduler,
): SSEEventBatcher {
  let buffered: BridgeEvent[] = []
  let frame: number | null = null

  const flush = () => {
    if (frame !== null) {
      scheduler.cancel(frame)
      frame = null
    }
    if (buffered.length === 0) return
    const batch = buffered
    buffered = []
    deliver(batch)
  }

  return {
    push(event) {
      buffered.push(event)
      if (frame === null) {
        frame = scheduler.request(() => {
          frame = null
          flush()
        })
      }
    },
    pushAndFlush(event) {
      buffered.push(event)
      flush()
    },
    flush,
    cancel() {
      if (frame !== null) {
        scheduler.cancel(frame)
        frame = null
      }
      buffered = []
    },
    pending() {
      return buffered.length
    },
  }
}
