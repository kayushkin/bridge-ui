/** What the rails and glyphs beside an assistant's answer mean.
 *
 *  ONE per pane, not one per turn — the scheme is identical in every turn, so repeating
 *  it would be repeating the same six rows down the whole transcript.
 *
 *  It mounts as a pane-level sibling of the virtualized scroller, exactly like the
 *  "Compacting context…" strip and the jump-to-latest button, and for the same reason
 *  stated there: `bc-turns-body` is a virtua `VList` whose children are windowed rows, so
 *  anything placed inside it becomes row n+1, shifts the sticky-bottom index and vanishes
 *  when it scrolls out of the window.
 *
 *  It is deliberately NOT in the session header. chat's Turns pane has no header at all
 *  (todo `ff52df0e`), and inventing one to hold a legend would pre-empt a placement
 *  decision that is the user's — where chat's pane chrome lives is an open question with
 *  its own todo. A floating control needs no answer to it.
 *
 *  Its open state persists per pane (`panePersistence.ts`), read ONCE into state: this is
 *  chrome, and re-reading localStorage on every render of a streaming pane would be a
 *  synchronous storage hit per token. */
export default function VibeLegend(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=VibeLegend.d.ts.map