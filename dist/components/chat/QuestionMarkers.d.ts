interface SessionQuestionMarkerProps {
    sessionId: string;
    /** For the accessible name and the panel heading. The row already resolved it, so it is
     *  passed in rather than re-resolved here — one session, one display name. */
    sessionName: string;
    /** The row's effective state, which decides the wording. NOT necessarily an
     *  awaiting-human state any more: a row also carries the marker when an open question
     *  signal is recorded against it, and such a session is usually `completed` or
     *  `aborted` by the time anyone looks. `humanAskedFor` says "approval" only for
     *  `awaiting_permission` and "question" for everything else, which is right for both. */
    displayState: string;
    /** True when this row is the session the chat pane is showing. That pane's own
     *  `AwaitingYouBanner` renders every open signal this session has, so the panel points
     *  at it instead of drawing a second copy of the same answer form. */
    isActiveSession: boolean;
    open: boolean;
    onToggle: (sessionId: string) => void;
    onDismiss: () => void;
}
/**
 * The `?` on a session row: the row's status indicator, made into a disclosure control.
 *
 * Seeing the marker is how the user learns a session is blocked on them — there is
 * deliberately no global "needs you" count anywhere in the sidebar, because a count tells
 * you a number and the marker tells you WHICH ROW, which is the thing you have to act on.
 *
 * It is a real `<button>` and a SIBLING of `bc-session-item-main`, never a child of it:
 * nesting one button inside another is invalid HTML and leaves the inner control out of
 * the accessibility tree. Being a sibling is also what keeps it from swallowing the row's
 * click-to-select — the two controls simply do not overlap.
 */
export declare function SessionQuestionMarker({ sessionId, sessionName, displayState, isActiveSession, open, onToggle, onDismiss, }: SessionQuestionMarkerProps): import("react/jsx-runtime").JSX.Element;
interface FolderQuestionRollupMarkerProps {
    /** How many sessions in this folder are waiting on a human. Zero renders nothing. */
    waitingCount: number;
    collapsed: boolean;
    /** The folder's label, for the accessible name only. */
    folderLabel: string;
    /** Expand the folder. Never collapse it: the marker exists because collapsing hid the
     *  rows that carry the real, answerable `?`. */
    onReveal: () => void;
}
/**
 * The folder header's rollup `?`.
 *
 * A collapsed folder hides its rows, and with them every marker beneath it — so the count
 * is the only thing that says a folder is sitting on questions. It deliberately does NOT
 * open a dropdown: answering here would mean picking one of several sessions on the user's
 * behalf, and the row that owns the question is one click away.
 *
 * When the folder is already open the rollup is a plain `<span>`, not a button. A control
 * whose only act is "reveal" has nothing to do on a folder that is already revealed, and a
 * button that does nothing is worse than a label.
 */
export declare function FolderQuestionRollupMarker({ waitingCount, collapsed, folderLabel, onReveal, }: FolderQuestionRollupMarkerProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=QuestionMarkers.d.ts.map