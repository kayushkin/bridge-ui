export interface SessionSignalsProps {
    sessionId: string;
    /** request_ids the surrounding surface is already rendering itself. The
     * raising session's chat passes its parked hooks: PendingPermissionsBanner
     * renders those from the live tool input, with the multi-select and option
     * previews the signal record does not carry, so showing a signal card for
     * the same question underneath it would be the same question twice. What is
     * left is what the banner cannot show — signals whose park has gone (a
     * harness restart), and, once P3 lands, derived ones. */
    excludeRequestIds?: string[];
    compact?: boolean;
    /** Heading above the cards. Omit for surfaces tight enough that the card's
     * own "question"/"notification" label is heading enough. */
    title?: string;
}
/** SessionSignals is the open chat signals raised by one session, answerable
 * in place. Renders nothing when the session has none, when the surrounding
 * surface already renders all of them, or when this bridge-server has no
 * signals route. */
export declare function SessionSignals({ sessionId, excludeRequestIds, compact, title }: SessionSignalsProps): import("react/jsx-runtime").JSX.Element | null;
export interface SignalsInboxProps {
    /** Opens the raising session. The inbox is cross-session, so answering
     * usually wants the option of going there. */
    onSelectSession?: (sessionId: string) => void;
    /** Resolves a session id to the name shown in the list. */
    getSessionName?: (sessionId: string) => string;
    /** Bumped by the caller when session state changes, so the inbox refetches
     * without polling. */
    refreshKey?: string | number;
}
/** SignalsInbox is every open chat signal across every session — the "Needs
 * you" list. Renders nothing when there are none or when this bridge-server
 * has no signals route. */
export declare function SignalsInbox({ onSelectSession, getSessionName, refreshKey }: SignalsInboxProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=SessionSignals.d.ts.map