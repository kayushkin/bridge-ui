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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
