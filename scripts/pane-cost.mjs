// What one chat pane costs to render for a real session.
//
//   node scripts/pane-cost.mjs <history.json> [<history.json> ...]
//
// (or `npm run pane-cost -- <history.json>`, which bundles this the same way
// `npm run check` bundles render-check.mjs, so it can import .ts/.tsx directly.)
//
// A history file is exactly what the chat fetches on open:
//
//   curl -s http://localhost:8160/sessions/<id>/history -o hist.json
//
// The script replays it through the real reducer (`applyEventToRows`) and then
// renders each pane through react-dom/server, so the item counts and the markup
// are the ones the browser gets — not a model of them.
//
// What it measures and what it does not: this is a server render, so the
// numbers are the SIZE of the tree each pane hands React — element count and
// markup bytes — plus how long building it takes in node. That is the quantity
// virtualization removes. It is NOT browser layout, paint, or reconciliation
// time; a browser canary is what measures those. Size is still the right first
// number, because a pane cannot be cheap to reconcile while it is large, and
// this measurement is repeatable and cannot be disturbed by what else the box
// is doing.
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { applyEventToRows } from '../src/useBridgeSession.ts'
import { TurnsView, rowsToTurns } from '../src/components/chat/TurnsView.tsx'
import { Timeline } from '../src/components/chat/Timeline.tsx'
import { Thread } from '../src/components/chat/Thread.tsx'
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/pane-cost.mjs <history.json> [...]')
  process.exit(2)
}

// react-dom/server emits one tag per element, so counting opening tags counts
// elements. Void and self-closing tags open exactly once too, so this holds
// without having to parse the markup.
const elementCount = (html) => (html.match(/<[a-zA-Z]/g) || []).length

const fmt = (n) => n.toLocaleString('en-US')
const kb = (n) => `${(n / 1024).toFixed(0)} KB`

function measure(label, el) {
  const t0 = process.hrtime.bigint()
  const html = renderToStaticMarkup(el)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  return { label, elements: elementCount(html), bytes: html.length, ms }
}

for (const file of files) {
  const raws = JSON.parse(readFileSync(file, 'utf8'))
  let rows = []
  const tReplay = process.hrtime.bigint()
  for (const raw of raws) {
    rows = applyEventToRows(rows, { type: raw.type, data: raw, raw })
  }
  const replayMs = Number(process.hrtime.bigint() - tReplay) / 1e6

  console.log(`\n${file}`)
  console.log(`  ${fmt(raws.length)} events → ${fmt(rows.length)} log rows  (reducer replay ${replayMs.toFixed(0)} ms)`)
  console.log(`  ${fmt(rowsToTurns(rows).length)} turns items`)

  const pad = (s, n) => String(s).padStart(n)
  console.log(`  ${'pane'.padEnd(10)}${pad('elements', 10)}${pad('markup', 10)}${pad('render', 10)}`)

  // Printed one pane at a time, as each finishes. The largest session on this
  // host is a 207MB history, and a run against it spends minutes inside a
  // single pane — with the table printed only at the end there was no way to
  // tell which pane was slow from a run that had not returned yet.
  const panes = [
    ['Turns', () => h(TurnsView, { rows, agent: 'claude', onToggleCollapse: () => {} })],
    ['Timeline', () => h(Timeline, { rows, onToggleCollapse: () => {} })],
    ['Thread', () => h(Thread, { rows, loading: false, error: null, agent: 'claude', sessionId: 'measure' })],
  ]
  for (const [label, build] of panes) {
    const p = measure(label, build())
    console.log(`  ${p.label.padEnd(10)}${pad(fmt(p.elements), 10)}${pad(kb(p.bytes), 10)}${pad(`${p.ms.toFixed(0)} ms`, 10)}`)
  }
}
