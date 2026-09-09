import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import { StatusDot } from './StatusDot';
import { SignalRequestList, useOpenSignals } from '@kayushkin/chat-core';
import { useAnchoredDropdown } from './useAnchoredDropdown';
import { humanAskedFor } from './sessionAwaitingHuman';
import styles from './Chat.module.css';
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
export function SessionQuestionMarker({ sessionId, sessionName, displayState, isActiveSession, open, onToggle, onDismiss, }) {
    const { anchorRef, panelRef, panelStyle } = useAnchoredDropdown(open, onDismiss);
    const label = `Open the ${humanAskedFor(displayState)} waiting in ${sessionName}`;
    return (_jsxs("span", { className: styles.questionMarkerAnchor, ref: anchorRef, children: [_jsxs("button", { type: "button", className: `${styles.questionMarker} ${open ? styles.questionMarkerOpen : ''}`, "aria-expanded": open, "aria-haspopup": "dialog", "aria-label": label, title: label, onClick: () => onToggle(sessionId), children: [_jsx(StatusDot, { state: displayState, title: displayState }), _jsx("span", { className: styles.questionMarkerCaret, "aria-hidden": true, children: "\u25BE" })] }), open &&
                createPortal(_jsxs("div", { ref: panelRef, className: styles.questionPanel, role: "dialog", "aria-label": `${humanAskedFor(displayState)} — ${sessionName}`, "data-session-id": sessionId, 
                    // Placement is inline because it is measured, not themeable; `visibility`
                    // hides the first, unmeasured paint rather than flashing it at (0,0).
                    style: {
                        top: panelStyle?.top ?? 0,
                        left: panelStyle?.left ?? 0,
                        visibility: panelStyle ? 'visible' : 'hidden',
                    }, children: [_jsx("div", { className: styles.questionPanelTitle, children: sessionName }), isActiveSession ? (_jsx("p", { className: styles.questionPanelNote, children: "You\u2019re looking at this session \u2014 answer it in the chat, below the transcript." })) : (_jsx(SessionQuestionPanelBody, { sessionId: sessionId }))] }), document.body)] }));
}
/**
 * The open signals of one session the chat pane is NOT showing, answerable in place.
 *
 * Mounted only while its dropdown is open, which is what gates the PER-SESSION read. The
 * sidebar separately holds one cross-session read to decide which rows get a marker at all
 * (`useSessionsWithOpenQuestion`); both go through the same 30s cache in `useOpenSignals`,
 * so opening a panel for a session the list already covered costs no second request.
 *
 * Uses `useOpenSignals` + `SignalRequestList` rather than `SessionSignals` for the empty
 * case: `SessionSignals` renders nothing when there is nothing to show, which is right
 * inside a bigger surface and wrong here — the user clicked a control and an empty box
 * would be the panel refusing to say why.
 */
function SessionQuestionPanelBody({ sessionId }) {
    const { requests, available, loading, error, reload } = useOpenSignals(sessionId);
    // Said out loud rather than swallowed — the session is still blocked, and a panel that
    // silently showed nothing would look like the question had gone away.
    if (error !== null) {
        return _jsxs("p", { className: styles.questionPanelError, children: ["Couldn\u2019t load the question: ", error] });
    }
    if (loading && requests.length === 0) {
        return _jsx("p", { className: styles.questionPanelNote, children: "Loading\u2026" });
    }
    // `available === false` is the server answering 404 for /signals: this bridge-server
    // predates the route. Not an error and not "nothing is waiting" — the row's state says
    // something IS. Nothing here throws, so the sidebar renders on regardless.
    if (!available) {
        return (_jsx("p", { className: styles.questionPanelNote, children: "This bridge-server doesn\u2019t record signals, so the question can only be answered in the session itself \u2014 open the row to see it." }));
    }
    if (requests.length === 0) {
        return (_jsx("p", { className: styles.questionPanelNote, children: "No open question is recorded for this session yet \u2014 open the row to see what it is waiting on." }));
    }
    return _jsx(SignalRequestList, { requests: requests, compact: true, onResolved: reload });
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
export function FolderQuestionRollupMarker({ waitingCount, collapsed, folderLabel, onReveal, }) {
    if (waitingCount === 0)
        return null;
    const what = `${waitingCount} session${waitingCount === 1 ? '' : 's'} in ${folderLabel} waiting on you`;
    if (!collapsed) {
        return (_jsxs("span", { className: styles.folderQuestionRollupStatic, title: what, children: [_jsx("span", { className: styles.folderQuestionGlyph, "aria-hidden": true, children: "?" }), _jsx("span", { className: styles.folderQuestionCount, children: waitingCount })] }));
    }
    return (_jsxs("button", { type: "button", className: styles.folderQuestionRollup, "aria-label": `${what} — expand the folder to answer`, title: `${what} — expand to answer`, onClick: onReveal, children: [_jsx("span", { className: styles.folderQuestionGlyph, "aria-hidden": true, children: "?" }), _jsx("span", { className: styles.folderQuestionCount, children: waitingCount })] }));
}
//# sourceMappingURL=QuestionMarkers.js.map