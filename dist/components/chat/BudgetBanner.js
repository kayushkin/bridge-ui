import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useBudgetHalt, useManagedSession } from '@kayushkin/chat-core';
import { formatCost } from '../../utils';
/** The surface for llm-bridge-server's spend halt: the session reached its ceiling, the
 *  server interrupted it, and every further send, resume and mode switch is refused with
 *  a 402 until the ceiling moves.
 *
 *  Before this, chat showed nothing at all. The mid-turn interrupt was one error event
 *  among many and the 402 never reached the page — `useComposer.send` discarded it — so a
 *  halted session looked like a hung one. That is the wrong conclusion twice over: the
 *  session is fine, and the one control that fixes it is a number in a box.
 *
 *  Renders nothing when there is no halt, which is every session under its ceiling, every
 *  session without one, and every server that predates the gate.
 *
 *  Reuses bridge-ui's `bc-budget-banner-*` classes, which dash already loads globally from
 *  `@kayushkin/bridge-ui/styles.css`, so the two chats look the same.
 *
 *  Only the 402 body names both dollar figures (`budgetHaltFromRefusal`); a halt raised by
 *  the mid-turn error event carries neither, and used to render the server's raw sentence
 *  because there was nowhere else to read them. There is now: the same
 *  `GET /sessions/{id}` detail the header reads holds the persisted pair the gate itself
 *  compares. It is NOT the summary wire — `spend_usd`/`max_budget_usd` stay off
 *  `chat_wire.go` on purpose, because a halt is a response and not a row, and widening
 *  the sidebar query for every session to describe the rare one is the trade this avoids.
 *  The detail read is per-session, lazy and already cached by the store, so the fallback
 *  costs nothing the header has not already paid.
 *
 *  The halt's own figures still win where it has them: they are the numbers as of the
 *  moment the request was refused, while the row is whatever has been persisted since. */
export default function BudgetBanner({ sessionId }) {
    const { halt, raiseCeiling } = useBudgetHalt(sessionId);
    const { session: managed } = useManagedSession(sessionId);
    // A ceiling of ZERO means no ceiling, so it is not a figure to fall back to — a banner
    // reading "$3.00 of its $0.00 ceiling" describes a session that cannot exist.
    const rowCeiling = managed?.maxBudgetUsd;
    const spendUSD = halt?.spendUSD ?? managed?.spendUsd;
    const maxBudgetUSD = halt?.maxBudgetUSD ?? (rowCeiling !== undefined && rowCeiling > 0 ? rowCeiling : undefined);
    // Seed the input from the ceiling that was breached, so the user edits a real number
    // rather than an empty box.
    const seed = maxBudgetUSD !== undefined && maxBudgetUSD > 0 ? String(maxBudgetUSD) : '';
    // A halt is identified by its session AND its figures: raising the ceiling and hitting
    // the new one later is a different halt on the same session, and it has to re-seed.
    const haltKey = halt ? `${halt.sessionId}:${maxBudgetUSD ?? ''}:${spendUSD ?? ''}` : null;
    const [nextCeiling, setNextCeiling] = useState(seed);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState(null);
    const [seededFor, setSeededFor] = useState(haltKey);
    // Re-seed during render rather than in an effect. An effect would paint an empty box
    // first and fill it a frame later, and it would also fire on every unrelated re-render,
    // wiping whatever the user had typed. Keying on the halt means the input is only ever
    // rewritten when the halt itself is a different one.
    if (haltKey !== null && haltKey !== seededFor) {
        setSeededFor(haltKey);
        setNextCeiling(seed);
        setFailure(null);
    }
    if (!halt)
        return null;
    const parsed = Number(nextCeiling);
    const valid = nextCeiling.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
    // A ceiling at or below what the session already spent puts it straight back over the
    // line, so the very next send is refused again. Catching it here costs one round trip
    // less than letting the server prove it.
    const tooLow = valid && spendUSD !== undefined && parsed <= spendUSD;
    const canSubmit = valid && !tooLow && !submitting;
    const submit = async () => {
        if (!canSubmit)
            return;
        setSubmitting(true);
        setFailure(null);
        const err = await raiseCeiling(parsed);
        setSubmitting(false);
        if (err)
            setFailure(err);
    };
    return (_jsxs("div", { className: "bc-budget-banner", role: "region", "aria-label": "Spend ceiling reached", children: [_jsxs("div", { className: "bc-budget-banner-head", children: [_jsx("span", { className: "bc-budget-banner-icon", "aria-hidden": true, children: "\u26D4" }), _jsx("span", { className: "bc-budget-banner-title", children: "Stopped at its spend ceiling" })] }), _jsx("p", { className: "bc-budget-banner-body", children: spendUSD !== undefined && maxBudgetUSD !== undefined && maxBudgetUSD > 0 ? (_jsxs(_Fragment, { children: ["This session has spent ", _jsx("strong", { children: formatCost(spendUSD) }), " of its", ' ', _jsx("strong", { children: formatCost(maxBudgetUSD) }), " ceiling. It will not send, resume or switch mode until the ceiling is raised above what it has already spent."] })) : (
                // No numbers came with the halt — say what the server said rather than invent a
                // figure.
                halt.message) }), _jsxs("div", { className: "bc-budget-banner-actions", children: [_jsxs("label", { className: "bc-budget-banner-field", children: [_jsx("span", { className: "bc-budget-banner-field-label", children: "New ceiling ($)" }), _jsx("input", { className: "bc-budget-banner-input", type: "number", min: "0", step: "1", value: nextCeiling, disabled: submitting, onChange: e => setNextCeiling(e.target.value), onKeyDown: e => { if (e.key === 'Enter')
                                    void submit(); }, "aria-label": "New spend ceiling in dollars" })] }), _jsx("button", { type: "button", className: "bc-budget-banner-raise", onClick: () => void submit(), disabled: !canSubmit, title: tooLow && spendUSD !== undefined
                            ? `Must be above the ${formatCost(spendUSD)} already spent`
                            : 'Raise this session’s ceiling and let it continue', children: submitting ? 'Raising…' : 'Raise ceiling' }), tooLow && spendUSD !== undefined && (_jsxs("span", { className: "bc-budget-banner-hint", children: ["must exceed the ", formatCost(spendUSD), " already spent"] }))] }), failure && _jsxs("div", { className: "bc-budget-banner-failure", children: ["Could not raise the ceiling: ", failure] })] }));
}
//# sourceMappingURL=BudgetBanner.js.map