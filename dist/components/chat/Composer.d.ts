/** The height the auto-growing composer must be given so its content fits.
 *
 *  `scrollHeight` is content plus padding and **excludes the border**. Both hosts
 *  that mount this component reset `* { box-sizing: border-box }` (dash
 *  `src/index.css:55`, llmux `src/index.css:13`), which makes an assigned height
 *  the height of the *box* — border included. Assigning a bare `scrollHeight`
 *  therefore lands a border-width short of the content it was measured from, so
 *  the content never fits and `overflow-y: auto` gives the textarea a scrollbar at
 *  **every** size rather than only past the cap. On this origin that was 2px, and
 *  it was small enough to read as a rendering artefact for as long as it shipped.
 *
 *  The border is added back only under `border-box`. Under `content-box` the
 *  assigned height already excludes the border, so adding it would overshoot by
 *  the same amount in the other direction. Reading the used value rather than
 *  assuming either one keeps this correct for a host that resets neither.
 *
 *  No cap is applied here. `.bc-composer-input` carries `max-height: 220px` in
 *  this package's own `styles.css` (both the base rule and the themed one), so the
 *  browser clamps whatever inline height we set and `overflow-y: auto` takes over
 *  past it. This function used to compare against a duplicate `MAX_INPUT_PX = 220`
 *  in this file, which had to be kept in step with the stylesheet by hand — and
 *  which was wrong by the border anyway, since it was compared against a
 *  `scrollHeight` that means something slightly different from the height it set.
 *  Letting the stylesheet own the number leaves it in one place. */
export declare function composerAutoGrowHeightPx(measurements: {
    scrollHeight: number;
    boxSizing: string;
    borderTopWidth: string;
    borderBottomWidth: string;
}): number;
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