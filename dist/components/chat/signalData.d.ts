import type { FetchFn, Signal } from '../../types';
/** A 404 from the signals route means this bridge-server predates the signals
 * API. Every read helper reports that as `null` rather than an error string:
 * a server without the feature is not a failure to show the user, and the
 * three signal surfaces render nothing at all in that case. Any other failure
 * is a real error and is surfaced. */
export type SignalsResult = Signal[] | null;
/** Open chat-surface signals, newest first. Pass a sessionId to scope to one
 * session; omit it for the cross-session inbox. */
export declare function fetchOpenChatSignals(fetchFn: FetchFn, basePath: string, sessionId?: string, limit?: number): Promise<SignalsResult>;
/** Every open signal that propagates to a noteboard todo, keyed by todo id.
 *
 * One request for a whole board, not one per card. The open set is small by
 * construction — at most one derived row per session, plus whatever tool asks
 * are parked right now — so asking per card would be N requests for a list the
 * server can hand over whole.
 *
 * Surface is deliberately not filtered. A todo is worked by chat sessions and
 * by autonomous workers alike, and the badge answers "does this piece of work
 * need me?", which is true of a signal on either surface. */
export declare function fetchOpenSignalsByTodo(fetchFn: FetchFn, basePath: string): Promise<Map<string, Signal[]> | null>;
/** Open signals against exactly one todo — the query a single-todo view makes.
 *
 * Narrowed server-side rather than by filtering the whole open set, so a view
 * that knows its todo id fetches only its own rows. An empty todoID is a 400
 * from the server, so callers must not call this without one. */
export declare function fetchOpenSignalsForTodo(fetchFn: FetchFn, basePath: string, todoID: string): Promise<SignalsResult>;
/** Group signals by the request they were minted from. One AskUserQuestion
 * tool call carries an array of questions and mints one signal per question,
 * all sharing a request_id, and the resolve verb is per-request — so the
 * request, not the signal, is the unit that gets answered.
 *
 * Signals with no request_id (the derived producer mints none) each get their
 * own group keyed by signal id, so a caller never has to special-case them. */
export interface SignalRequest {
    /** request_id when the group came from a parked tool call, otherwise ''. */
    requestId: string;
    sessionId: string;
    signals: Signal[];
}
export declare function groupSignalsByRequest(signals: Signal[]): SignalRequest[];
/** Answer every question in one parked request.
 *
 * `answers` is keyed by signal title, which is exactly what the server minted
 * each row's title from and exactly what it reads back to pair an answer with
 * its row (resolveSignalsForRequest in internal/server/signals.go).
 *
 * The parked hook's own tool input is fetched and passed back untouched under
 * the answers, because the resolve verb REPLACES the tool input wholesale —
 * reconstructing it from the signal rows would silently drop whatever the
 * record does not carry (multiSelect, option previews). If the request is no
 * longer parked there is nothing to answer, and that is an error the user sees
 * rather than a resolve posted into the void. */
export declare function resolveSignalQuestions(fetchFn: FetchFn, basePath: string, sessionId: string, requestId: string, answers: Record<string, string>): Promise<void>;
/** Answer a derived question by sending its answer as the session's next user
 * message.
 *
 * Derived signals carry no request_id — no hook was ever parked for them — so
 * the hook-resolve verb cannot reach them. Sending a message IS their resolve
 * verb (SESSION-SIGNALS.md, "Resolve — per kind and source").
 *
 * The record closes server-side, in the /send handler, not here: a derived
 * question answered from the CLI or by an orchestrator has to close the same
 * way as one answered from this card, and only the server sees all of them. So
 * this posts the message and nothing else. */
export declare function answerDerivedQuestion(fetchFn: FetchFn, basePath: string, sessionId: string, text: string): Promise<void>;
/** Decline every question in one parked request. Unlike answering, this needs
 * no parked input: a deny carries no updated_input, and bridge-server records
 * the decision (and closes the signal rows) even for a request whose park is
 * already gone. */
export declare function declineSignalQuestions(fetchFn: FetchFn, basePath: string, sessionId: string, requestId: string): Promise<void>;
/** Acknowledge a notification: close it without answering anything.
 *
 * Notifications are the one signal kind with no answer to deliver, so they
 * have no producer-specific resolve path — a tool notification and a derived
 * one both close here, through the signal-level verb
 * (POST /signals/{id}/resolve).
 *
 * The server refuses this for a question on purpose: a question nobody
 * answered has not been handled, and grading it "seen" would read as handled
 * on the surface that matters most, a worker's kanban card. Dismiss it
 * instead. */
export declare function acknowledgeSignal(fetchFn: FetchFn, basePath: string, signalId: string): Promise<void>;
/** Close a signal without an answer. Says out loud that no answer is coming,
 * which is the honest close for a question the user will not take — and, for
 * a derived question, what walks its session back off awaiting_user. */
export declare function dismissSignal(fetchFn: FetchFn, basePath: string, signalId: string): Promise<void>;
export interface UseOpenChatSignals {
    signals: Signal[];
    /** False once the server has answered 404 — this bridge-server has no
     * signals route, so every signal surface stays hidden. */
    available: boolean;
    loading: boolean;
    error: string | null;
    reload: () => void;
}
/** Open chat signals for one session, or across all sessions when sessionId is
 * omitted.
 *
 * There is no signal event on the SSE stream yet, so `refreshKey` is how a
 * caller says "something happened that could have minted or closed a signal" —
 * the pending-hook set changing, for instance. Callers pass a value derived
 * from state they already track; nothing here polls on a timer. */
export declare function useOpenChatSignals(sessionId?: string, refreshKey?: string | number): UseOpenChatSignals;
/** Open signals grouped by the todo they propagate to, for a view that shows
 * many todos at once. Empty until the first fetch lands, and empty forever
 * against a bridge-server with no signals route — a board full of todos must
 * render either way.
 *
 * Takes no refresh key, unlike useOpenChatSignals. The query has no dimension
 * to key on: it asks for every open signal that names a todo, whatever board
 * or session the caller happens to be looking at. Keying it to the board id
 * refetched an identical list every time the selection changed. Resolves still
 * refresh it, through the same in-process announce every signal surface uses. */
export declare function useOpenSignalsByTodo(): Map<string, Signal[]>;
//# sourceMappingURL=signalData.d.ts.map