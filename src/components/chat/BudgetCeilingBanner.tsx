import { useState } from 'react'
import type { BudgetHalt, ManagedSession } from '../../types'
import { formatCost } from '../../utils'

// BudgetCeilingBanner is the surface for bridge-server's spend halt: the
// session reached its ceiling, the server interrupted it, and every further
// send, resume and mode switch is refused with 402 until the ceiling moves.
//
// Before this, both halves of that gate reached the user as raw text — the
// 402's JSON body pasted into the error line, and the mid-turn interrupt as
// a sentence in a pane that can be hidden. Neither said what to do about it,
// and the one control that fixes it (POST /sessions/{id}/config with a new
// max_budget) had no UI at all.
//
// Renders nothing when there is no halt, which is every session under its
// ceiling, every session without one, and every bridge-server that predates
// the gate — none of those can produce the 402 code or the error code that
// sets a halt.
export interface BudgetCeilingBannerProps {
  /** The active session's halt, or null. */
  halt: BudgetHalt | null
  /** The active session, read for the ceiling numbers when the halt itself
   * carries none (the mid-turn error event has no dollar figures). */
  session: ManagedSession | null
  /** Sets a new ceiling. Resolves to the server's refusal text, or null on
   * success — the banner reports the refusal instead of quietly staying up. */
  onRaiseCeiling: (maxBudgetUSD: number) => Promise<string | null>
}

export function BudgetCeilingBanner({ halt, session, onRaiseCeiling }: BudgetCeilingBannerProps) {
  // The halt's own figures win when it has them (the 402 body names both, as
  // of the moment the request was refused). Otherwise fall back to the
  // session row, which carries the same persisted pair the gate reads.
  const spendUSD = halt?.spendUSD ?? session?.spend_usd
  const maxBudgetUSD = halt?.maxBudgetUSD ?? session?.max_budget_usd

  // Seed the input from the ceiling that was breached, so the user edits a
  // real number rather than an empty box.
  const seed = maxBudgetUSD !== undefined && maxBudgetUSD > 0 ? String(maxBudgetUSD) : ''
  // A halt is identified by its session AND its figures: raising the ceiling
  // and hitting the new one later is a different halt on the same session,
  // and it has to re-seed.
  const haltKey = halt ? `${halt.sessionId}:${maxBudgetUSD ?? ''}:${spendUSD ?? ''}` : null

  const [nextCeiling, setNextCeiling] = useState(seed)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [seededFor, setSeededFor] = useState(haltKey)

  // Re-seed during render rather than in an effect. An effect would paint an
  // empty box first and fill it a frame later, and — the reason that matters
  // — it would also fire whenever the session row refreshed, wiping whatever
  // the user had typed. Keying on the halt means the input is only ever
  // rewritten when the halt itself is a different one.
  if (haltKey !== null && haltKey !== seededFor) {
    setSeededFor(haltKey)
    setNextCeiling(seed)
    setFailure(null)
  }

  if (!halt) return null

  const parsed = Number(nextCeiling)
  const valid = nextCeiling.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  // A ceiling at or below what the session already spent puts it straight
  // back over the line, so the very next send is refused again. Catching it
  // here costs one round trip less than letting the server prove it.
  const tooLow = valid && spendUSD !== undefined && parsed <= spendUSD
  const canSubmit = valid && !tooLow && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setFailure(null)
    const err = await onRaiseCeiling(parsed)
    setSubmitting(false)
    if (err) setFailure(err)
  }

  return (
    <div className="bc-budget-banner" role="region" aria-label="Spend ceiling reached">
      <div className="bc-budget-banner-head">
        <span className="bc-budget-banner-icon" aria-hidden>⛔</span>
        <span className="bc-budget-banner-title">Stopped at its spend ceiling</span>
      </div>
      <p className="bc-budget-banner-body">
        {spendUSD !== undefined && maxBudgetUSD !== undefined && maxBudgetUSD > 0
          ? <>This session has spent <strong>{formatCost(spendUSD)}</strong> of its <strong>{formatCost(maxBudgetUSD)}</strong> ceiling. It will not send, resume or switch mode until the ceiling is raised above what it has already spent.</>
          // No numbers came with the halt and the session row has none
          // either — say what the server said rather than invent a figure.
          : halt.message}
      </p>
      <div className="bc-budget-banner-actions">
        <label className="bc-budget-banner-field">
          <span className="bc-budget-banner-field-label">New ceiling ($)</span>
          <input
            className="bc-budget-banner-input"
            type="number"
            min="0"
            step="1"
            value={nextCeiling}
            disabled={submitting}
            onChange={e => setNextCeiling(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            aria-label="New spend ceiling in dollars"
          />
        </label>
        <button
          className="bc-budget-banner-raise"
          onClick={submit}
          disabled={!canSubmit}
          title={tooLow && spendUSD !== undefined
            ? `Must be above the ${formatCost(spendUSD)} already spent`
            : 'Raise this session’s ceiling and let it continue'}
        >
          {submitting ? 'Raising…' : 'Raise ceiling'}
        </button>
        {tooLow && spendUSD !== undefined && (
          <span className="bc-budget-banner-hint">
            must exceed the {formatCost(spendUSD)} already spent
          </span>
        )}
      </div>
      {failure && <div className="bc-budget-banner-failure">Could not raise the ceiling: {failure}</div>}
    </div>
  )
}
