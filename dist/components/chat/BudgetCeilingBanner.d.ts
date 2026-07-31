import type { BudgetHalt, ManagedSession } from '../../types';
export interface BudgetCeilingBannerProps {
    /** The active session's halt, or null. */
    halt: BudgetHalt | null;
    /** The active session, read for the ceiling numbers when the halt itself
     * carries none (the mid-turn error event has no dollar figures). */
    session: ManagedSession | null;
    /** Sets a new ceiling. Resolves to the server's refusal text, or null on
     * success — the banner reports the refusal instead of quietly staying up. */
    onRaiseCeiling: (maxBudgetUSD: number) => Promise<string | null>;
}
export declare function BudgetCeilingBanner({ halt, session, onRaiseCeiling }: BudgetCeilingBannerProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=BudgetCeilingBanner.d.ts.map