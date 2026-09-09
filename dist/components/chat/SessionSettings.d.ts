import { type useSessionControls } from '@kayushkin/chat-core';
import type { NewSessionTarget } from './useNewSessionTarget';
/** The session controls, as the parent resolved them. See the note on `useSessionSettings`. */
type SessionControls = ReturnType<typeof useSessionControls>;
/** The per-session settings, split by how often they are reached for.
 *
 *  This file used to be `ControlsBar.tsx` and drew a second bar between the thread and
 *  the composer. The bar is gone: its controls moved onto the top bar, which is where
 *  the rest of the session's state already lived, and the row it occupied went back to
 *  the transcript. The rename is not cosmetic — nothing here is a bar any more, and a
 *  file called `ControlsBar` that renders two disconnected clusters would be lying about
 *  what it does.
 *
 *  The split is by REACH, not by capability:
 *
 *  - `SessionSettingsInline` is what sits on the top bar: the model picker and Compact.
 *    Those are the two a person touches mid-conversation, so they cost a click of zero.
 *  - `SessionSettingsPanel` is what sits inside the header's details dropdown: effort
 *    and Fork. Both are set once and then left alone, so they cost a click of one.
 *
 *  Everything is still gated on the harness's own capability set (`GET /harnesses`),
 *  never a per-harness list written here — a harness that does not advertise `model`
 *  simply gets no model picker.
 */
/** Format a token count the way a person reads one: `142k`, `1M`, `1.5M`.
 *
 *  Not `toLocaleString` — `142,336 / 1,000,000` is nineteen characters and this has to
 *  fit on a strip beside a session name. The full, exact pair stays on the strip's
 *  `title`, so the rounding here costs nothing a hover cannot recover.
 *
 *  Rounds rather than truncates: a window at 999,600 tokens reading `999k` and then
 *  jumping to `1M` is the honest sequence, where truncation would show `999k` for the
 *  last four hundred tokens before the limit and make a nearly-full window look like it
 *  had room. */
export declare function formatTokens(n: number): string;
/** Everything both clusters need, resolved once.
 *
 *  ⚠️ `controls` arrives as a PROP and is not re-resolved here. `useSessionControls`'s
 *  `compacting` is hook-local `useState`, set by whichever instance called `compact()`.
 *  The Turns pane shows a "Compacting context…" strip off the same flag, so a second
 *  call of the hook in either place would give one of them a flag that can never go
 *  true. `Chat` owns the single instance and hands it to every consumer.
 *
 *  The gate is SPLIT, not one flag. Model and effort are PRE-START settings: they are
 *  the two things a chat is worth choosing before it exists, and a user who has to send
 *  a message first has already spent a turn on the wrong model. So they resolve for a
 *  pending pane as well as a live session. Compact and Fork do not — neither means
 *  anything before there is a session to compact or fork.
 *
 *  The two halves also write to different places. On a live session a pick is a
 *  `POST /sessions/{id}/config`. On a pending pane there is no session id to post to, so
 *  the pick is recorded on the pending pane itself (`patchPending`) and chat-core applies
 *  it in the single config call it already makes right after the lazy create. */
export declare function useSessionSettings(newTarget: NewSessionTarget, controls: SessionControls): {
    capabilities: Set<string>;
    models: import("@kayushkin/chat-core").ModelOption[];
    modelValue: string;
    effortValue: string;
    chooseModel: (next: string) => void;
    chooseEffort: (next: string) => void;
    isPending: boolean;
    hasLiveSession: boolean;
    /** What the harness reports it is actually RUNNING, which is not the same question as
     *  what override is set. See the note in `ModelPicker`. */
    runningModel: string;
    /** Whether this harness can be switched between events and pty at all. */
    supportsPty: boolean;
    /** Which I/O mode the session is in now: `events`, `pty`, or empty before the
     *  summary lands. */
    sessionMode: string;
    /** True when either half of the gate is open, so a caller can skip rendering a
     *  container that would otherwise be empty. */
    anySettings: boolean;
};
type Settings = ReturnType<typeof useSessionSettings>;
/** The always-visible cluster on the top bar: the model picker, Compact, and — only when
 *  something has just been refused — the error chip.
 *
 *  Compact is icon-only now, and the percentage that used to be baked into its label has
 *  moved to the context strip along the header's bottom edge. It was on the button because
 *  there was nowhere else to put it; there is now, and a button that reports a measurement
 *  AND performs an action was doing two jobs.
 *
 *  The error chip stays inline rather than moving into the dropdown with the rest of the
 *  overflow. A refused setting is not a detail to go looking for — without it the select
 *  silently snaps back to its old value and the user is told nothing. */
export declare function SessionSettingsInline({ settings, controls, }: {
    settings: Settings;
    controls: SessionControls;
}): import("react/jsx-runtime").JSX.Element | null;
/** The overflow cluster, rendered inside the header's details dropdown: reasoning effort
 *  and Fork.
 *
 *  Both are set-once settings. Effort is picked when a chat starts and rarely touched
 *  again, and Fork is a thing done deliberately rather than in passing — neither earns a
 *  permanent slot on a row that has to stay one line wide.
 *
 *  Effort keeps the pre-start half of the gate (it is a pending-pane setting like model),
 *  Fork keeps the live half. */
export declare function SessionSettingsPanel({ settings, controls, }: {
    settings: Settings;
    controls: SessionControls;
}): import("react/jsx-runtime").JSX.Element | null;
/** The context readout: a fill bar across the header's bottom edge with the token pair and
 *  percentage sitting on it.
 *
 *  ⚠️ Renders NOTHING without a real measurement. "0%" is a different answer from "no
 *  reading yet", not a smaller one — a session that has reported no usage has no context
 *  measurement at all, and painting an empty bar with `0/0` beside it would claim it did.
 *  The old 2px hairline had the same guard for the same reason.
 *
 *  The fill is clamped to 100% while the readout is not: a session over its limit should
 *  say `210k / 200k · 105%`, which is the fact, but a bar wider than its own container is
 *  just a broken bar. */
export declare function ContextStrip({ tokens, limit, pct, }: {
    tokens: number;
    limit: number;
    pct: number;
}): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=SessionSettings.d.ts.map