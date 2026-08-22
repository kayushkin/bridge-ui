// Live canary for the global session-list resume contract.
//
//   node scripts/session-list-resume-canary.mjs [<base-url>]     # default http://localhost:8160
//
// `npm run check` drives the store against a fake hub written from reading
// llm-bridge-server's `session_hub.go`. That proves the client's logic and
// proves nothing about whether the fake agrees with the server — a fake
// derived from the same reading as the code it checks can be wrong in exactly
// the same place. This runs the REAL client parser against the REAL hub.
//
// Read-only, deliberately. It opens connections and reads frames; it creates,
// mutates and deletes nothing. Every leg below is reachable without a
// mutation, so this is safe to point at the live gateway:
//
//   1. `hello` carries `stream_id` and one of the three resume words.
//   2. Frames carry an `id:` line, and the client hands it back as `eventId`.
//   3. Reconnecting with the last id seen answers `replayed`.
//   4. Reconnecting with an id from another process answers `gap` — the leg
//      that stops a stale cursor being replayed frames that merely share a
//      number with the ones it missed.
//
// Leg 3 needs one frame to have been published while watching, so it waits for
// natural traffic and reports SKIPPED rather than failing when the box is
// quiet. A skip is not a pass: it says the leg did not run.
import { connectSessionListSSE } from '../src/bridgeSSE.ts'

const BASE = process.argv[2] || 'http://localhost:8160'
const QUIET_WAIT_MS = Number(process.env.CANARY_QUIET_WAIT_MS || 20000)

let failures = 0
let skipped = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`)
  else { console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
}
const skip = (name, why) => { console.log(`  SKIP ${name} — ${why}`); skipped++ }

const fetchFn = (url, opts) => fetch(url, opts)

/**
 * Opens one connection and returns its hello plus the frames seen within
 * `waitMs`, then closes it. `stopAfterFrame` returns early on the first
 * numbered frame, so a busy box does not pay the full wait.
 */
async function collect({ lastEventId = '', waitMs = 1500, stopAfterFrame = false } = {}) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), waitMs)
  const frames = []
  let hello = null
  try {
    for await (const frame of connectSessionListSSE(fetchFn, BASE, lastEventId, abort.signal)) {
      if (frame.type === 'hello') { hello = frame; continue }
      frames.push(frame)
      if (stopAfterFrame) break
    }
  } catch {
    // An aborted read is how every collection ends.
  } finally {
    clearTimeout(timer)
    abort.abort()
  }
  return { hello, frames }
}

console.log(`session-list resume contract — ${BASE}`)

const first = await collect()
if (!first.hello) {
  console.log(`  FAIL no hello frame — is llm-bridge-server up on ${BASE}?`)
  process.exit(1)
}
check('hello carries a stream id', !!first.hello.streamId, JSON.stringify(first.hello))
check('hello carries a resume word the client recognises',
  ['none', 'replayed', 'gap'].includes(first.hello.resume), first.hello.resume)
check('a fresh connect, having asked for nothing, is told there was nothing to replay',
  first.hello.resume === 'none', first.hello.resume)

// A cursor to resume from. Frames only appear when a session changes, so wait
// for natural traffic rather than making some.
console.log(`\nwaiting up to ${Math.round(QUIET_WAIT_MS / 1000)}s for a session to change`)
const withFrame = await collect({ waitMs: QUIET_WAIT_MS, stopAfterFrame: true })
const cursor = withFrame.frames.length ? withFrame.frames[withFrame.frames.length - 1].eventId : ''

if (!cursor) {
  skip('every frame carries an id the client can hand back', 'no session changed while watching')
  skip('resuming from the last id seen is answered "replayed"', 'no session changed while watching')
} else {
  check('every frame carries an id the client can hand back',
    cursor.startsWith(`${withFrame.hello.streamId}-`), cursor)
  const resumed = await collect({ lastEventId: cursor })
  check('resuming from the last id seen is answered "replayed"',
    resumed.hello && resumed.hello.resume === 'replayed',
    resumed.hello ? resumed.hello.resume : 'no hello')
  check('and it is the same stream, so the numbers mean the same thing',
    resumed.hello && resumed.hello.streamId === withFrame.hello.streamId)
}

// The leg that needs no traffic at all: an id this hub did not mint. A hub
// that answered "replayed" here would be replaying frames chosen by a number
// from another process's sequence.
const foreign = await collect({ lastEventId: 'notthishub-1' })
check('an id from another process is answered "gap", never "replayed"',
  foreign.hello && foreign.hello.resume === 'gap',
  foreign.hello ? foreign.hello.resume : 'no hello')

const ahead = await collect({ lastEventId: `${first.hello.streamId}-999999999` })
check('an id ahead of anything published is answered "gap"',
  ahead.hello && ahead.hello.resume === 'gap',
  ahead.hello ? ahead.hello.resume : 'no hello')

console.log(failures === 0
  ? `\nALL PASS${skipped ? ` (${skipped} SKIPPED — a skip is not a pass)` : ''}`
  : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
