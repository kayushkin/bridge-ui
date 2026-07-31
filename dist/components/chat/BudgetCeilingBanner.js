import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { formatCost } from '../../utils';
export function BudgetCeilingBanner({ halt, session, onRaiseCeiling }) {
    // The halt's own figures win when it has them (the 402 body names both, as
    // of the moment the request was refused). Otherwise fall back to the
    // session row, which carries the same persisted pair the gate reads.
    const spendUSD = halt?.spendUSD ?? session?.spend_usd;
    const maxBudgetUSD = halt?.maxBudgetUSD ?? session?.max_budget_usd;
    // Seed the input from the ceiling that was breached, so the user edits a
    // real number rather than an empty box.
    const seed = maxBudgetUSD !== undefined && maxBudgetUSD > 0 ? String(maxBudgetUSD) : '';
    // A halt is identified by its session AND its figures: raising the ceiling
    // and hitting the new one later is a different halt on the same session,
    // and it has to re-seed.
    const haltKey = halt ? `${halt.sessionId}:${maxBudgetUSD ?? ''}:${spendUSD ?? ''}` : null;
    const [nextCeiling, setNextCeiling] = useState(seed);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState(null);
    const [seededFor, setSeededFor] = useState(haltKey);
    // Re-seed during render rather than in an effect. An effect would paint an
    // empty box first and fill it a frame later, and — the reason that matters
    // — it would also fire whenever the session row refreshed, wiping whatever
    // the user had typed. Keying on the halt means the input is only ever
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
    // A ceiling at or below what the session already spent puts it straight
    // back over the line, so the very next send is refused again. Catching it
    // here costs one round trip less than letting the server prove it.
    const tooLow = valid && spendUSD !== undefined && parsed <= spendUSD;
    const canSubmit = valid && !tooLow && !submitting;
    const submit = async () => {
        if (!canSubmit)
            return;
        setSubmitting(true);
        setFailure(null);
        const err = await onRaiseCeiling(parsed);
        setSubmitting(false);
        if (err)
            setFailure(err);
    };
    return (_jsxs("div", { className: "bc-budget-banner", role: "region", "aria-label": "Spend ceiling reached", children: [_jsxs("div", { className: "bc-budget-banner-head", children: [_jsx("span", { className: "bc-budget-banner-icon", "aria-hidden": true, children: "\u26D4" }), _jsx("span", { className: "bc-budget-banner-title", children: "Stopped at its spend ceiling" })] }), _jsx("p", { className: "bc-budget-banner-body", children: spendUSD !== undefined && maxBudgetUSD !== undefined && maxBudgetUSD > 0
                    ? _jsxs(_Fragment, { children: ["This session has spent ", _jsx("strong", { children: formatCost(spendUSD) }), " of its ", _jsx("strong", { children: formatCost(maxBudgetUSD) }), " ceiling. It will not send, resume or switch mode until the ceiling is raised above what it has already spent."] })
                    // No numbers came with the halt and the session row has none
                    // either — say what the server said rather than invent a figure.
                    : halt.message }), _jsxs("div", { className: "bc-budget-banner-actions", children: [_jsxs("label", { className: "bc-budget-banner-field", children: [_jsx("span", { className: "bc-budget-banner-field-label", children: "New ceiling ($)" }), _jsx("input", { className: "bc-budget-banner-input", type: "number", min: "0", step: "1", value: nextCeiling, disabled: submitting, onChange: e => setNextCeiling(e.target.value), onKeyDown: e => { if (e.key === 'Enter')
                                    submit(); }, "aria-label": "New spend ceiling in dollars" })] }), _jsx("button", { className: "bc-budget-banner-raise", onClick: submit, disabled: !canSubmit, title: tooLow && spendUSD !== undefined
                            ? `Must be above the ${formatCost(spendUSD)} already spent`
                            : 'Raise this session’s ceiling and let it continue', children: submitting ? 'Raising…' : 'Raise ceiling' }), tooLow && spendUSD !== undefined && (_jsxs("span", { className: "bc-budget-banner-hint", children: ["must exceed the ", formatCost(spendUSD), " already spent"] }))] }), failure && _jsxs("div", { className: "bc-budget-banner-failure", children: ["Could not raise the ceiling: ", failure] })] }));
}
//# sourceMappingURL=BudgetCeilingBanner.js.map