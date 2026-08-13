import type { FetchFn } from './types';
export type DispatchAgentArgs = {
    basePath: string;
    fetchFn: FetchFn;
    /** Shown in the session list, so it should read as the work, not as an id. */
    title: string;
    /** Exactly what the agent is sent. Callers resolve stored-vs-suggested first. */
    prompt: string;
    /**
     * Attaches the session to the card. Already bound to the card — useKanban's
     * addCardLink takes the card id as its first argument, so callers pass a
     * closure over it.
     */
    addLink: (entityType: string, entityRef: string, label?: string) => Promise<boolean>;
};
/**
 * dispatchAgentOnCard creates an autonomous session, attaches it to the card,
 * sends the prompt, and returns the session id.
 *
 * The link is written BEFORE the prompt is sent. If the send fails, a linked
 * session is a visible loose end somebody can open from the board; an unlinked
 * one is a live agent nothing points at. Cost is the same either way, so the
 * order is chosen to make the failure findable.
 *
 * The session is `autonomous` because an unattended session that parks on a
 * permission prompt nobody is watching never finishes. That is the same type
 * autoworker and kanban-dispatcher already use, and it means tool calls are
 * auto-allowed — the reason this is worth a confirmation step in the UI.
 *
 * Throws on any failure rather than returning a status, so a caller cannot
 * quietly treat a failed dispatch as a started one.
 */
export declare function dispatchAgentOnCard(args: DispatchAgentArgs): Promise<string>;
//# sourceMappingURL=agentDispatch.d.ts.map