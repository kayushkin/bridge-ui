import type { CardTimeSummary } from '../types-kanban';
/**
 * A card's clock, as a badge.
 *
 * It answers the question a board is actually asked — is this late? — which
 * needs two numbers, not one. A card that arrived yesterday and spent all of it
 * waiting on somebody else's reply has burned none of its limit; a card opened
 * an hour ago and worked the whole hour has burned half a two-hour one. Reporting
 * age alone cannot tell those apart, so the badge leads with the budget clock and
 * keeps elapsed in the tooltip.
 *
 * A card with no limit still gets the badge, showing what it has spent with
 * nothing to spend it against. A card nothing has happened to yet gets none at
 * all: the caller falls back to the activity badge, which is the honest answer
 * for a card whose history predates the event log.
 */
export declare function CardBudgetBadge({ time }: {
    time: CardTimeSummary | undefined;
}): import("react/jsx-runtime").JSX.Element | null;
/** Whether a card has anything to say about its clock. Cards whose whole history
 * predates the event log have no events and no rung, and asking them for a
 * budget badge would draw a zero that means "we never saw it", not "no time has
 * been spent". */
export declare function hasClockData(time: CardTimeSummary | undefined): time is CardTimeSummary;
/** The tooltip carries every figure the badge had to leave out, including the
 * working-week ones when the board declares hours. */
export declare function describeCardTime(time: CardTimeSummary): string;
/**
 * The card's history: what happened, in what order, and how long each step took.
 *
 * Every figure on screen is computed by kanban-store from the same event log
 * this list renders, so a reader can check the totals against the steps rather
 * than taking them on trust.
 */
export declare function CardTimelinePanel({ cardID, boardID }: {
    cardID: string;
    boardID?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function describeEventKind(kind: string): string;
//# sourceMappingURL=CardTime.d.ts.map