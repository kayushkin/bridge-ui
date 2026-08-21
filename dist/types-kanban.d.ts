/** A board's working week, used to report elapsed time a second way. `tzid` is
 * mandatory: an offset is not a zone, and hours anchored to one drift an hour
 * twice a year. */
export interface BusinessHours {
    tzid: string;
    days: string[];
    start: string;
    end: string;
}
export interface Board {
    id: string;
    name: string;
    description: string;
    archived: boolean;
    business_hours?: BusinessHours;
    created_at: string;
    updated_at: string;
}
/** What a stretch of time did to a card's limit. `running` counts against it,
 * `paused` elapses without counting, `stopped` means the work is over and
 * nothing accrues at all. */
export type ClockState = 'running' | 'paused' | 'stopped';
export interface Column {
    id: string;
    board_id: string;
    name: string;
    position: number;
    color: string;
    wip_limit?: number;
    auto_status?: string;
    /** What landing in this column means for the budget clock. Absent means the
     * column says nothing about it and a card keeps the state it arrived with. */
    budget_clock_state?: ClockState;
    created_at: string;
    updated_at: string;
}
export interface Placement {
    card_id: string;
    board_id: string;
    column_id: string;
    position: number;
    created_at: string;
    updated_at: string;
}
export interface CardLink {
    id: string;
    card_id: string;
    entity_type: string;
    entity_ref: string;
    label: string;
    created_at: string;
}
export interface EntityTag {
    entity_type: string;
    entity_ref: string;
    tag: string;
    created_at: string;
}
/** One rung of a board's priority ladder: a stored noteboard priority, the name
 * the board gives it, and how long work at that rung should take.
 *
 * P0 is the TOP rung and the top rung is the HIGHEST `priority_value` —
 * noteboard sorts priority descending. The P-number is a label, not the number
 * in the database, and `priority_value` 0 is reserved for unranked cards. */
export interface BoardPriorityLevel {
    board_id: string;
    priority_value: number;
    label: string;
    /** Null for a rung that is named but not timed. */
    budget_seconds: number | null;
}
/** A board's rungs, top rung first. An empty `levels` means this board ignores
 * priorities: its cards carry no limit whatever their stored priority. */
export interface PriorityLadder {
    board_id: string;
    levels: BoardPriorityLevel[];
}
/** One action on a card. The log is append-only, and each row carries the clock
 * state that was true when it happened rather than one derived at read time. */
export interface CardEvent {
    id: string;
    card_id: string;
    board_id?: string;
    kind: string;
    clock_state: ClockState;
    actor?: string;
    summary?: string;
    from_column_id?: string;
    to_column_id?: string;
    note_id?: string;
    detail?: unknown;
    occurred_at: string;
    recorded_at: string;
}
/** A status update or summary written onto a card. Lives in kanban-store rather
 * than the noteboard body because it is activity, not the card's text. */
export interface CardNote {
    id: string;
    card_id: string;
    board_id?: string;
    kind: string;
    body: string;
    actor?: string;
    created_at: string;
}
/** A card's time, answered three ways: how long it has been alive, how much of
 * that the work was actually available to be done, and how that sits against
 * the limit its priority sets. */
export interface CardTimeSummary {
    as_of: string;
    clock_state: ClockState | '';
    first_event_at?: string;
    last_event_at?: string;
    event_count: number;
    elapsed_seconds: number;
    /** The part of elapsed that counted. This is what the limit is measured
     * against. */
    budget_clock_seconds: number;
    waiting_seconds: number;
    /** Absent unless the board declares a working week — never a guessed
     * nine-to-five. */
    business_hours_elapsed_seconds?: number;
    business_hours_budget_clock_seconds?: number;
    priority_value?: number;
    priority_label?: string;
    budget_seconds?: number;
    budget_remaining_seconds?: number;
    over_budget?: boolean;
}
/** One event with the time either side of it. */
export interface TimelineEntry {
    event: CardEvent;
    note?: CardNote;
    seconds_since_previous_event: number;
    segment_seconds: number;
    segment_open: boolean;
    counts_against_budget: boolean;
    clock_state: ClockState;
}
export interface CardTimeline {
    card_id: string;
    board_id?: string;
    summary: CardTimeSummary;
    entries: TimelineEntry[];
    notes: CardNote[];
    priority_level?: BoardPriorityLevel;
}
export interface CardView {
    placement: Placement;
    /** Raw noteboard item (passed through unchanged). Null if the upstream item
     * was hard-deleted out from under kanban-store — these surface in `orphans`. */
    item: NoteboardItem | null;
    links?: CardLink[];
    /** The card's clock, computed from its events on every read. Absent on a
     * board served by a kanban-store that predates time accounting. */
    time?: CardTimeSummary;
}
export interface EntityCardView {
    card_id: string;
    item: NoteboardItem | null;
}
export interface ColumnView {
    column: Column;
    cards: CardView[] | null;
    /** How many cards the column holds, which is not `cards.length` once a board
     * view has been capped. Both are needed to say "showing 25 of 6,466" rather
     * than presenting a page as the whole column. */
    total: number;
}
export interface BoardView {
    board: Board;
    columns: ColumnView[];
    orphans?: CardView[];
    /** The board's rungs, so a card can be labelled without a second request. */
    priority_ladder?: PriorityLadder;
}
export interface NoteboardItem {
    id: string;
    type: string;
    title: string;
    body: string;
    tags: string[];
    priority: number;
    status: string;
    list_id: string;
    due_at?: string | null;
    links: string[];
    created_at: string;
    updated_at: string;
    /** The agent gate. Set => this work is parked and no autoworker will pick it
     * up, in any column. Separate from `status` on purpose: a held card is still
     * open work, it just isn't cleared to run unattended. */
    held_at?: string | null;
    hold_reason?: string;
    /** Spend ceiling: this card auto-holds once its agent sessions have cost this
     * much in total. Absent/null = no ceiling. Zero is a REAL ceiling. */
    auto_hold_at_usd?: number | null;
    [extra: string]: unknown;
}
export interface EntityTypeInfo {
    type: string;
    service?: string;
    search?: string;
}
export interface TagCount {
    tag: string;
    count: number;
}
/** Minimal shape of a mailstack message, as the card drawer reads it.
 *
 * Deliberately partial: this mirrors only the fields the drawer renders, and
 * body_html is omitted on purpose so no caller here can reach for it. Mail
 * bodies are attacker-controlled, and the only surface that renders them safely
 * is dash's Mail page, which sandboxes them in an iframe with remote images
 * stripped. */
export interface MailMessage {
    meta?: {
        subject?: string;
        snippet?: string;
        date?: string;
        from?: {
            name?: string;
            email?: string;
        };
    };
    body_text?: string;
}
//# sourceMappingURL=types-kanban.d.ts.map