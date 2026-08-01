export interface PaneWindowBudget {
    /** How many units the pane may render, counting back from the newest block. */
    budget: number;
    /** Back to the initial budget — call when the pane is looking at a different list. */
    resetBudget: () => void;
    /** Reveal one more step of earlier blocks. */
    revealMore: () => void;
    /** Render the whole list, however long it is. */
    revealAll: () => void;
}
/**
 * The budget a windowed pane renders to, and the scroll bookkeeping that
 * makes revealing earlier blocks invisible to the reader.
 *
 * Revealing earlier blocks inserts them ABOVE the viewport. The browser keeps
 * `scrollTop` where it was, so the content the user was reading slides down
 * out of view. The distance from the bottom is the one quantity that adding
 * blocks at the top leaves unchanged, so it is recorded before the reveal and
 * restored after layout.
 *
 * `resetBudget` is stable, so a caller can drive it from an effect keyed on
 * whatever "a different list" means for that pane — the session for Timeline,
 * the session or the type filter for Thread.
 */
export declare function usePaneWindowBudget<Element extends HTMLElement>(initialBudget: number, stepBudget: number, containerRef: React.RefObject<Element | null>): PaneWindowBudget;
//# sourceMappingURL=usePaneWindowBudget.d.ts.map