import type { CardView } from './types-kanban';
/**
 * Card axes — the classification a card carries in its noteboard tags.
 *
 * A board can only have one axis as its columns. The Email board spends that
 * slot on action state (No action / Action needed / Action completed), so the
 * other two axes ride along as prefixed tags and this module is what turns them
 * back into something you can filter, group and edit.
 *
 * Nothing here is email-specific by construction: a board whose cards carry no
 * prefixed tags reports no axes and the UI leaves it exactly as it was. That
 * matters because this component is shared with llmux, whose boards have never
 * had these tags.
 */
export interface AxisDefinition {
    /** Tag prefix, including the colon. */
    prefix: string;
    /** Short label for the control. */
    label: string;
    /**
     * Known values, in the order they should be offered. A value found on a card
     * but missing from this list is still shown — the list orders the vocabulary,
     * it does not police it, and hiding an unexpected value would hide exactly the
     * classifier bug worth seeing.
     */
    values: string[];
}
/**
 * The axes email-classifier writes. Kept in the same order the controls should
 * appear: what it is, what it needs, how soon.
 */
export declare const CARD_AXES: AxisDefinition[];
export declare const WORK_AXIS_PREFIX = "work:";
export declare const WORK_NOT_STARTED = "not-started";
export declare const WORK_IN_PROGRESS = "in-progress";
export declare function tagsOf(card: CardView): string[];
/** Returns the value of the axis tag on a card, or '' when it carries none. */
export declare function axisValue(card: CardView, prefix: string): string;
/**
 * Replaces (or adds) one axis tag, leaving every other tag untouched.
 * Passing an empty value removes the axis tag entirely.
 */
export declare function withAxisValue(tags: string[], prefix: string, value: string): string[];
/**
 * The axes actually present on a board, each with the values in use and how many
 * cards carry them. An axis nobody uses is omitted, so the toolbar shows only
 * controls that can do something.
 */
export interface AxisUsage {
    axis: AxisDefinition;
    /** Values present on this board, ordered by the axis vocabulary then alphabetically. */
    values: {
        value: string;
        count: number;
    }[];
}
export declare function axisUsage(cards: CardView[]): AxisUsage[];
export declare function allCardsOf(columns: {
    cards: CardView[] | null;
}[]): CardView[];
/** An active filter: axis prefix → the set of values to keep. */
export type AxisFilter = Record<string, string[]>;
export declare function matchesFilter(card: CardView, filter: AxisFilter): boolean;
export declare function filterIsActive(filter: AxisFilter): boolean;
export type SortKey = 'priority' | 'stored' | 'urgency' | 'title' | 'newest';
/**
 * Sorts a column's cards. 'stored' returns them untouched, preserving whatever
 * order the board view gave us — worth keeping as an option because every writer
 * on this host passes position 0, so the stored order is arbitrary and a user may
 * still want to see it as-is.
 */
export declare function sortCards(cards: CardView[], key: SortKey): CardView[];
/**
 * Groups a column's cards by an axis, for the "group by" control. Returns a
 * single unnamed group when grouping is off, so callers render one code path.
 */
export declare function groupCards(cards: CardView[], prefix: string | null): {
    name: string;
    cards: CardView[];
}[];
/**
 * Splits an email link's entity_ref back into the two parts email-classifier
 * joined: the mailstack account id and the provider message id.
 *
 * The account id is everything before the FIRST colon, because a Gmail message
 * id never contains one but an account id could not be recovered otherwise.
 */
export declare function parseEmailLocator(ref: string): {
    accountID: string;
    messageID: string;
} | null;
//# sourceMappingURL=kanbanAxes.d.ts.map