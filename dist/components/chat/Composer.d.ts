import { type useComposer } from '@kayushkin/chat-core';
interface ComposerProps {
    sessionId: string | null;
    /** True while the SESSION is producing output, as the server reports it (the
     *  STREAMING_STATES set in Chat). This is not `composer.sending`, which
     *  only means "my own POST /send has not returned yet" and clears in about a
     *  second — reading it as "a turn is running" is what made Stop a flicker. */
    turnRunning: boolean;
    /** The pane's ONE `useComposer` instance, owned by Chat — its `error` is
     *  hook-local, and the turns pane's status slot renders it, so both must read
     *  the same instance (the `useSessionControls` rule again). */
    composer: ReturnType<typeof useComposer>;
    /** Tells Chat which action `composer.error` now describes, so the status slot
     *  can phrase it ("couldn't stop — still running: …"). null clears the phrasing
     *  when a new action starts. */
    onFailedAction: (action: 'stop' | 'resume' | null) => void;
}
/** Draft + optimistic send for the active (or pending/new) session. Enter sends,
 *  Shift+Enter inserts a newline. Mirrors bridge-ui's Composer DOM (bc-composer-wrap /
 *  bc-composer / bc-composer-input / bc-composer-actions / bc-composer-btn /
 *  bc-btn-stop) so it inherits the shared stylesheet.
 *
 *  Stop sits BESIDE Send rather than replacing it. The two verbs are not alternatives:
 *  a running turn is exactly when a user most often wants to redirect the model, and an
 *  exclusive ternary made Send unreachable for the whole turn. Submitting mid-turn
 *  interrupts first and then sends.
 *
 *  Which turn is "running" comes from `turnRunning` (the server-reported session state),
 *  NOT from `useComposer().sending`. `sending` is this client's own in-flight POST and
 *  clears in about a second, so a Stop button keyed on it appeared for a blink at the
 *  start of a turn and was gone for all the minutes the user might actually want it.
 *
 *  **The order is load-bearing.** `send()` is fire-and-forget optimistic (it does not
 *  return a promise), so the interrupt has to be awaited BEFORE it or the two race and
 *  the new message can reach the harness while the old turn still owns it.
 *
 *  `stop()` is a LOUD control (chat-core contract): it throws on a non-2xx (e.g. the
 *  409 the server returns while a tool still holds the turn) and sets `error` — it
 *  never optimistically fakes idle. We surface that failure inline instead of
 *  swallowing it, and a submit whose interrupt failed does NOT go on to send: the turn
 *  is demonstrably still running, so sending anyway is the race the await exists to stop.
 *
 *  Send is also refused while the session-list stream is not open (`useConnState`). The
 *  POST would still be accepted by the server, but nothing would carry the reply back,
 *  so the message would look lost.
 *
 *  Resume appears when the session's harness process is gone (`resumable` — see
 *  RESUMABLE_STATES in chat-core). It is NOT keyed on `paused`: nothing on this box
 *  emits `msg.SessionPaused`, so the "⏸ paused" label this component used to carry on
 *  its own had never once rendered, and a button behind the same flag would have been
 *  the same dead code with a click handler. `resume()` is LOUD like `stop()` — a
 *  refusal is shown, never swallowed into a fake-revived session. */
export default function Composer({ sessionId, turnRunning, composer, onFailedAction }: ComposerProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Composer.d.ts.map