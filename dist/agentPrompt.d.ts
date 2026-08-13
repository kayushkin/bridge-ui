export declare const AGENT_PROMPT_OPEN = "<!-- agent-prompt -->";
export declare const AGENT_PROMPT_CLOSE = "<!-- /agent-prompt -->";
/**
 * readAgentPrompt returns the stored prompt, or null when the card carries none.
 *
 * Returns null rather than '' for an empty block so callers can tell "nobody has
 * written a prompt" from "somebody deliberately cleared it" — the first should
 * offer a suggestion, the second should not overwrite the decision.
 */
export declare function readAgentPrompt(body: string | null | undefined): string | null;
/**
 * stripAgentPrompt removes the block, returning the rest of the body unchanged.
 */
export declare function stripAgentPrompt(body: string | null | undefined): string;
/**
 * writeAgentPrompt returns a new body carrying this prompt, replacing any block
 * already there. An empty prompt removes the block rather than storing a blank
 * one, so clearing the box and saving actually clears it.
 */
export declare function writeAgentPrompt(body: string | null | undefined, prompt: string): string;
/**
 * suggestAgentPrompt drafts a starting prompt from what the card already says.
 *
 * This is the fallback shown when a card has no stored prompt. It is a template,
 * not a model call: it renders instantly, costs nothing, and is the same every
 * time, which matters for something a human is about to read and edit. A drafted
 * prompt is only worth paying for once someone chooses to spend on it.
 *
 * It mirrors the instructions autoworker and kanban-dispatcher already give
 * their workers, so a hand-started agent closes its card the same way a
 * cron-started one does — otherwise the curator never sees it finish.
 */
export declare function suggestAgentPrompt(args: {
    cardID: string;
    title: string;
    body?: string | null;
    linkedEmailCount?: number;
}): string;
//# sourceMappingURL=agentPrompt.d.ts.map