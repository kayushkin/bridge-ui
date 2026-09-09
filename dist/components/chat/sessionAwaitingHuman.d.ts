/** Whether a session's effective UI state is one a human is expected to answer. */
export declare function isSessionAwaitingHuman(state: string): boolean;
/** What the marker is asking for, in the user's words rather than the wire's. Used for the
 *  accessible names, so a screen reader hears "approval" and not `awaiting_permission`. */
export declare function humanAskedFor(state: string): string;
//# sourceMappingURL=sessionAwaitingHuman.d.ts.map