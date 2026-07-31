// Render checks for the presentational chat components.
//
// Run with `npm run check`. esbuild bundles this file (which is why it can
// import .ts/.tsx from src directly) and node runs the bundle, so there is
// no test framework to install and nothing to keep in sync with the build.
//
// It asserts on markup from react-dom/server, so it proves what a component
// renders for a given input — not that the app wires that input up. The
// browser canary is what proves the wiring. Both are worth having: a browser
// run cannot be sabotaged cheaply, and this can.
//
// Currently covers the spend-ceiling surfaces. Extend it rather than adding
// a second mechanism.
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { BudgetCeilingBanner, CostBreakdown } from '../src/index.ts'
import { applyEventToRows, sameActivity } from '../src/useBridgeSession.ts'
import { createSSEEventBatcher, isDeferrableEventType } from '../src/sseEventBatching.ts'
import { kanbanPollWouldFetch, preserveUnchangedKanbanPayload } from '../src/useKanban.ts'
import { TurnsView, rowsToTurns } from '../src/components/chat/TurnsView.tsx'
import { harnessIsWorkingOnTurn } from '../src/components/chat/utils.ts'

let failures = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`)
  else { console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
}

console.log('CostBreakdown')
{
  const html = renderToStaticMarkup(h(CostBreakdown, {
    rows: [], fallbackTotalUSD: 0, ceiling: { spendUSD: 3, maxBudgetUSD: 10 },
  }))
  check('under a ceiling renders "$3.00 / $10.00"', html.includes('$3.00 / $10.00'), html)
  check('under 70% carries no tone class', !html.includes('bc-cost-ceiling-warn') && !html.includes('bc-cost-ceiling-crit'), html)
}
{
  const html = renderToStaticMarkup(h(CostBreakdown, {
    rows: [], fallbackTotalUSD: 0, ceiling: { spendUSD: 3, maxBudgetUSD: 2.5 },
  }))
  check('over the ceiling renders "$3.00 / $2.50"', html.includes('$3.00 / $2.50'), html)
  check('over the ceiling is crit', html.includes('bc-cost-ceiling-crit'), html)
}
{
  const html = renderToStaticMarkup(h(CostBreakdown, {
    rows: [], fallbackTotalUSD: 0, ceiling: { spendUSD: 7.5, maxBudgetUSD: 10 },
  }))
  check('at 75% of the ceiling is warn', html.includes('bc-cost-ceiling-warn'), html)
}
{
  // A ceiling with no api_call telemetry is the state a freshly-loaded
  // session is in, and it must still open its drill-down. This branch used
  // to render a bare span, which made the ceiling rows unreachable in
  // exactly the case that reaches it.
  const html = renderToStaticMarkup(h(CostBreakdown, {
    rows: [], fallbackTotalUSD: 0, ceiling: { spendUSD: 3, maxBudgetUSD: 10 },
  }))
  check('ceiling with no telemetry is still clickable', html.includes('bc-cost-clickable') && html.includes('bc-cost-caret'), html)
}
{
  // Nothing spent is "$0.00", not "$0.0000": zero is not a sub-cent
  // quantity and four decimals read as a precise measurement.
  const html = renderToStaticMarkup(h(CostBreakdown, {
    rows: [], fallbackTotalUSD: 0, ceiling: { spendUSD: 0, maxBudgetUSD: 10 },
  }))
  check('nothing spent reads "$0.00 / $10.00"', html.includes('$0.00 / $10.00'), html)
}
{
  // No ceiling and no telemetry: the chip must be exactly what it was before
  // this change existed, i.e. nothing at all.
  const html = renderToStaticMarkup(h(CostBreakdown, { rows: [], fallbackTotalUSD: 0 }))
  check('no ceiling + no cost renders nothing', html === '', JSON.stringify(html))
}
{
  const html = renderToStaticMarkup(h(CostBreakdown, { rows: [], fallbackTotalUSD: 1.25 }))
  check('no ceiling + fallback cost is unchanged', html.includes('$1.25') && !html.includes('bc-cost-ceiling'), html)
}

console.log('BudgetCeilingBanner')
{
  const html = renderToStaticMarkup(h(BudgetCeilingBanner, {
    halt: null, session: null, onRaiseCeiling: async () => null,
  }))
  check('no halt renders nothing', html === '', JSON.stringify(html))
}
{
  const html = renderToStaticMarkup(h(BudgetCeilingBanner, {
    halt: { sessionId: 'br_1', message: 'session has spent $3.00 of its $2.50 ceiling; raise max_budget to continue', spendUSD: 3, maxBudgetUSD: 2.5 },
    session: null,
    onRaiseCeiling: async () => null,
  }))
  check('402 halt names both figures', html.includes('$3.00') && html.includes('$2.50'), html)
  check('402 halt shows no raw JSON', !html.includes('{&quot;error') && !html.includes('budget_exceeded'), html)
  check('402 halt offers the raise control', html.includes('Raise ceiling'), html)
  check('402 halt seeds the input with the breached ceiling', html.includes('value="2.5"'), html)
}
{
  // The mid-turn error event carries a sentence and no numbers. The banner
  // must fall back to the server's words, not print "$0.00 of $0.00".
  const html = renderToStaticMarkup(h(BudgetCeilingBanner, {
    halt: { sessionId: 'br_1', message: 'session halted: spent $9.99 of its $5.00 ceiling. Raise max_budget to continue.' },
    session: null,
    onRaiseCeiling: async () => null,
  }))
  check('halt with no numbers quotes the server', html.includes('session halted: spent $9.99'), html)
  check('halt with no numbers invents no $0.00', !html.includes('$0.00'), html)
}
{
  // Numbers absent from the halt but present on the session row: use the row.
  const html = renderToStaticMarkup(h(BudgetCeilingBanner, {
    halt: { sessionId: 'br_1', message: 'halted' },
    session: { session_id: 'br_1', spend_usd: 4, max_budget_usd: 3.5 },
    onRaiseCeiling: async () => null,
  }))
  check('falls back to the session row for the pair', html.includes('$4.00') && html.includes('$3.50'), html)
}

// --- SSE event batching -----------------------------------------------------
//
// These are not render assertions. They cover the reducer and the frame batcher
// that feeds it, because that path had no repeatable check at all: the O(n^2)
// row-merge fix was verified with a scratch harness that was thrown away.
//
// The load-bearing one is the differential check. Batching is only allowed to be
// faster, never to land on different rows, so it asserts that applying a mixed
// event sequence in frame-sized batches produces exactly what applying it one
// event at a time does.

console.log('\nsameActivity')
{
  check('same kind is unchanged', sameActivity({ kind: 'streaming' }, { kind: 'streaming' }))
  check('different kind is a change', !sameActivity({ kind: 'streaming' }, { kind: 'thinking' }))
  check('same tool is unchanged', sameActivity({ kind: 'tool', name: 'Read' }, { kind: 'tool', name: 'Read' }))
  // The tool name is on screen, so a switch between tools has to re-render even
  // though the kind is identical.
  check('a different tool is a change', !sameActivity({ kind: 'tool', name: 'Read' }, { kind: 'tool', name: 'Edit' }))
}

// A scheduler the test steps by hand. A real frame clock cannot be asserted on:
// the point is what a batch *contained*, which needs the flush to happen when
// the test says so.
function manualScheduler() {
  const queued = new Map()
  let next = 1
  return {
    scheduler: {
      request(callback) { queued.set(next, callback); return next++ },
      cancel(handle) { queued.delete(handle) },
    },
    frames() { return queued.size },
    runFrame() {
      const entries = [...queued.entries()]
      queued.clear()
      for (const [, callback] of entries) callback()
    },
  }
}

let seq = 0
const streamEvent = (messageId, text) => ({
  id: String(++seq),
  type: 'stream',
  data: {
    event_id: seq, message_id: messageId, turn_id: 't1',
    timestamp: '2026-07-31T20:00:00Z',
    stream: { delta: { index: 0, type: 'text_delta', text } },
  },
})
const thinkingDelta = (messageId, text) => ({
  id: String(++seq),
  type: 'stream',
  data: {
    event_id: seq, message_id: messageId, turn_id: 't1',
    timestamp: '2026-07-31T20:00:00Z',
    stream: { delta: { index: 0, type: 'thinking_delta', thinking: text } },
  },
})
const plainEvent = (type, extra) => ({
  id: String(++seq),
  type,
  data: { event_id: seq, turn_id: 't1', timestamp: '2026-07-31T20:00:00Z', ...extra },
})

console.log('\ncreateSSEEventBatcher')
{
  const m = manualScheduler()
  const delivered = []
  const batcher = createSSEEventBatcher(batch => delivered.push(batch), m.scheduler)
  batcher.push(streamEvent('m1', 'a'))
  batcher.push(streamEvent('m1', 'b'))
  batcher.push(streamEvent('m1', 'c'))
  check('three pushes schedule one frame, not three', m.frames() === 1, `frames=${m.frames()}`)
  check('nothing is delivered before the frame runs', delivered.length === 0)
  check('three pending', batcher.pending() === 3, `pending=${batcher.pending()}`)
  m.runFrame()
  check('the frame delivers one batch', delivered.length === 1, `batches=${delivered.length}`)
  check('the batch holds all three, in order',
    delivered[0].length === 3 && delivered[0].map(e => e.data.stream.delta.text).join('') === 'abc',
    JSON.stringify(delivered[0].map(e => e.data.stream.delta.text)))
  check('the buffer is empty afterwards', batcher.pending() === 0)
}
{
  const m = manualScheduler()
  const delivered = []
  const batcher = createSSEEventBatcher(batch => delivered.push(batch), m.scheduler)
  batcher.push(streamEvent('m1', 'a'))
  batcher.pushAndFlush(plainEvent('result', { result: { text: 'done' } }))
  // This is what keeps a `result` handler honest: it runs straight after this
  // call and must see rows that already carry the delta buffered ahead of it.
  check('pushAndFlush delivers immediately', delivered.length === 1, `batches=${delivered.length}`)
  check('the flush carries the buffered delta first, then the event',
    delivered[0].length === 2 && delivered[0][0].type === 'stream' && delivered[0][1].type === 'result',
    JSON.stringify(delivered[0].map(e => e.type)))
  check('the pending frame is cancelled, so it cannot deliver twice', m.frames() === 0, `frames=${m.frames()}`)
  m.runFrame()
  check('running the frame anyway delivers nothing', delivered.length === 1, `batches=${delivered.length}`)
}
{
  const m = manualScheduler()
  const delivered = []
  const batcher = createSSEEventBatcher(batch => delivered.push(batch), m.scheduler)
  batcher.push(streamEvent('m1', 'a'))
  batcher.cancel()
  m.runFrame()
  // A session switch closes the stream and clears the rows. A batch landing a
  // frame later would write the old session's deltas into the new one's pane.
  check('cancel drops the buffer', batcher.pending() === 0)
  check('cancel means the frame delivers nothing', delivered.length === 0, `batches=${delivered.length}`)
}
{
  const m = manualScheduler()
  const delivered = []
  const batcher = createSSEEventBatcher(batch => delivered.push(batch), m.scheduler)
  batcher.flush()
  m.runFrame()
  check('flushing an empty buffer delivers nothing', delivered.length === 0, `batches=${delivered.length}`)
}

console.log('\nkanbanPollWouldFetch')
{
  // These four cases are the guards at useKanban.ts fetchBoards:62 and
  // fetchView:75, restated. If either guard changes, this must change with it —
  // a poll that is scheduled but returns at its first line is a timer doing
  // nothing, which is what the chat pane was running.
  check('the chat pane shape fetches nothing', !kanbanPollWouldFetch(true, false, null))
  check('a board id alone is worth polling', kanbanPollWouldFetch(true, false, 'board_1'))
  check('loading the board list is worth polling', kanbanPollWouldFetch(true, true, null))
  check('disabled never polls', !kanbanPollWouldFetch(false, true, 'board_1'))
}

console.log('\npreserveUnchangedKanbanPayload')
{
  // LinkedKanbanPanel now re-reads its session's cards every 15 seconds,
  // because kanban-store has no notifier and the curator moves cards under an
  // open pane. Most of those reads bring back exactly what is already shown, so
  // the identity guard is what keeps a poll from re-rendering the chat pane
  // once a tick forever. If this stops returning the previous reference for an
  // unchanged payload, the fix turns into a permanent render loop.
  const shown = [{ card_id: 'c1', item: { title: 'Ship it', status: 'open' } }]
  const sameFromServer = [{ card_id: 'c1', item: { title: 'Ship it', status: 'open' } }]
  check('an unchanged payload keeps the previous reference',
    preserveUnchangedKanbanPayload(shown, sameFromServer) === shown)

  const moved = [{ card_id: 'c1', item: { title: 'Ship it', status: 'done' } }]
  check('a card that moved is a new reference',
    preserveUnchangedKanbanPayload(shown, moved) === moved)

  const added = [...shown, { card_id: 'c2', item: { title: 'Second', status: 'open' } }]
  check('a newly linked card is a new reference',
    preserveUnchangedKanbanPayload(shown, added) === added)

  // The empty cases are the ones a failing poll used to reach: before this
  // pass, listCardsForEntity returned [] for an HTTP error, so a blip looked
  // exactly like "this session has no cards". It throws now, and the panel
  // keeps its list — but an honestly empty answer still has to land.
  check('an emptied list is a new reference', preserveUnchangedKanbanPayload(shown, []).length === 0)
  const alreadyEmpty = []
  check('two empty lists keep the previous reference',
    preserveUnchangedKanbanPayload(alreadyEmpty, []) === alreadyEmpty)

  const tags = [{ tag: 'kanban-do-not-track' }]
  check('unchanged tags keep the previous reference',
    preserveUnchangedKanbanPayload(tags, [{ tag: 'kanban-do-not-track' }]) === tags)
  check('a removed tag is a new reference',
    preserveUnchangedKanbanPayload(tags, []) !== tags)
}

console.log('\nclosing a stream commits, switching session discards')
{
  // The hook's two teardown paths are not the same thing, and conflating them
  // costs real text. A stream that dies mid-turn is re-attached by the reconnect
  // effect, and that path closes the old one first — so close has to commit what
  // it is holding. A session switch is about to replace the rows entirely, so it
  // has to throw the same buffer away instead.
  const m = manualScheduler()
  const delivered = []
  const batcher = createSSEEventBatcher(batch => delivered.push(batch), m.scheduler)
  batcher.push(streamEvent('m1', 'half a sentence'))
  batcher.flush() // what closeSSE does
  check('closing a stream commits its buffered deltas', delivered.length === 1, `batches=${delivered.length}`)
  check('and commits the actual text', delivered[0][0].data.stream.delta.text === 'half a sentence')

  batcher.push(streamEvent('m1', 'more'))
  batcher.cancel() // what a session switch does
  m.runFrame()
  check('switching session discards its buffered deltas', delivered.length === 1, `batches=${delivered.length}`)
}

console.log('\nbatched rows == unbatched rows')
{
  // A mixed sequence: two turns of text and thinking deltas with tool calls and
  // their results interleaved, plus the session-state and result events that a
  // real turn carries. 240 events, which is a little over one second of the
  // measured 195 deltas/s.
  const events = []
  for (const turn of ['m1', 'm2']) {
    events.push(plainEvent('user_message', { result: { text: `ask ${turn}` } }))
    for (let i = 0; i < 40; i++) events.push(thinkingDelta(turn, `t${i} `))
    events.push(plainEvent('tool_call', { message_id: turn, tool_call: { tool_id: `${turn}_x`, name: 'Read', input: {} } }))
    for (let i = 0; i < 60; i++) events.push(streamEvent(turn, `w${i} `))
    events.push(plainEvent('tool_result', { message_id: turn, tool_result: { tool_id: `${turn}_x`, content: 'ok' } }))
    events.push(plainEvent('session_state', { state: { state: 'running' } }))
    for (let i = 0; i < 15; i++) events.push(streamEvent(turn, `z${i} `))
    events.push(plainEvent('result', { result: { text: 'done' } }))
  }

  const oneAtATime = events.reduce(applyEventToRows, [])

  // Replay through the real batcher with the same policy the hook applies:
  // stream defers to the next frame, everything else flushes.
  const m = manualScheduler()
  let batched = []
  let batchCount = 0
  const batcher = createSSEEventBatcher(batch => {
    batchCount++
    batched = batch.reduce(applyEventToRows, batched)
  }, m.scheduler)
  events.forEach((ev, i) => {
    if (isDeferrableEventType(ev.type)) batcher.push(ev)
    else batcher.pushAndFlush(ev)
    // A frame boundary every 32 events, so the deltas really do arrive in
    // batches rather than each landing on its own flush.
    if (i % 32 === 31) m.runFrame()
  })
  batcher.flush()

  check(`${events.length} events collapse to ${batchCount} commits`, batchCount < events.length / 4, `commits=${batchCount}`)
  check('same number of rows', batched.length === oneAtATime.length, `${batched.length} vs ${oneAtATime.length}`)
  check('identical rows', JSON.stringify(batched) === JSON.stringify(oneAtATime),
    JSON.stringify(batched.map(r => [r.key, (r.text || '').length, (r.thinking || '').length])) +
    ' vs ' +
    JSON.stringify(oneAtATime.map(r => [r.key, (r.text || '').length, (r.thinking || '').length])))
}

// --- the "streaming…" badge -------------------------------------------------
//
// The badge was on for 48 of 53 finished turns on the live dashboard, because
// it was set by the presence of a streamed text row and never cleared.
// Fixing it needed a completeness signal, and the event log does not carry one
// that holds: over this host's whole log-store, 748 of the 6,897 Claude Code
// turns that produced assistant text emit no result, no turn_complete and no
// error. So the answer is split — the log says which turns are over
// (everything before the last one, whatever the harness emitted), and the
// session state says whether the last one is still running.

console.log('\nharnessIsWorkingOnTurn')
{
  check('generating is working', harnessIsWorkingOnTurn('model_generating'))
  check('a running tool is working', harnessIsWorkingOnTurn('tool_running'))
  check('compacting is working', harnessIsWorkingOnTurn('compacting'))
  check('idle is not working', !harnessIsWorkingOnTurn('idle'))
  check('completed is not working', !harnessIsWorkingOnTurn('completed'))
  // A wait is not production. Both have their own surface — the permission
  // banner and the status chip — and "streaming…" during either is a lie.
  check('awaiting permission is not working', !harnessIsWorkingOnTurn('awaiting_permission'))
  check('rate limited is not working', !harnessIsWorkingOnTurn('rate_limited'))
}

console.log('\nrowsToTurns marks only the last assistant turn')
{
  // message_id is per-event, not per-turn: rowsToTurns drops a result whose
  // message_id matches an already-rendered text row (that is how the final
  // result avoids repeating the streamed text), and reusing one id per turn
  // would erase the streamed text these checks are about.
  const evt = (type, turnId, messageId, extra) => ({
    id: String(++seq),
    type,
    data: { event_id: seq, turn_id: turnId, message_id: messageId, timestamp: '2026-07-31T20:00:00Z', ...extra },
  })
  const delta = (turnId, text) => evt('stream', turnId, `${turnId}_text`, {
    stream: { delta: { index: 0, type: 'text_delta', text } },
  })

  // Three turns that each streamed their text. Only the first was ever closed
  // by a result — the other two are the 11% case, and before this fix all
  // three said "streaming…" forever.
  const rows = [
    evt('user_message', 'ta', 'ta_ask', { result: { text: 'first' } }),
    delta('ta', 'answer a'),
    evt('result', 'ta', 'ta_res', { result: { text: 'answer a' } }),
    evt('user_message', 'tb', 'tb_ask', { result: { text: 'second' } }),
    delta('tb', 'answer b'),
    evt('user_message', 'tc', 'tc_ask', { result: { text: 'third' } }),
    delta('tc', 'answer c'),
  ].reduce(applyEventToRows, [])

  const turns = rowsToTurns(rows)
  const assistant = turns.filter(t => t.actor === 'assistant')
  check('three assistant turns', assistant.length === 3, JSON.stringify(assistant.map(t => t.turnId)))
  check('all three streamed their text', assistant.every(t => t.hasStreamedText))
  check('only the closed turn is turnDone', assistant.filter(t => t.turnDone).length === 1,
    JSON.stringify(assistant.map(t => [t.turnId, t.turnDone])))
  check('exactly one turn is final', assistant.filter(t => t.isFinalAssistantTurn).length === 1,
    JSON.stringify(assistant.map(t => [t.turnId, t.isFinalAssistantTurn])))
  check('and it is the last one', assistant[2].isFinalAssistantTurn === true)

  const renderTurns = working => renderToStaticMarkup(h(TurnsView, {
    rows, agent: 'claude_code', harnessWorking: working, onToggleCollapse: () => {},
  }))

  const live = renderTurns(true)
  check('a working harness marks exactly one turn streaming',
    (live.match(/bc-turns-streaming-tag/g) || []).length === 1,
    `count=${(live.match(/bc-turns-streaming-tag/g) || []).length}`)

  const idle = renderTurns(false)
  check('an idle session marks none', !idle.includes('bc-turns-streaming-tag'), idle)
  // The symptom as it was reported: replayed history of a session that is not
  // running must carry no badge at all, however its turns ended.
  check('and renders no "streaming…" text', !idle.includes('streaming…'), idle)

  // A closed final turn is not live even while the harness works on the next
  // one, so a badge must not follow a result.
  const closedLast = [
    evt('user_message', 'td', 'td_ask', { result: { text: 'fourth' } }),
    delta('td', 'answer d'),
    evt('result', 'td', 'td_res', { result: { text: 'answer d' } }),
  ].reduce(applyEventToRows, [])
  const closedTurn = rowsToTurns(closedLast).filter(t => t.actor === 'assistant')[0]
  check('the closed turn did stream its text', closedTurn.hasStreamedText === true, JSON.stringify(closedTurn))
  check('and it is both final and done', closedTurn.isFinalAssistantTurn === true && closedTurn.turnDone === true)
  const closedHtml = renderToStaticMarkup(h(TurnsView, {
    rows: closedLast, agent: 'claude_code', harnessWorking: true, onToggleCollapse: () => {},
  }))
  check('a closed final turn is never streaming', !closedHtml.includes('bc-turns-streaming-tag'), closedHtml)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
