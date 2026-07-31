import type { LogRow } from '../../types';
export interface CostAggregate {
    totalUsd: number;
    byModel?: Record<string, number>;
    bySource?: Record<string, number>;
}
export interface SpendCeiling {
    spendUSD: number;
    maxBudgetUSD: number;
}
export interface CostBreakdownProps {
    /** Raw log rows to scan for the latest api_spend_total (default path used
     * by the live BridgeChat `/` page). Optional so an `aggregate`-only
     * consumer need not supply it. */
    rows?: LogRow[];
    /** Per-turn EventResult.Cost sum used when no api_call telemetry exists.
     * Optional (defaults to 0) so an `aggregate`-only consumer need not supply
     * it. */
    fallbackTotalUSD?: number;
    /** Tooltip carried over from SessionHeader (e.g. context-tokens info)
     * shown when the fallback figure is displayed. */
    fallbackTitle?: string;
    /** Pre-aggregated cost object. When present, it wins over rows/fallback
     * and renders a drill-down chip from the aggregate directly. */
    aggregate?: CostAggregate;
    /** The session's spend ceiling and its spend against it. Supply it only
     * for a session that has one (max_budget_usd > 0): with no ceiling the
     * chip renders exactly as it did before, and a server that predates the
     * ceiling cannot send one, so nothing appears. */
    ceiling?: SpendCeiling;
}
export declare function CostBreakdown({ rows, fallbackTotalUSD, fallbackTitle, aggregate, ceiling }: CostBreakdownProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=CostBreakdown.d.ts.map