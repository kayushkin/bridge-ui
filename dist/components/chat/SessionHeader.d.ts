import { type useSessionControls } from '@kayushkin/chat-core';
import { type useSessionSettings } from './SessionSettings';
import { type PaneDrawable, type PaneKey, type PanesHidden } from './panePersistence';
type SessionControls = ReturnType<typeof useSessionControls>;
type Settings = ReturnType<typeof useSessionSettings>;
interface SessionHeaderProps {
    panesHidden: PanesHidden;
    /** Which conditionally-drawable panes this session can draw right now. Separate from
     *  `panesHidden` because it is a fact about the session rather than the user's choice —
     *  see `panePersistence.ts`'s `PaneDrawable`. */
    paneDrawable: PaneDrawable;
    /** Flips one pane's visibility. Not a setter for the whole record: every caller here is
     *  a single button, and handing them the record would let a click on Turns decide
     *  anything about Timeline. */
    togglePane: (key: PaneKey) => void;
    /** Whether the Turns pane renders its raw audit view (duplicates, source, eventId)
     *  instead of the collapsed one. A mode of that pane, not a pane — see
     *  `panePersistence.ts`'s note on `PaneKey`. */
    raw: boolean;
    setRaw: (v: boolean) => void;
    markdown: boolean;
    setMarkdown: (v: boolean) => void;
    /** Per-session settings, resolved ONCE by `Chat` and shared. See `useSessionSettings`. */
    settings: Settings;
    /** The single `useSessionControls` instance. See the warning on `useSessionSettings`. */
    controls: SessionControls;
}
/** The top bar: everything the active session is, doing, and set to, on one row.
 *
 *  ## What changed, and why it is one bar now
 *
 *  There used to be two. This header carried identity (status, name, harness, machine,
 *  cost, permission mode, Tools, Prompt, Done, nav arrows, pane toggles) and a separate
 *  `bc-controls-bar` sat between the thread and the composer carrying model, effort,
 *  Compact and Fork. Two rows of chrome for one session, and the split was historical
 *  rather than meaningful — it came from bridge-ui's own layout, where the bar predates
 *  the header.
 *
 *  Merging them bought back a row of vertical space for the transcript, which is the only
 *  thing on this page anybody is actually reading.
 *
 *  ## What stays on the row, and what went behind the caret
 *
 *  The row carries what is worth knowing WITHOUT asking: the status dot, the session
 *  name, cost, the model picker, Compact, the view toggles, and Done. Everything else
 *  moved into the details dropdown — the harness and machine by full name, the nav
 *  arrows, the permission controls, Tools, Prompt, Fork and effort — because each is
 *  either read once or set once, and a row that shows everything shows nothing.
 *
 *  Two things deliberately survived the cull in miniature. The machine keeps its emoji
 *  and its reachability DOT, without its name: the name is what made it wide, but the dot
 *  is the only thing on screen that says the host a session is pinned to has gone away,
 *  and burying that behind a click would mean a dead session looks healthy. The harness
 *  keeps its logo for the same reason in reverse — it is already only an image, it costs
 *  16px, and it is how you tell two otherwise identical sessions apart at a glance.
 *
 *  ## The row no longer wraps
 *
 *  `.bc-header-row` is `flex-wrap: wrap` in bridge-ui's stylesheet, and every chip on it
 *  is `flex-shrink: 0` while `.bc-session-name` has no `min-width: 0`. Nothing could give,
 *  so a long name pushed the right-hand cluster onto a second line and the "one bar" was
 *  two again at any realistic width. `styles.headerRow` sets `nowrap` and `styles.headerName`
 *  makes the name the single shrinkable element, so narrowing truncates the name — the one
 *  thing on the row that survives being cut short — instead of reflowing the chrome.
 *
 *  ## The context readout is along the bottom edge
 *
 *  `ContextStrip` replaces two readouts that disagreed about where they lived: a 2px
 *  hairline that carried no numbers and a percentage baked into the Compact button's
 *  label. See the note on that component. */
export default function SessionHeader({ panesHidden, paneDrawable, togglePane, raw, setRaw, markdown, setMarkdown, settings, controls, }: SessionHeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SessionHeader.d.ts.map