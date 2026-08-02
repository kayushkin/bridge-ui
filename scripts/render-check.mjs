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
import { applyEventToRows, controlRefusal, deriveSessionUIState, projectServerSessionState, sameActivity } from '../src/useBridgeSession.ts'
import { createSSEEventBatcher, isDeferrableEventType } from '../src/sseEventBatching.ts'
import { kanbanPollWouldFetch, preserveUnchangedKanbanPayload } from '../src/useKanban.ts'
import { SharedPoll, loadJSONList, sharedPoll } from '../src/sharedPoll.ts'
import { bridgePrefsStoreFor, mergePrefs } from '../src/bridgePrefsStore.ts'
import { harnessMapOf, harnessNameKey, harnessNamesFromKey, harnessesPoll } from '../src/useBridgeHarnesses.ts'
import { initialSessionDeeplinkState, readSessionDeeplink, writeSessionParam } from '../src/sessionDeeplink.ts'
import { BridgeContext, DEFAULT_BRIDGE_ROUTES } from '../src/context.ts'
import { BridgeConformance } from '../src/components/BridgeConformance.tsx'
import { applySessionAggregates, sessionTokenTotalsAreMissing } from '../src/components/BridgeSessions.tsx'
import { BridgeSettings } from '../src/components/BridgeSettings.tsx'
import { TurnsView, rowsToTurns } from '../src/components/chat/TurnsView.tsx'
import { groupRowsByTurn } from '../src/components/chat/LogRowView.tsx'
import { Thread } from '../src/components/chat/Thread.tsx'
import {
  THREAD_WINDOW_INITIAL_ROWS, rowCountOfBlock, rowsBeforeWindow, threadBlockKey, threadWindowStart,
} from '../src/components/chat/threadWindow.ts'
import { Timeline, groupTimelineByTurn, rowsToTimeline } from '../src/components/chat/Timeline.tsx'
import {
  TIMELINE_WINDOW_INITIAL_ITEMS, itemCountOfTimelineBlock, itemsBeforeTimelineWindow,
  timelineBlockKey, timelineWindowStart,
} from '../src/components/chat/timelineWindow.ts'
import { harnessIsWorkingOnTurn, sameItemFields, sameRowList, sessionCanBeResumed } from '../src/components/chat/utils.ts'
import { Composer } from '../src/components/chat/Composer.tsx'

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
    rows, agent: 'claude_code', harnessWorking: working, onToggleCollapse: () => {}, sessionId: 'br_check',
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
    rows: closedLast, agent: 'claude_code', harnessWorking: true, onToggleCollapse: () => {}, sessionId: 'br_check',
  }))
  check('a closed final turn is never streaming', !closedHtml.includes('bc-turns-streaming-tag'), closedHtml)
}

// ?session= reconciliation. The two effects in BridgeChat run one commit
// apart, so the ordering these checks pin — a deeplink read, then a stale
// focus value seen in the same commit — is exactly the case that pushed the
// old id back into the URL and made the app re-open it.
console.log('\nsessionDeeplink')
{
  // A URL with no param says nothing, and a restored session claims the bar.
  let st = initialSessionDeeplinkState
  let r = readSessionDeeplink(null, st)
  check('an absent param opens nothing', r.open === null)
  st = r.state
  let w = writeSessionParam('br_restored', st)
  check('a restored session is written into the URL', w.write === true && w.value === 'br_restored')
  st = w.state
  check('and writing again is a no-op', writeSessionParam('br_restored', st).write === false)
  check('our own param is not read back as a deeplink', readSessionDeeplink('br_restored', st).open === null)
}
{
  // The regression that mattered: the write effect sees the pre-deeplink focus
  // in the same commit the read fired in.
  let st = { applied: 'br_open', awaiting: null }
  const r = readSessionDeeplink('br_link', st)
  check('an inbound deeplink opens', r.open === 'br_link')
  st = r.state
  const stale = writeSessionParam('br_open', st)
  check('the stale focus does not overwrite the deeplink', stale.write === false)
  st = stale.state
  check('the deeplink is still pending', st.awaiting === 'br_link')
  const landed = writeSessionParam('br_link', st)
  check('and when focus lands the URL needs no write', landed.write === false)
  st = landed.state
  check('the wait is over once it lands', st.awaiting === null)
  const next = writeSessionParam('br_other', st)
  check('a later session change does write', next.write === true && next.value === 'br_other')
}
{
  // A pending "new chat" (or no pane at all) must not leave a stale id behind.
  const st = { applied: 'br_gone', awaiting: null }
  const w = writeSessionParam(null, st)
  check('a session-less focus clears the param', w.write === true && w.value === null)
  check('and nothing is left applied', w.state.applied === null)
}
{
  // An in-app /?session=<id> link has to work more than once per page load —
  // the old once-only ref meant the second link click did nothing.
  let st = { applied: 'br_a', awaiting: null }
  st = writeSessionParam('br_a', st).state
  const second = readSessionDeeplink('br_b', st)
  check('a second in-app deeplink still opens', second.open === 'br_b')
}

// SharedPoll — the store behind useBridgeInstances/useBridgeMachines. These
// checks drive it directly rather than through React, because what they need
// to pin is how many requests and timers N subscribers cost, and that is
// invisible in rendered markup.
async function sharedPollChecks() {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const after = ms => new Promise(resolve => setTimeout(resolve, ms))

  console.log('SharedPoll — one poll, many subscribers')
  {
    let loads = 0
    const poll = new SharedPoll(async () => { loads++; return { ok: true, value: [{ id: 'a' }] } }, [], 20)
    check('nobody watching means no request', loads === 0 && poll.polling === false)

    const notified = [0, 0, 0]
    const off = [0, 1, 2].map(i => poll.subscribe(() => { notified[i]++ }))
    await settle()
    check('three subscribers cost one request', loads === 1, `loads=${loads}`)
    check('and one timer', poll.polling === true)
    check('all three saw the answer', notified.every(n => n === 1), JSON.stringify(notified))
    check('and read the same array', poll.getSnapshot().data.length === 1 && poll.getSnapshot().loading === false)

    // A fourth component mounting later must not pay for its own request.
    const late = poll.subscribe(() => {})
    await settle()
    check('a late subscriber reuses the answer', loads === 1, `loads=${loads}`)
    late()

    // The interval belongs to the store, so it ticks once for everyone.
    await after(70)
    const ticked = loads
    check('the shared timer ticks once per interval', ticked >= 2 && ticked <= 5, `loads=${ticked}`)

    // Two components can pass the same callback. A Set collapses them into one
    // entry, so counting entries would stop the timer under a live subscriber.
    const same = () => {}
    const offSameA = poll.subscribe(same)
    const offSameB = poll.subscribe(same)
    offSameA()
    check('two subscribers sharing a callback still count as two', poll.subscriberCount === 4, `count=${poll.subscriberCount}`)
    offSameB()

    off[0]()
    off[0]() // React can unsubscribe twice; the count must not go negative.
    off[1]()
    check('still polling while one subscriber remains', poll.polling === true, `count=${poll.subscriberCount}`)
    check('and a repeated unsubscribe did not double-count', poll.subscriberCount === 1, `count=${poll.subscriberCount}`)
    off[2]()
    check('the last one out stops the timer', poll.polling === false && poll.subscriberCount === 0)

    const idle = loads
    await after(70)
    check('and no request fires once nobody is watching', loads === idle, `loads=${loads} idle=${idle}`)

    // Coming back (a tab switch, a route change) renders the last answer at
    // once instead of flashing empty, and refreshes behind it.
    const back = poll.subscribe(() => {})
    check('resubscribing keeps the cached answer', poll.getSnapshot().data.length === 1 && poll.getSnapshot().loading === false)
    await settle()
    check('and refreshes it', loads === idle + 1, `loads=${loads}`)
    back()
  }

  console.log('SharedPoll — what a subscriber sees')
  {
    let payload = [{ id: 'a' }]
    let fail = null
    const poll = new SharedPoll(async () => (fail ? { ok: false, error: fail } : { ok: true, value: payload }), [], 100000)
    let notifications = 0
    const off = poll.subscribe(() => { notifications++ })
    await settle()
    const first = poll.getSnapshot().data
    check('the first answer arrives', first.length === 1 && notifications === 1)

    // Re-serving the same JSON must keep the old array, or every consumer's
    // useMemo recomputes and the pane re-renders on every tick for nothing.
    payload = [{ id: 'a' }]
    await poll.refresh()
    check('an unchanged payload keeps the old array', poll.getSnapshot().data === first)
    check('and notifies nobody', notifications === 1, `notifications=${notifications}`)

    payload = [{ id: 'a' }, { id: 'b' }]
    await poll.refresh()
    check('a changed payload replaces it', poll.getSnapshot().data.length === 2)
    check('and notifies once', notifications === 2, `notifications=${notifications}`)

    const good = poll.getSnapshot().data
    fail = 'HTTP 503'
    await poll.refresh()
    check('a failed refresh keeps the last good data', poll.getSnapshot().data === good)
    check('and reports the error', poll.getSnapshot().error === 'HTTP 503')
    check('and does not go back to loading', poll.getSnapshot().loading === false)

    fail = null
    await poll.refresh()
    check('recovering clears the error', poll.getSnapshot().error === null)
    off()
  }

  console.log('SharedPoll — concurrent refreshes')
  {
    let loads = 0
    // Every in-flight load is held here, not just the newest: if the dedupe
    // ever breaks, this check must still finish and report, not deadlock on a
    // request nobody kept a handle to.
    const held = []
    const poll = new SharedPoll(async () => {
      loads++
      await new Promise(resolve => held.push(resolve))
      return { ok: true, value: [] }
    }, [], 100000)
    const releaseAll = () => { while (held.length) held.pop()() }

    // Three components each awaiting a refresh after a write used to be three
    // GETs of the same URL.
    const all = Promise.all([poll.refresh(), poll.refresh(), poll.refresh()])
    await settle()
    check('three concurrent refreshes share one request', loads === 1, `loads=${loads}`)
    releaseAll()
    await all
    // Sharing is only for requests in flight — once one lands, the next
    // refresh must actually go to the server.
    const next = poll.refresh()
    await settle()
    releaseAll()
    await next
    check('and a later refresh is a new request', loads === 2, `loads=${loads}`)
  }

  console.log('SharedPoll — loading, and a load that throws')
  {
    const poll = new SharedPoll(async () => { throw new Error('boom') }, [], 100000)
    check('loading is true before the first attempt settles', poll.getSnapshot().loading === true)
    await poll.refresh()
    check('a throwing load does not stay loading', poll.getSnapshot().loading === false)
    check('and is reported, not swallowed', poll.getSnapshot().error === 'Error: boom', String(poll.getSnapshot().error))
  }

  console.log('SharedPoll — the registry')
  {
    const ownerA = () => {}
    const ownerB = () => {}
    const make = () => new SharedPoll(async () => ({ ok: true, value: [] }), [], 100000)
    const first = sharedPoll(ownerA, 'instances /api/bridge', make)
    check('the same fetch and URL get the same store', sharedPoll(ownerA, 'instances /api/bridge', make) === first)
    check('a different URL gets its own', sharedPoll(ownerA, 'machines /api/bridge', make) !== first)
    // Two providers can serve one basePath with different credentials; sharing
    // across them would serve one tenant's answer to the other.
    check('a different fetch gets its own', sharedPoll(ownerB, 'instances /api/bridge', make) !== first)
  }

  console.log('loadJSONList — the error wording the hooks have always used')
  {
    const ok = await loadJSONList(async () => ({ ok: true, json: async () => [{ id: 'a' }] }), '/u')
    check('a good response yields the list', ok.ok === true && ok.value.length === 1)

    const nullBody = await loadJSONList(async () => ({ ok: true, json: async () => null }), '/u')
    check('a null body reads as an empty list', nullBody.ok === true && nullBody.value.length === 0)

    const refused = await loadJSONList(async () => ({ ok: false, status: 500, json: async () => null }), '/u')
    check('a refused request reads "HTTP 500"', refused.ok === false && refused.error === 'HTTP 500', JSON.stringify(refused))

    const threw = await loadJSONList(async () => { throw new TypeError('offline') }, '/u')
    check('a thrown fetch keeps its own wording', threw.ok === false && threw.error === 'TypeError: offline', JSON.stringify(threw))
  }

  console.log('useBridgeHarnesses — the harness list, shared')
  {
    // The store is keyed on the URL, so the harnesses poll must not read the
    // answer the instances poll already put in the registry under the same fetch.
    const owner = () => {}
    const make = () => new SharedPoll(async () => ({ ok: true, value: [] }), [], 100000)
    const store = harnessesPoll(owner, '/api/bridge')
    check(
      'every caller of the harnesses hook gets one store',
      harnessesPoll(owner, '/api/bridge') === store,
    )
    check(
      'the hook does not read the instances answer',
      sharedPoll(owner, 'instances /api/bridge', make) !== store,
    )
    check(
      'the hook does not read the machines answer',
      sharedPoll(owner, 'machines /api/bridge', make) !== store,
    )
    check('a second basePath gets its own store', harnessesPoll(owner, '/api/other') !== store)
    // Two dashboards behind different credentials must not share an answer.
    check('a second provider gets its own store', harnessesPoll(() => {}, '/api/bridge') !== store)
  }
  {
    const list = [
      { name: 'claude_code', label: 'Claude Code', available: true },
      { name: 'codex', label: 'Codex', available: false },
    ]
    const map = harnessMapOf(list)
    check('the map is keyed on name', map.get('claude_code')?.label === 'Claude Code')
    check('an unregistered harness has no entry', map.get('nope') === undefined)
    check('an empty list yields an empty map', harnessMapOf([]).size === 0)
  }
  {
    // The settings form seeds editable state per harness. Polling means an
    // availability flip now arrives mid-edit; keyed on the name set, that tick
    // must not reseed the form and discard what the user typed.
    const before = [{ name: 'claude_code', available: false }, { name: 'codex', available: true }]
    const flipped = [{ name: 'claude_code', available: true }, { name: 'codex', available: true }]
    const added = [...flipped, { name: 'aider', available: true }]
    check('a harness coming available does not change the key', harnessNameKey(before) === harnessNameKey(flipped))
    check('a harness appearing does change the key', harnessNameKey(flipped) !== harnessNameKey(added))
    check('an empty list round-trips to no names', harnessNamesFromKey(harnessNameKey([])).length === 0)
    check('the key round-trips to the names it was built from',
      harnessNamesFromKey(harnessNameKey(added)).join() === 'claude_code,codex,aider')
    // A joined key would merge these two into one string and read the pair as
    // the single harness, hiding exactly the membership change this catches.
    check('two names cannot run together into one',
      harnessNameKey([{ name: 'a' }, { name: 'b' }]) !== harnessNameKey([{ name: 'a\nb' }]))
  }

  console.log('the sessions list token column')
  {
    // The column used to fetch every session's FULL message history and add
    // the usage up in the browser — 306MB and 52s for one long session, which
    // is why it was capped at 30 rows. It reads log-store's per-session
    // aggregate now. These pin the two halves that make one request enough:
    // when to ask, and that the answer settles.
    const rows = [
      { session_id: 'a', state: 'idle' },
      { session_id: 'b', state: 'running' },
      { session_id: 'gone', state: 'idle' },
      { session_id: 'never-ran', state: 'empty' },
    ]
    const aggregates = [
      { session_id: 'a', input_tokens: 5503, output_tokens: 8535 },
      { session_id: 'b', input_tokens: 7, output_tokens: 159 },
      { session_id: 'unrelated', input_tokens: 1, output_tokens: 1 },
    ]
    check('an empty map with rows on screen asks the server',
      sessionTokenTotalsAreMissing(rows, new Map()))
    check('a session that never took a turn is not worth asking about',
      !sessionTokenTotalsAreMissing([{ session_id: 'never-ran', state: 'empty' }], new Map()))

    const settled = applySessionAggregates(new Map(), aggregates, rows)
    check('a row takes both totals from its aggregate',
      settled.get('a')?.input === 5503 && settled.get('a')?.output === 8535,
      JSON.stringify(settled.get('a')))
    // log-store omits sessions with no usage. Left absent they read as missing
    // forever, and the page re-fetches the whole aggregate on every render.
    check('a row the aggregate omits settles at zero',
      settled.get('gone')?.input === 0 && settled.get('gone')?.output === 0,
      JSON.stringify(settled.get('gone')))
    check('one response answers every row on screen',
      !sessionTokenTotalsAreMissing(rows, settled))
    check('a session that never took a turn stays out of the map',
      !settled.has('never-ran'))
    // A row arriving after the fetch is the only thing that should ask again.
    check('a newly-appeared row asks again',
      sessionTokenTotalsAreMissing([...rows, { session_id: 'new', state: 'idle' }], settled))
  }

  console.log('the components that used to fetch /harnesses themselves')
  {
    // These five components each owned an inline fetch of the list. They read
    // the shared store now, and nothing else here proves they are still wired
    // to it — a hook that returned an empty list would leave the pages looking
    // structurally fine and simply missing every harness.
    //
    // Rendering them against a populated store is what catches that. Only the
    // two that put harness markup on screen at rest are covered: BridgeInstances
    // hides its list behind an unopened form, and BridgeChat and BridgeSessions
    // want a router.
    const harnesses = [
      { name: 'claude_code', label: 'Claude Code', image: '/images/harnesses/claude_code.png', available: true, capabilities: ['model', 'effort', 'budget', 'tools'] },
      { name: 'codex', label: 'Codex', image: null, available: false, capabilities: ['model'] },
    ]
    const basePath = '/api/bridge'
    const fetchFn = async url => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith('/harnesses') ? harnesses : []),
    })
    await harnessesPoll(fetchFn, basePath).refresh()
    const config = { fetch: fetchFn, basePath, routes: DEFAULT_BRIDGE_ROUTES }
    const render = Component =>
      renderToStaticMarkup(h(BridgeContext.Provider, { value: config }, h(Component)))

    const conformance = render(BridgeConformance)
    check('the conformance matrix has a row per harness',
      conformance.includes('Claude Code') && conformance.includes('Codex'), conformance.slice(0, 200))
    check('an empty matrix does not read as "No harnesses registered"',
      !conformance.includes('No harnesses registered'))

    const settings = render(BridgeSettings)
    check('the settings page has a card per harness',
      settings.includes('Claude Code') && settings.includes('Codex'), settings.slice(0, 200))
    // A HarnessInfo's `image` is server-relative, so a caller with only the map
    // and no basePath renders a broken logo.
    check('a harness logo resolves against basePath',
      settings.includes('/api/bridge/images/harnesses/claude_code.png'), settings.slice(0, 300))
    // Asserted on the badge class, not the word: the card's own
    // `bset-unavailable` modifier contains "unavailable" as a substring, so a
    // looser check passes with the badge deleted.
    check('a harness the server reports down is badged',
      settings.includes('bset-unavail-badge'))
    check('a harness the server reports up is not badged',
      settings.split('bset-unavail-badge').length - 1 === 1, settings.slice(0, 300))
  }
}

// --- the row-memo boundaries -----------------------------------------------
//
// Every chat pane memoizes its row, and all three rest on one property of the
// reducer: `applyEventToRows` replaces only the row an event touched and hands
// back every other row by the same reference. If that ever stopped holding,
// each memo would silently degrade to "always re-render" — no error, no
// failing render, just the cost back. So assert the premise itself, then the
// two comparators that read it. Item counts and element counts for real
// sessions come from `npm run pane-cost`; this proves the mechanism.
console.log('\nrow-memo boundaries')
{
  let seq = 0
  const evt = (type, turnId, messageId, extra = {}) => ({
    type,
    data: { event_id: ++seq, turn_id: turnId, message_id: messageId, timestamp: '2026-07-31T20:00:00Z', ...extra },
  })
  const delta = (turnId, text) => evt('stream', turnId, `${turnId}_text`, {
    stream: { delta: { index: 0, type: 'text_delta', text } },
  })

  // Two finished turns and a third that is still streaming — the shape of a
  // long session with one live turn at the bottom, which is the case the memo
  // exists for.
  const before = [
    evt('user_message', 'ta', 'ta_ask', { result: { text: 'first' } }),
    delta('ta', 'answer a'),
    evt('result', 'ta', 'ta_res', { result: { text: 'answer a' } }),
    evt('user_message', 'tb', 'tb_ask', { result: { text: 'second' } }),
    delta('tb', 'answer b'),
    evt('result', 'tb', 'tb_res', { result: { text: 'answer b' } }),
    evt('user_message', 'tc', 'tc_ask', { result: { text: 'third' } }),
    delta('tc', 'answer '),
  ].reduce(applyEventToRows, [])

  // One more delta on the live turn: exactly what an SSE frame carries.
  const after = applyEventToRows(before, delta('tc', 'c'))

  check('a delta appends no row', after.length === before.length, `${before.length} → ${after.length}`)
  const movedRows = before.filter((r, i) => r !== after[i])
  check('a delta replaces exactly one row object', movedRows.length === 1,
    JSON.stringify(movedRows.map(r => r.key)))
  check('and it is the row the delta named', movedRows[0]?.turnId === 'tc',
    JSON.stringify(movedRows.map(r => [r.key, r.turnId])))

  // sameRowList — the Thread comparator. It reads identity, so it must call an
  // untouched turn's rows equal and a touched turn's rows different.
  const blocksBefore = groupRowsByTurn(before)
  const blocksAfter = groupRowsByTurn(after)
  const turnBlocks = blocksBefore.filter(b => b.kind === 'turn')
  check('the log groups into three turns', turnBlocks.length === 3, JSON.stringify(blocksBefore.map(b => b.kind)))
  const sameness = turnBlocks.map((b, i) => sameRowList(b.rows, blocksAfter.filter(x => x.kind === 'turn')[i].rows))
  check('sameRowList skips the two untouched turns', sameness[0] === true && sameness[1] === true,
    JSON.stringify(sameness))
  check('sameRowList re-renders the turn the delta hit', sameness[2] === false, JSON.stringify(sameness))
  check('sameRowList is false for a different length', !sameRowList(before, before.slice(1)))
  check('sameRowList is true for the very same array', sameRowList(before, before))

  // sameItemFields — the Turns and Timeline comparator. Those panes rebuild
  // every item on every delta, so identity is always different and the fields
  // are the whole test.
  const turnsBefore = rowsToTurns(before)
  const turnsAfter = rowsToTurns(after)
  check('every turns item is a fresh object', turnsBefore.every((it, i) => it !== turnsAfter[i]))
  check('same number of turns items', turnsBefore.length === turnsAfter.length,
    `${turnsBefore.length} vs ${turnsAfter.length}`)
  const changed = turnsBefore.map((it, i) => !sameItemFields(it, turnsAfter[i]))
  check('sameItemFields skips every item but the one that grew',
    changed.filter(Boolean).length === 1, JSON.stringify(turnsBefore.map((it, i) => [it.key, changed[i]])))
  check('and the one it re-renders is the streaming turn',
    turnsAfter[changed.indexOf(true)].turnId === 'tc',
    JSON.stringify(turnsAfter[changed.indexOf(true)]))

  // A field added to either item type must be compared from the moment it is
  // added — the comparator walks the item's own keys rather than a list it
  // would have to be reminded to extend.
  const item = turnsBefore[0]
  check('sameItemFields sees a field the other side does not have',
    !sameItemFields(item, { ...item, aFieldNobodyListed: 1 }))
  check('sameItemFields sees a changed value', !sameItemFields(item, { ...item, ts: 'moved' }))
  check('sameItemFields is true for a structural copy', sameItemFields(item, { ...item }))

  // The extraction of TurnRow out of TurnsView's map must not have changed
  // what the pane renders. Assert on the markup rather than trusting the diff.
  const html = renderToStaticMarkup(h(TurnsView, {
    rows: after, agent: 'claude_code', harnessWorking: true, onToggleCollapse: () => {}, sessionId: 'br_check',
  }))
  check('the pane still renders one item per turns item',
    (html.match(/bc-turns-item/g) || []).length === turnsAfter.length,
    `${(html.match(/bc-turns-item/g) || []).length} vs ${turnsAfter.length}`)
  check('the live turn still carries its badge', html.includes('bc-turns-streaming-tag'), html.slice(0, 400))
  check('the finished turns still render their text', html.includes('answer a') && html.includes('answer b'))
}

// --- the Thread window ------------------------------------------------------
//
// Thread renders the newest `THREAD_WINDOW_INITIAL_ROWS` rows and leaves the
// rest behind a button. Measured with `npm run pane-cost` on the largest
// session on this host, that takes the pane from 80,606 elements to 3,773.
//
// Two things must hold for that to be a saving rather than a bug: the window
// must always contain the newest rows (the live turn is the one the user is
// watching), and it must never cut a turn in half (a turn header states its
// own event count). Both are asserted here on the block list the pane
// actually renders, and the markup assertions below prove the pane reads the
// window rather than merely computing it.
console.log('\nThread window')
{
  let seq = 0
  const evt = (type, turnId, messageId, extra = {}) => ({
    type,
    data: { event_id: ++seq, turn_id: turnId, message_id: messageId, timestamp: '2026-08-01T14:00:00Z', ...extra },
  })

  // 60 turns of 6 rows each = 360 rows, plus a standalone system row between
  // every pair of turns. Enough to overrun a 100-row budget many times over
  // and to put both block kinds on both sides of the window edge.
  const events = []
  for (let t = 0; t < 60; t++) {
    const turn = `t${t}`
    events.push(evt('system', undefined, `sys_pre_${t}`, { system: { message: `system note ${t}` } }))
    events.push(evt('user_message', turn, `${turn}_ask`, { result: { text: `question ${t}` } }))
    events.push(evt('stream', turn, `${turn}_text`, { stream: { delta: { index: 0, type: 'text_delta', text: `answer ${t}` } } }))
    events.push(evt('tool_call', turn, `${turn}_tool`, { tool_call: { tool_id: `tool_${t}`, name: 'Read', input: {} } }))
    events.push(evt('tool_result', turn, `${turn}_tool`, { tool_result: { tool_id: `tool_${t}`, content: 'ok' } }))
    events.push(evt('result', turn, `${turn}_res`, { result: { text: `answer ${t}` } }))
  }
  const rows = events.reduce(applyEventToRows, [])
  const blocks = groupRowsByTurn(rows)
  const totalRows = blocks.reduce((n, b) => n + rowCountOfBlock(b), 0)

  check('the synthetic log groups into turns and standalone rows',
    blocks.some(b => b.kind === 'turn') && blocks.some(b => b.kind === 'standalone'),
    JSON.stringify(blocks.slice(0, 4).map(b => b.kind)))
  check('every row lands in exactly one block', totalRows === rows.length,
    `${totalRows} vs ${rows.length}`)

  const start = threadWindowStart(blocks, 100)
  check('a budget smaller than the log windows it', start > 0, `start=${start}`)
  const windowed = blocks.slice(start)
  const windowRows = windowed.reduce((n, b) => n + rowCountOfBlock(b), 0)

  // The budget is a floor, not a ceiling: the block that crosses it is
  // rendered whole. Both halves matter — meeting the budget is what makes the
  // window usable, and not exceeding it by more than one block is what makes
  // it a bound.
  check('the window holds at least the budget', windowRows >= 100, `${windowRows} rows`)
  check('and overshoots by at most the block that crossed it',
    windowRows - rowCountOfBlock(blocks[start]) < 100,
    `${windowRows} rows, first block ${rowCountOfBlock(blocks[start])}`)
  check('no block is split — the window is a suffix of the block list',
    windowed.every((b, i) => b === blocks[start + i]) && windowed.length === blocks.length - start)

  // The newest rows are the point of the window. If it ever slid off the end
  // the pane would open showing history and not the live turn.
  check('the window ends at the newest block', windowed[windowed.length - 1] === blocks[blocks.length - 1])
  check('rowsBeforeWindow and the window account for every row',
    rowsBeforeWindow(blocks, start) + windowRows === totalRows,
    `${rowsBeforeWindow(blocks, start)} + ${windowRows} vs ${totalRows}`)

  check('an infinite budget renders the whole log', threadWindowStart(blocks, Number.POSITIVE_INFINITY) === 0)
  check('a budget larger than the log renders the whole log', threadWindowStart(blocks, totalRows + 1) === 0)
  check('an empty log windows to nothing', threadWindowStart([], 100) === 0)
  check('rowsBeforeWindow of an unwindowed pane is zero', rowsBeforeWindow(blocks, 0) === 0)

  // The hold that keeps the window still while the user is scrolled up is
  // keyed on this. A delta into the live turn must not change the key of any
  // earlier block, or the hold would lapse on every frame of streaming and
  // the window would slide under the user after all.
  const keysBefore = blocks.map(threadBlockKey)
  const keysAfterDelta = groupRowsByTurn(applyEventToRows(rows, evt('stream', 't59', 't59_text', {
    stream: { delta: { index: 0, type: 'text_delta', text: ' more' } },
  }))).map(threadBlockKey)
  check('a delta changes no block key', keysBefore.every((k, i) => k === keysAfterDelta[i]),
    JSON.stringify(keysBefore.map((k, i) => [k, keysAfterDelta[i]]).filter(([a, b]) => a !== b).slice(0, 3)))

  // And a turn GROWING A ROW must not change its key either. A live turn
  // gains a row every time a tool is called, so a key that folded in the
  // turn's size would lapse the hold several times a turn — and a text delta
  // alone does not reach that, because it merges into a row that already
  // exists.
  const withTool = applyEventToRows(rows, evt('tool_call', 't59', 't59_late', {
    tool_call: { tool_id: 'tool_late', name: 'Bash', input: {} },
  }))
  const grownBlocks = groupRowsByTurn(withTool)
  const keysAfterRow = grownBlocks.map(threadBlockKey)
  check('the live turn gained a row', grownBlocks[grownBlocks.length - 1].rows?.length
    > blocks[blocks.length - 1].rows?.length,
    `${blocks[blocks.length - 1].rows?.length} -> ${grownBlocks[grownBlocks.length - 1].rows?.length}`)
  check('and a new row in a turn changes no block key',
    keysBefore.every((k, i) => k === keysAfterRow[i]),
    JSON.stringify(keysBefore.map((k, i) => [k, keysAfterRow[i]]).filter(([a, b]) => a !== b).slice(0, 3)))
  check('block keys are unique', new Set(keysBefore).size === keysBefore.length,
    `${new Set(keysBefore).size} of ${keysBefore.length}`)

  // `groupRowsByTurn` groups CONSECUTIVE rows, so one turn interrupted by a
  // row carrying no turn id becomes two blocks with the same turn id. Keying
  // on the turn id alone would make them indistinguishable, and the hold —
  // which resolves a key back to an index — would land on the wrong one and
  // move the window under the user.
  const splitBlocks = groupRowsByTurn([
    evt('user_message', 'sp', 'sp_ask', { result: { text: 'ask' } }),
    evt('system', undefined, 'sp_sys', { system: { message: 'interruption' } }),
    evt('result', 'sp', 'sp_res', { result: { text: 'answer' } }),
  ].reduce(applyEventToRows, []))
  check('one interrupted turn becomes two turn blocks',
    splitBlocks.filter(b => b.kind === 'turn').length === 2,
    JSON.stringify(splitBlocks.map(b => b.kind)))
  check('and its two halves carry the same turn id',
    splitBlocks.filter(b => b.kind === 'turn').every(b => b.turnId === 'sp'))
  check('but not the same block key',
    new Set(splitBlocks.map(threadBlockKey)).size === splitBlocks.length,
    JSON.stringify(splitBlocks.map(threadBlockKey)))

  // And the pane itself. THREAD_WINDOW_INITIAL_ROWS is what it opens with, so
  // assert against a log built to exceed it rather than against the constant.
  const bigRows = (() => {
    const evs = []
    for (let t = 0; t < 500; t++) {
      const turn = `b${t}`
      evs.push(evt('user_message', turn, `${turn}_ask`, { result: { text: `ask ${t}` } }))
      evs.push(evt('result', turn, `${turn}_res`, { result: { text: `reply ${t}` } }))
    }
    return evs.reduce(applyEventToRows, [])
  })()
  check('the big log exceeds the pane default', bigRows.length > THREAD_WINDOW_INITIAL_ROWS,
    `${bigRows.length} vs ${THREAD_WINDOW_INITIAL_ROWS}`)

  const bigHtml = renderToStaticMarkup(h(Thread, {
    rows: bigRows, loading: false, error: null, agent: 'claude_code', sessionId: 'br_check',
  }))
  check('a long log renders the earlier-events control', bigHtml.includes('bc-pane-earlier'), bigHtml.slice(0, 300))
  check('it offers both show-earlier and show-all',
    (bigHtml.match(/bc-pane-earlier-btn/g) || []).length === 2)
  check('the oldest turn is not in the markup', !bigHtml.includes('ask 0<') && !bigHtml.includes('reply 0<'))
  check('the newest turn is', bigHtml.includes('reply 499'), bigHtml.slice(-400))
  check('the windowed pane renders far fewer rows than the log holds',
    (bigHtml.match(/bc-row /g) || []).length < bigRows.length / 2,
    `${(bigHtml.match(/bc-row /g) || []).length} rows in markup, ${bigRows.length} in the log`)

  // A log that fits must look exactly like it did before any of this: no
  // control, nothing withheld. This is the case every live session starts in.
  // Several blocks, so that "not windowed" is a real answer rather than the
  // arithmetic one — a single-block log cannot be windowed at any budget,
  // because a block is never split.
  const smallEvents = [evt('user_message', 's1', 's1_ask', { result: { text: 'only question' } })]
  for (let t = 0; t < 6; t++) smallEvents.push(evt('system', undefined, `smallsys_${t}`, { system: { message: `note ${t}` } }))
  smallEvents.push(evt('result', 's1', 's1_res', { result: { text: 'only answer' } }))
  const smallRows = smallEvents.reduce(applyEventToRows, [])
  check('the short log is several blocks', groupRowsByTurn(smallRows).length > 2,
    `${groupRowsByTurn(smallRows).length} blocks`)
  const smallHtml = renderToStaticMarkup(h(Thread, {
    rows: smallRows, loading: false, error: null, agent: 'claude_code', sessionId: 'br_check',
  }))
  check('a short log renders no earlier-events control', !smallHtml.includes('bc-pane-earlier'))
  check('and renders all of its rows', smallHtml.includes('only question') && smallHtml.includes('only answer'))
}

// --- the Timeline window ----------------------------------------------------
//
// Once Thread was windowed, Timeline became the largest chat pane: measured
// with `npm run pane-cost` on the same session, 11,510 elements and 2,386 KB
// against Thread's windowed 3,773 and 196 KB. It windows the same way and the
// same two things must hold — the window always contains the newest items,
// and it never cuts a turn group in half.
//
// The item list is asserted separately from the markup because the pane's
// header still counts the WHOLE session while the body renders a suffix of
// it, and a check that only read the markup could not tell those apart.
console.log('\nTimeline window')
{
  let seq = 0
  const evt = (type, turnId, messageId, extra = {}) => ({
    type,
    data: { event_id: ++seq, turn_id: turnId, message_id: messageId, timestamp: '2026-08-01T14:00:00Z', ...extra },
  })

  // 60 turns of 4 timeline items each, with an error carrying no turn id
  // between every pair. Enough to overrun a 100-item budget many times over,
  // to put both block kinds on both sides of the window edge, and — the part
  // that matters for the key checks — to END on a turn, so that adding an
  // event to the newest turn GROWS a block rather than appending a new one.
  const events = []
  for (let t = 0; t < 60; t++) {
    const turn = `t${t}`
    events.push(evt('error', undefined, `err_${t}`, { error: { message: `detached error ${t}` } }))
    events.push(evt('user_message', turn, `${turn}_ask`, { result: { text: `question ${t}` } }))
    events.push(evt('stream', turn, `${turn}_text`, { stream: { delta: { index: 0, type: 'text_delta', text: `answer ${t}` } } }))
    events.push(evt('tool_call', turn, `${turn}_tool`, { tool_call: { tool_id: `tool_${t}`, name: 'Read', input: {} } }))
    events.push(evt('tool_result', turn, `${turn}_tool`, { tool_result: { tool_id: `tool_${t}`, content: 'ok' } }))
    events.push(evt('result', turn, `${turn}_res`, { result: { text: `answer ${t}` } }))
  }
  const rows = events.reduce(applyEventToRows, [])
  const items = rowsToTimeline(rows)
  const blocks = groupTimelineByTurn(items)
  const totalItems = blocks.reduce((n, b) => n + itemCountOfTimelineBlock(b), 0)

  check('the synthetic session groups into turns and standalone items',
    blocks.some(b => b.kind === 'turn') && blocks.some(b => b.kind === 'standalone'),
    JSON.stringify(blocks.slice(0, 4).map(b => b.kind)))
  check('every timeline item lands in exactly one block', totalItems === items.length,
    `${totalItems} vs ${items.length}`)
  check('and the last block is a turn, so growing it is what the key checks test',
    blocks[blocks.length - 1].kind === 'turn')

  const start = timelineWindowStart(blocks, 100)
  check('a budget smaller than the session windows it', start > 0, `start=${start}`)
  const windowed = blocks.slice(start)
  const windowItems = windowed.reduce((n, b) => n + itemCountOfTimelineBlock(b), 0)

  check('the window holds at least the budget', windowItems >= 100, `${windowItems} items`)
  check('and overshoots by at most the block that crossed it',
    windowItems - itemCountOfTimelineBlock(blocks[start]) < 100,
    `${windowItems} items, first block ${itemCountOfTimelineBlock(blocks[start])}`)
  check('no block is split — the window is a suffix of the block list',
    windowed.every((b, i) => b === blocks[start + i]) && windowed.length === blocks.length - start)
  check('the window ends at the newest block', windowed[windowed.length - 1] === blocks[blocks.length - 1])
  check('itemsBeforeTimelineWindow and the window account for every item',
    itemsBeforeTimelineWindow(blocks, start) + windowItems === totalItems,
    `${itemsBeforeTimelineWindow(blocks, start)} + ${windowItems} vs ${totalItems}`)

  check('an infinite budget renders the whole session', timelineWindowStart(blocks, Number.POSITIVE_INFINITY) === 0)
  check('a budget larger than the session renders the whole session',
    timelineWindowStart(blocks, totalItems + 1) === 0)
  check('an empty session windows to nothing', timelineWindowStart([], 100) === 0)
  check('itemsBeforeTimelineWindow of an unwindowed pane is zero',
    itemsBeforeTimelineWindow(blocks, 0) === 0)

  // The hold that keeps the window still while the user is scrolled up
  // resolves this key back to an index, and it is also the React key of every
  // turn group. A delta into the live turn must change neither, or the hold
  // would lapse on every frame of streaming and React would remount the group.
  const keysBefore = blocks.map(timelineBlockKey)
  const keysAfterDelta = groupTimelineByTurn(rowsToTimeline(applyEventToRows(rows, evt('stream', 't59', 't59_text', {
    stream: { delta: { index: 0, type: 'text_delta', text: ' more' } },
  })))).map(timelineBlockKey)
  check('a delta changes no block key', keysBefore.every((k, i) => k === keysAfterDelta[i]),
    JSON.stringify(keysBefore.map((k, i) => [k, keysAfterDelta[i]]).filter(([a, b]) => a !== b).slice(0, 3)))

  // And a turn GROWING AN ITEM must not change its key either — a live turn
  // gains one every time a tool is called. A text delta alone does not reach
  // this, because it merges into an item that already exists.
  const grownBlocks = groupTimelineByTurn(rowsToTimeline(applyEventToRows(rows, evt('tool_call', 't59', 't59_late', {
    tool_call: { tool_id: 'tool_late', name: 'Bash', input: {} },
  }))))
  check('the live turn gained an item',
    grownBlocks[grownBlocks.length - 1].items.length > blocks[blocks.length - 1].items.length,
    `${blocks[blocks.length - 1].items.length} -> ${grownBlocks[grownBlocks.length - 1].items.length}`)
  check('and a new item in a turn changes no block key',
    keysBefore.every((k, i) => k === grownBlocks.map(timelineBlockKey)[i]),
    JSON.stringify(keysBefore.map((k, i) => [k, grownBlocks.map(timelineBlockKey)[i]]).filter(([a, b]) => a !== b).slice(0, 3)))
  check('block keys are unique', new Set(keysBefore).size === keysBefore.length,
    `${new Set(keysBefore).size} of ${keysBefore.length}`)

  // `groupTimelineByTurn` groups CONSECUTIVE items, so one turn interrupted by
  // an item carrying no turn id becomes two blocks with the same turn id.
  // Keying on the turn id alone would make them indistinguishable — the hold
  // would land on the wrong one and move the window under the user, and React
  // would see one duplicated key.
  const splitBlocks = groupTimelineByTurn(rowsToTimeline([
    evt('user_message', 'sp', 'sp_ask', { result: { text: 'ask' } }),
    evt('error', undefined, 'sp_err', { error: { message: 'interruption' } }),
    evt('result', 'sp', 'sp_res', { result: { text: 'answer' } }),
  ].reduce(applyEventToRows, [])))
  check('one interrupted turn becomes two turn blocks',
    splitBlocks.filter(b => b.kind === 'turn').length === 2,
    JSON.stringify(splitBlocks.map(b => b.kind)))
  check('and its two halves carry the same turn id',
    splitBlocks.filter(b => b.kind === 'turn').every(b => b.turnId === 'sp'))
  check('but not the same block key',
    new Set(splitBlocks.map(timelineBlockKey)).size === splitBlocks.length,
    JSON.stringify(splitBlocks.map(timelineBlockKey)))

  // And the pane itself. TIMELINE_WINDOW_INITIAL_ITEMS is what it opens with,
  // so assert against a session built to exceed it rather than against the
  // constant.
  const bigRows = (() => {
    const evs = []
    for (let t = 0; t < 500; t++) {
      const turn = `b${t}`
      evs.push(evt('user_message', turn, `${turn}_ask`, { result: { text: `ask ${t}` } }))
      evs.push(evt('result', turn, `${turn}_res`, { result: { text: `reply ${t}` } }))
    }
    return evs.reduce(applyEventToRows, [])
  })()
  const bigItems = rowsToTimeline(bigRows)
  check('the big session exceeds the pane default', bigItems.length > TIMELINE_WINDOW_INITIAL_ITEMS,
    `${bigItems.length} vs ${TIMELINE_WINDOW_INITIAL_ITEMS}`)

  const bigHtml = renderToStaticMarkup(h(Timeline, {
    rows: bigRows, onToggleCollapse: () => {}, sessionId: 'br_check',
  }))
  check('a long session renders the earlier-events control', bigHtml.includes('bc-pane-earlier'),
    bigHtml.slice(0, 300))
  check('it offers both show-earlier and show-all',
    (bigHtml.match(/bc-pane-earlier-btn/g) || []).length === 2)
  check('the oldest turn is not in the markup', !bigHtml.includes('ask 0<') && !bigHtml.includes('reply 0<'))
  check('the newest turn is', bigHtml.includes('ask 499'), bigHtml.slice(-400))
  const renderedItems = (bigHtml.match(/bc-tl-item /g) || []).length
  check('the windowed pane renders far fewer items than the session holds',
    renderedItems < bigItems.length / 2,
    `${renderedItems} items in markup, ${bigItems.length} in the session`)

  // The header count is the whole session, not the window. It is the only
  // place the user is told how big the session is, so it must not shrink to
  // the part that happens to be rendered.
  check('the header still counts the whole session',
    bigHtml.includes(`bc-timeline-count">${bigItems.length}<`),
    (bigHtml.match(/bc-timeline-count">[^<]*</) || [''])[0])

  // A session that fits must look exactly like it did before any of this: no
  // control, nothing withheld. Several blocks, so that "not windowed" is a
  // real answer rather than the arithmetic one — a single-block session cannot
  // be windowed at any budget, because a block is never split.
  const smallEvents = [evt('user_message', 's1', 's1_ask', { result: { text: 'only question' } })]
  for (let t = 0; t < 6; t++) {
    smallEvents.push(evt('error', undefined, `smallerr_${t}`, { error: { message: `note ${t}` } }))
  }
  smallEvents.push(evt('result', 's1', 's1_res', { result: { text: 'only answer' } }))
  const smallRows = smallEvents.reduce(applyEventToRows, [])
  check('the short session is several blocks',
    groupTimelineByTurn(rowsToTimeline(smallRows)).length > 2,
    `${groupTimelineByTurn(rowsToTimeline(smallRows)).length} blocks`)
  const smallHtml = renderToStaticMarkup(h(Timeline, {
    rows: smallRows, onToggleCollapse: () => {}, sessionId: 'br_check',
  }))
  check('a short session renders no earlier-events control', !smallHtml.includes('bc-pane-earlier'))
  check('and renders all of its items',
    smallHtml.includes('only question') && smallHtml.includes('only answer')
      && (smallHtml.match(/bc-tl-item /g) || []).length === rowsToTimeline(smallRows).length)
}

console.log('Composer turn controls')
{
  // Every state the union admits, so a new one cannot be added without this
  // deciding what the composer does with it.
  const ALL_STATES = [
    'empty', 'placeholder', 'starting', 'model_generating', 'tool_running', 'compacting',
    'awaiting_permission', 'awaiting_user', 'rate_limited', 'paused', 'idle',
    'completed', 'error', 'aborted', 'disconnected', 'running', 'waiting_on_approval',
  ]
  const render = (props) => renderToStaticMarkup(h(Composer, {
    sessionId: 'br_check', connected: true, turnRunning: false, resumable: false,
    onSend: () => {}, onStop: () => {}, onResume: () => {}, ...props,
  }))

  check('Send renders whatever the turn is doing',
    ALL_STATES.every(s => render({
      turnRunning: harnessIsWorkingOnTurn(s), resumable: sessionCanBeResumed(s),
    }).includes('>Send</button>')))
  check('a running turn renders Stop beside Send',
    render({ turnRunning: true }).includes('bc-btn-stop') && render({ turnRunning: true }).includes('>Send</button>'))
  check('a quiet turn renders no Stop', !render({ turnRunning: false }).includes('bc-btn-stop'))
  check('a resumable session renders Resume beside Send',
    render({ resumable: true }).includes('bc-btn-resume') && render({ resumable: true }).includes('>Send</button>'))
  check('a live session renders no Resume', !render({ resumable: false }).includes('bc-btn-resume'))

  // The defect this file exists to pin (todo 3622b523): Resume used to be keyed
  // on `paused`, which is a client-side marker for "the user interrupted this",
  // i.e. a session whose process is still alive — exactly the one /resume 409s.
  check('paused offers no Resume', !render({ resumable: sessionCanBeResumed('paused') }).includes('bc-btn-resume'))
  check('the only resumable states are aborted and disconnected',
    ALL_STATES.filter(sessionCanBeResumed).join(',') === 'aborted,disconnected',
    ALL_STATES.filter(sessionCanBeResumed).join(','))

  // The other half (todo 3622b523's sibling defect): four controls were keyed on
  // `uiState === 'running'`, and derivation projects `running` away before any
  // consumer sees it, so none of them ever rendered.
  check('derivation never yields `running`, whoever wrote the row',
    ALL_STATES.every(s => deriveSessionUIState({ session_id: 'br_check', state: s }, new Set()) !== 'running'))
  check('the deprecated `running` still projects to tool_running',
    deriveSessionUIState({ session_id: 'br_check', state: 'running' }, new Set()) === 'tool_running')
  check('an interrupted live session derives paused, so the marker survives',
    ['idle', 'tool_running', 'model_generating', 'running'].every(s =>
      deriveSessionUIState({ session_id: 'br_check', state: s }, new Set(['br_check'])) === 'paused'))
  // The marker is a record of what the user pressed; a control has to be gated on
  // what the harness is doing, or an interrupt the server refused takes the Stop
  // button away from the only user who still needs it.
  check('an interrupted session whose turn is still running is still working',
    harnessIsWorkingOnTurn(projectServerSessionState({ session_id: 'br_check', state: 'tool_running' }))
      && deriveSessionUIState({ session_id: 'br_check', state: 'tool_running' }, new Set(['br_check'])) === 'paused')
  check('the server projection carries no marker of its own',
    ALL_STATES.every(s => {
      const marked = new Set(['br_check'])
      return projectServerSessionState({ session_id: 'br_check', state: s })
        === deriveSessionUIState({ session_id: 'br_check', state: s }, new Set())
        && projectServerSessionState({ session_id: 'br_check', state: s }) !== 'paused'
        || s === 'paused'
    }))

  check('and a running turn is still recognised as working',
    ['starting', 'model_generating', 'tool_running', 'compacting'].every(harnessIsWorkingOnTurn)
      && !harnessIsWorkingOnTurn('paused') && !harnessIsWorkingOnTurn('idle'))
}

// controlRefusal is what makes interrupt/stop/compact loud. It is async because
// it reads the server's own words out of the body, so its checks live here rather
// than in the sync block above.
// BridgePrefsStore — the bridge-prefs record, held once per endpoint. Driven
// directly rather than through React for the same reason as SharedPoll: what
// these pin is how many copies of the record exist and what a second consumer
// sees when the first one writes, and neither is visible in rendered markup.
async function bridgePrefsChecks() {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  // localStorage exists in a browser, not in node. The store's own writes are
  // wrapped so its absence is survivable, but the checks that assert what gets
  // persisted need somewhere for it to land.
  const localStorageBacking = new Map()
  globalThis.localStorage = {
    getItem: key => (localStorageBacking.has(key) ? localStorageBacking.get(key) : null),
    setItem: (key, value) => { localStorageBacking.set(key, String(value)) },
    removeItem: key => { localStorageBacking.delete(key) },
  }

  console.log('\nmergePrefs — a partial folded onto the record')
  {
    const prev = {
      last_instance_id: 'inst-1',
      last_session: { cc: 's1', codex: 's2' },
      defaults: { cc: { model: 'sonnet', max_budget: 5 }, codex: { model: 'gpt' } },
    }
    const next = mergePrefs(prev, { defaults: { cc: { model: 'opus' } } })
    check('writing one harness keeps the others', next.defaults.codex?.model === 'gpt', JSON.stringify(next))
    // Replace-to-clear: the settings editor deletes a field by writing the
    // whole record without it. Merging inside the store would make that
    // impossible, so the merge that belongs to a caller stays at the caller.
    check('a harness record is replaced whole, not merged',
      next.defaults.cc?.max_budget === undefined && next.defaults.cc?.model === 'opus', JSON.stringify(next.defaults.cc))
    check('an untouched field survives', next.last_instance_id === 'inst-1')
    check('last_session merges by key',
      mergePrefs(prev, { last_session: { cc: 's9' } }).last_session?.codex === 's2')
    check('the input is not mutated', prev.defaults.cc.model === 'sonnet')
  }

  console.log('BridgePrefsStore — one record, many consumers')
  {
    let gets = 0
    let put = null
    const fetchFn = async (url, init) => {
      if (init?.method === 'PUT') { put = JSON.parse(init.body); return { ok: true, json: async () => ({}) } }
      gets++
      // `last_instance_id` is here so the merged record differs from any one
      // partial. Without a second field the two are identical and every check
      // that says "the partial, not the record" passes without asserting.
      return { ok: true, json: async () => ({ last_instance_id: 'inst-1', defaults: { cc: { model: 'sonnet', max_budget: 5 } } }) }
    }
    const store = bridgePrefsStoreFor({ fetch: fetchFn, endpoint: '/api/bridge/bridge-prefs', storagePrefix: 'bridge-prefs' })
    check('nobody subscribed means no request', gets === 0)

    let notifiedA = 0
    let notifiedB = 0
    const offA = store.subscribe(() => { notifiedA++ })
    const offB = store.subscribe(() => { notifiedB++ })
    await settle()
    // The defect this whole file exists to close: two consumers used to load
    // the record separately and then disagree the moment either wrote.
    check('two subscribers cost one GET', gets === 1, `gets=${gets}`)
    check('both were told when it arrived', notifiedA === 1 && notifiedB === 1, `${notifiedA}/${notifiedB}`)
    check('and both read the same object', store.getSnapshot().prefs.defaults.cc.model === 'sonnet')
    check('loaded flips once the record is in', store.getSnapshot().loaded === true)

    // A write by one consumer is the other consumer's new record. Before the
    // store, this is exactly where a stale copy resurrected a cleared ceiling.
    await store.update({ defaults: { cc: { model: 'opus' } } })
    check('a write reaches every subscriber', notifiedA === 2 && notifiedB === 2, `${notifiedA}/${notifiedB}`)
    check('the record is the merged one', store.getSnapshot().prefs.defaults?.cc?.model === 'opus')
    check('and the fields the write did not name are still there',
      store.getSnapshot().prefs.last_instance_id === 'inst-1')
    check('the PUT body is the partial, not the whole record',
      JSON.stringify(put) === JSON.stringify({ defaults: { cc: { model: 'opus' } } }), JSON.stringify(put))
    check('localStorage gets the merged record',
      JSON.parse(localStorageBacking.get('bridge-prefs')).defaults.cc.model === 'opus')

    offA()
    offB()
    check('the record survives its last subscriber leaving',
      store.getSnapshot().prefs.defaults.cc.model === 'opus' && store.getSnapshot().loaded === true)
    const back = store.subscribe(() => {})
    await settle()
    check('and a consumer that comes back costs no second GET', gets === 1, `gets=${gets}`)
    back()
  }

  console.log('BridgePrefsStore — a write that races the first load')
  {
    let release
    const held = new Promise(resolve => { release = resolve })
    const fetchFn = async (_url, init) => {
      if (init?.method === 'PUT') return { ok: true, json: async () => ({}) }
      await held
      return { ok: true, json: async () => ({ defaults: { cc: { model: 'sonnet', max_budget: 5 } } }) }
    }
    const store = bridgePrefsStoreFor({ fetch: fetchFn, endpoint: '/api/bridge/bridge-prefs', storagePrefix: 'bridge-prefs' })
    const off = store.subscribe(() => {})
    // The user clears the ceiling before the GET has come back. Publishing the
    // server's record wholesale on arrival would put the ceiling straight back.
    await store.update({ defaults: { cc: { model: 'sonnet' } } })
    release()
    await settle()
    await settle()
    check('the write survives the load that lands after it',
      store.getSnapshot().prefs.defaults.cc.max_budget === undefined,
      JSON.stringify(store.getSnapshot().prefs.defaults))
    check('and the loaded record is still underneath it',
      store.getSnapshot().prefs.defaults.cc.model === 'sonnet')
    off()
  }

  console.log('BridgePrefsStore — a read that fails')
  {
    const store = bridgePrefsStoreFor({
      fetch: async () => { throw new TypeError('offline') },
      endpoint: '/api/bridge/bridge-prefs',
      storagePrefix: 'bridge-prefs',
    })
    const off = store.subscribe(() => {})
    await settle()
    // A consumer gated on `loaded` — the chat's bootstrap is — must not wait
    // forever because the record could not be read.
    check('a failed read still settles', store.getSnapshot().loaded === true)
    check('and reports an empty record, not a broken one',
      JSON.stringify(store.getSnapshot().prefs) === '{}', JSON.stringify(store.getSnapshot().prefs))
    off()
  }

  console.log('BridgePrefsStore — localStorage-only mode')
  {
    localStorageBacking.set('other-prefs', JSON.stringify({ last_harness: 'codex' }))
    const store = bridgePrefsStoreFor({ storagePrefix: 'other-prefs' })
    const off = store.subscribe(() => {})
    await settle()
    check('a store with no server reads localStorage', store.getSnapshot().prefs.last_harness === 'codex')
    await store.update({ last_instance_id: 'inst-9' })
    check('and writes the merged record back',
      JSON.parse(localStorageBacking.get('other-prefs')).last_instance_id === 'inst-9')
    check('without disturbing what was already there',
      JSON.parse(localStorageBacking.get('other-prefs')).last_harness === 'codex')
    off()
  }

  console.log('BridgePrefsStore — the registry')
  {
    const fetchA = async () => ({ ok: true, json: async () => ({}) })
    const fetchB = async () => ({ ok: true, json: async () => ({}) })
    const key = { fetch: fetchA, endpoint: '/api/bridge/bridge-prefs', storagePrefix: 'bridge-prefs' }
    const first = bridgePrefsStoreFor(key)
    check('the same fetch and endpoint get the same store', bridgePrefsStoreFor({ ...key }) === first)
    check('a different endpoint gets its own',
      bridgePrefsStoreFor({ ...key, endpoint: '/other/bridge-prefs' }) !== first)
    // Two providers can serve one basePath with different credentials; sharing
    // across them would hand one tenant's saved defaults to the other.
    check('a different fetch gets its own', bridgePrefsStoreFor({ ...key, fetch: fetchB }) !== first)
    // The prefs store and a poll can be asked for under the same fetch. They
    // share one registry, so their keys must not collide.
    const poll = sharedPoll(fetchA, 'instances /api/bridge', () =>
      new SharedPoll(async () => ({ ok: true, value: [] }), [], 100000))
    check('a poll under the same fetch is a different object', poll !== first)
  }
}

async function controlRefusalChecks() {
  const res = (status, body, statusText = '') => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => body,
  })

  console.log('\ncontrolRefusal')
  check('a 2xx is not a refusal', await controlRefusal(res(200, '{}')) === null)
  check('a 204 is not a refusal', await controlRefusal(res(204, '')) === null)
  // The status alone says "no"; the body says which tool holds the turn, which is
  // the half the user can act on.
  check('a 409 carries the status and the server\'s words',
    await controlRefusal(res(409, 'session is busy running a tool')) === '409 session is busy running a tool')
  check('a body of whitespace falls back to the status text',
    await controlRefusal(res(500, '  \n ', 'Internal Server Error')) === '500 Internal Server Error')
  check('an empty body and no status text still names the status',
    await controlRefusal(res(502, '')) === '502 request refused')
  // A refusal the UI cannot describe is still a refusal. Reading the body must
  // never be the thing that turns a loud control quiet again.
  check('a body that will not read still refuses', await controlRefusal({
    ok: false, status: 503, statusText: 'Service Unavailable',
    text: async () => { throw new Error('stream closed') },
  }) === '503 Service Unavailable')
}

// Failing by default until the report is printed. The async checks await real
// promises, so a bug that leaves one pending would otherwise drain the event
// loop and let node exit 0 with the report never reached — a silent pass for a
// run that never finished.
process.exitCode = 1
sharedPollChecks().then(bridgePrefsChecks).then(controlRefusalChecks).then(
  () => {
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
    process.exit(failures === 0 ? 0 : 1)
  },
  err => {
    console.log(`  FAIL the async checks threw — ${err && err.stack ? err.stack : err}`)
    process.exit(1)
  },
)
