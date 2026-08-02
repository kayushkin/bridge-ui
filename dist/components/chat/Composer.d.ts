/** The composer and the turn controls for the active session.
 *
 *  `turnRunning` is the server-reported "the harness holds the turn" state
 *  (`harnessIsWorkingOnTurn`), never a bare `uiState === 'running'`: derivation
 *  projects the deprecated `running` to `tool_running` before any consumer sees
 *  it, so that comparison is false for every session on the box and the Stop
 *  button behind it never rendered at all.
 *
 *  `resumable` says the server will actually accept POST /resume — see
 *  `sessionCanBeResumed`. It is NOT `paused`: bridge-ui's paused marker means
 *  "the user interrupted this session", whose process is still alive, which is
 *  precisely the 409 case. The marker stays (the status chip and the sidebar dot
 *  are the only record that a user stopped a session); what goes is the button
 *  behind it.
 *
 *  Stop and Resume sit BESIDE Send rather than replacing it. They are not
 *  alternatives to sending: a running turn is exactly when a user most often
 *  wants to redirect the model, and an interrupted session is continued by
 *  saying something to it. Replacing Send with Resume left a paused session with
 *  one visible action, and it was the one that could not work. */
export declare function Composer({ sessionId, connected, turnRunning, resumable, onSend, onStop, onResume }: {
    sessionId: string | null | undefined;
    connected: boolean;
    turnRunning: boolean;
    resumable: boolean;
    onSend: (text: string) => void;
    onStop: () => void;
    onResume: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Composer.d.ts.map