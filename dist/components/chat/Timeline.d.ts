interface TimelineProps {
    sessionId: string | null;
    /** The pane's share of the split row, as `flex: <grow> 1 0`. Owned by the parent —
     *  see `TurnListProps.style`, which this mirrors. */
    style?: React.CSSProperties;
}
/** The Timeline pane — a third view alongside Turns/Raw. Presentation-only: it
 *  consumes `selectTimeline(model)`'s flat, chronological rows and renders them
 *  in bridge-ui's timeline DOM (bc-timeline / bc-timeline-body / bc-tl-item /
 *  bc-tl-<tone>) so it inherits the shared stylesheet. It never decides what a
 *  row is (chat-core owns the derivation, memoized on model identity).
 *
 *  It shows what THIS session did, and nothing a subagent did. A subagent's work
 *  is a session of its own, so a task contributes a spawn row and a finish row,
 *  each carrying a chip that opens the subagent's session — the same chip a
 *  session reference in the chat gets. The pane used to nest a subagent's rows
 *  under a task header instead, which is where the reported bug lived: with more
 *  than one subagent running, rows landed under the wrong header and then fell
 *  out from under it as soon as any task finished.
 *
 *  We feed selectTimeline a TurnModel assembled from useTurns' already-materialized
 *  `entries` (the whole entry dict — selectTimeline reads only `model.entries`,
 *  ordered by eventId). The wrapper object is memoized on `entries` identity so the
 *  selector's identity-memo stays warm across unrelated re-renders. */
export default function Timeline({ sessionId, style }: TimelineProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Timeline.d.ts.map