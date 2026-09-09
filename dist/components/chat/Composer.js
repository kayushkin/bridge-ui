import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useConnState } from '@kayushkin/chat-core';
import { composerAutoGrowHeightPx } from './composerAutoGrow';
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
export default function Composer({ sessionId, turnRunning, composer, onFailedAction }) {
    const { send, draft, setDraft, sending, stop, interrupting, resume, resuming, resumable } = composer;
    const connState = useConnState();
    // 'open' is the only state in which updates are actually flowing: a dropped stream
    // goes back to 'connecting' for its backoff, and 'idle' is the pre-start window. So
    // the test is `=== 'open'`, never `!== 'closed'`.
    const connected = connState === 'open';
    const ref = useRef(null);
    // Which-action-failed phrasing lives in Chat now (`onFailedAction`), because the
    // message renders in the turns pane's status slot, not here — this component only
    // reports which of its buttons the hook's `error` belongs to.
    // Focus the composer once per session, when the active session changes — mirrors
    // bridge-ui's Composer so opening a chat lands the cursor in the input. Keyed on the
    // session id (not every render) so it doesn't steal focus back mid-typing.
    const focusedForSession = useRef(null);
    useEffect(() => {
        if (sessionId && focusedForSession.current !== sessionId) {
            ref.current?.focus();
            focusedForSession.current = sessionId;
        }
    }, [sessionId]);
    // Auto-grow, so a long message is not composed through a one-line slit. Two details
    // are load-bearing:
    //
    //  - The reset to `0px` first. `scrollHeight` never reports smaller than the box it
    //    is measuring, so without the reset the textarea only ever grows and never comes
    //    back down when the draft is deleted.
    //  - `useLayoutEffect`, not `useEffect`. The measure-and-resize has to happen before
    //    the browser paints, or every keystroke that changes the line count paints once
    //    at the old height first and the box visibly jumps. ⚠️ Nothing in
    //    `e2e/chat-composer-autogrow.spec.ts` catches this one: swapping in `useEffect`
    //    was tried and the whole spec stayed green, because the difference is a single
    //    frame and every assertion there reads a settled height. Do not read the green
    //    suite as permission to change it.
    //
    // The CAP is not written here. `.bc-composer-input` carries `max-height: 220px` in
    // bridge-ui's stylesheet, which this page loads, so the browser clamps the inline
    // height we set and `overflow-y: auto` takes over past the cap. bridge-ui's own
    // Composer duplicates that number as `MAX_INPUT_PX` and then has to keep the two in
    // step by hand; reading nothing and letting the stylesheet decide leaves the cap in
    // one place.
    //
    // `scrollHeight` excludes the border, and dash sets `box-sizing: border-box` on
    // everything (`src/index.css:55`), so the height we assign has to add the border back
    // or the box lands a border-width short of its own content and scrolls by that much
    // forever. The correction lives in bridge-ui as `composerAutoGrowHeightPx` and is
    // called rather than repeated: this page derived it independently, and the two other
    // composers on this fleet that derived it independently both got it wrong.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const computed = window.getComputedStyle(el);
        el.style.height = '0px';
        el.style.height = `${composerAutoGrowHeightPx({
            scrollHeight: el.scrollHeight,
            boxSizing: computed.boxSizing,
            borderTopWidth: computed.borderTopWidth,
            borderBottomWidth: computed.borderBottomWidth,
        })}px`;
    }, [draft]);
    const doStop = async () => {
        onFailedAction(null);
        try {
            await stop();
        }
        catch {
            // The hook already set `error` and did NOT mark the session idle. We only
            // report that this was a stop failure, for the status slot's phrasing.
            onFailedAction('stop');
        }
    };
    const doResume = async () => {
        onFailedAction(null);
        try {
            await resume();
        }
        catch {
            // LOUD, like stop(): the hook set `error` and did not pretend the session is
            // back. A 409 here means the process turned out to be alive after all; a 500
            // means the session is bound to no instance and cannot be respawned.
            onFailedAction('resume');
        }
    };
    const submit = async () => {
        if (!draft.trim() || !connected || interrupting || sending)
            return;
        // Clear the phrasing up front. `error` is now also set by a failed SEND — it
        // used to be swallowed — and a stale flag from an earlier stop or resume would
        // label the send's own message "couldn't stop".
        onFailedAction(null);
        // Mid-turn submit: interrupt, and only send once the interrupt has landed.
        if (turnRunning) {
            try {
                await stop();
            }
            catch {
                // A stop that failed leaves the turn running. Sending now is the race the
                // await is here to prevent, so stop at the error the hook already surfaced.
                onFailedAction('stop');
                return;
            }
            onFailedAction(null);
        }
        send(draft);
    };
    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
        }
    };
    return (_jsx("div", { className: "bc-composer-wrap", children: _jsxs("div", { className: "bc-composer", children: [_jsx("textarea", { ref: ref, className: "bc-composer-input", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: onKeyDown, placeholder: connected ? 'Send a message...' : 'Waiting for the connection…', rows: 1 }), _jsxs("div", { className: "bc-composer-actions", children: [_jsx("button", { className: "bc-composer-btn", onClick: () => void submit(), disabled: !draft.trim() || !connected || interrupting || sending, title: !connected
                                ? 'Not connected'
                                : turnRunning
                                    ? 'Send (interrupts the running turn first)'
                                    : 'Send', children: "Send" }), turnRunning && (_jsx("button", { className: "bc-composer-btn bc-btn-stop", onClick: () => void doStop(), disabled: interrupting, title: "Interrupt the running turn", children: interrupting ? 'Stopping…' : 'Stop' })), resumable && (_jsx("button", { className: "bc-composer-btn bc-btn-resume", onClick: () => void doResume(), disabled: resuming, title: "Start this session's harness process again", children: resuming ? 'Resuming…' : 'Resume' }))] })] }) }));
}
//# sourceMappingURL=Composer.js.map