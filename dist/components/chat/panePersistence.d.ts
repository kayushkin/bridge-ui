/** The panes chat can draw.
 *
 *  `raw` is not here, and that is the one call this record had to make. bridge-ui has no
 *  `PaneKey` for it, so the two vocabularies are not a superset relation and the answer
 *  could not be copied. It was measured instead: `TurnList` takes `view: 'turns' | 'raw'`
 *  (`TurnList.tsx`) and renders the same transcript either way — Raw keeps the
 *  duplicates, the source and the eventId that the collapsed view drops. One component,
 *  two renderings of one thing. `Timeline` is a different component over a different
 *  derivation (`selectTimeline`).
 *
 *  So Raw is a MODE of the Turns pane, alongside the MD/TXT toggle that already modifies
 *  it, and not a pane of its own. Making it a third pane would have offered the user
 *  "show Turns beside Raw", which is the same transcript twice.
 *
 *  `kanban` IS here, and it is a pane rather than a mode for the mirror-image reason:
 *  `LinkedKanbanPanel` is a different component over a different backend
 *  (kanban-store, polled — it has no notifier), showing the cards linked to the
 *  session rather than any rendering of the transcript. "Show Turns beside the cards"
 *  is a thing a reader wants; "show Turns beside Turns" is not.
 *
 *  `git` IS here for the same reason as `kanban`, and it is the one pane bridge-ui had
 *  that dash could not reach any other way: the orchestrator has its own page at
 *  `/orchestrator` and the kanban board has `/kanban`, but `GitPanel` was mounted from
 *  the chat workspace and nowhere else, so removing that chat would have removed the
 *  repo, the branch and the working-tree diff from dash entirely. It shows what the
 *  agent has DONE to the tree while the transcript shows what it said about it, which
 *  is the pairing the pane exists for.
 *
 *  `attach` is the terminal of a session running in pty mode, and it is the ONE pane
 *  whose visibility is not this record's decision alone. A session in events mode has no
 *  pty hub to join, so the pane cannot be drawn for it whatever the stored flag says —
 *  see `visiblePanes`, which takes that as an argument rather than reading it here. The
 *  flag still means what it means: it is the user's answer for the sessions where the
 *  question can be asked at all. */
export type PaneKey = 'turns' | 'timeline' | 'kanban' | 'git' | 'attach';
/** Draw order, left to right. The array is the layout — `visiblePanes` filters it and
 *  the row renders what comes back, so moving an entry here moves the pane on screen. */
export declare const PANE_KEYS: readonly PaneKey[];
/** Hidden, not visible — bridge-ui's polarity, kept because an absent flag then means
 *  "shown", which is the state a pane should degrade to. */
export type PanesHidden = Record<PaneKey, boolean>;
/** What chat has always opened as: the Turns pane, alone. Timeline starts hidden so
 *  the change is additive — nobody who never touches the toggles sees a different page. */
export declare const DEFAULT_PANES_HIDDEN: PanesHidden;
/** How the visible panes divide the row between them, in flex-grow units.
 *
 *  Grow units and not pixels, and not percentages. The panes are laid out
 *  `flex: <grow> 1 0`, so a pane's width is its share of the pair's total — which
 *  means a stored record stays meaningful at a window width it was never written at.
 *  A pixel record would not: restore 900px of Turns into a 700px window and the
 *  arithmetic is already wrong before the first paint.
 *
 *  ⚠️ Only the RATIO is meaningful, never the magnitudes. `{turns: 2, timeline: 1}`
 *  and `{turns: 20, timeline: 10}` are the same layout, and `splitGrowUnitsAfterDrag`
 *  conserves the pair's total rather than normalising it — so whatever total a drag
 *  starts from is the total it writes back. Nothing may read a single pane's number
 *  and conclude anything from it alone. */
export type PaneSizes = Record<PaneKey, number>;
/** Even. Both panes `flex: 1 1 0` is what `styles.css` already gives them, so a user
 *  who never drags the boundary sees exactly the page they saw before sizes existed. */
export declare const DEFAULT_PANE_SIZES: PaneSizes;
/** Turns, matching what a cold desktop load opens as. */
export declare const DEFAULT_MOBILE_PANE: PaneKey;
/** The panes on screen, in draw order.
 *
 *  Derived from `PANE_KEYS` rather than from the record's own key order, because a
 *  record read back from storage carries whatever order it was written in — and with
 *  the merge in `loadPanesHidden` that is the order of whichever build wrote it last.
 *  Layout must not depend on that.
 *
 *  The row draws a drag handle between each ADJACENT pair of what this returns, so a
 *  pane hidden in the middle closes the gap and the two survivors become neighbours
 *  with one boundary — rather than leaving a handle that measures a pane nobody can
 *  see. */
export declare function visiblePanes(panesHidden: PanesHidden, drawable?: PaneDrawable): PaneKey[];
/** Which conditionally-drawable panes can be drawn for THIS session right now.
 *
 *  Only `attach` so far. It is separated from `PanesHidden` rather than folded into it
 *  because the two answer different questions and are owned by different things: hidden
 *  is the user's choice and persists, drawable is a fact about the session and changes
 *  under them. Writing "not drawable" into the stored record would forget the user's
 *  choice the first time they opened an events-mode session, and they would have to make
 *  it again on the next pty one.
 *
 *  Absent means NOT drawable, which is why the check above is `=== true`. A caller that
 *  has not yet learned the session's mode must not flash a terminal for a session that
 *  turns out to be in events mode — the pane would mount, ask for an attach token, and
 *  be told there is no hub. */
export interface PaneDrawable {
    attach?: boolean;
}
/** The stored visibility, merged over the defaults.
 *
 *  Merged rather than replaced, and per key rather than per record. A pane the stored
 *  record has never heard of — every pane added after the row was written — takes ITS
 *  OWN default, which is the only answer that stays right as `PaneKey` grows. Replacing
 *  the whole record on a partial read would instead give a new pane whatever `false`
 *  happens to mean for it.
 *
 *  Only booleans under known keys are honoured. Anything else is treated as absent, so a
 *  truncated write or a hand-edited row degrades to the page chat has always opened as
 *  rather than to a pane set nobody chose.
 *
 *  ⚠️ There is no `Array.isArray` guard, and its absence is measured rather than
 *  overlooked. One was written and then deleted: removing it changed no answer, because
 *  an array IS an object and the merge below drops every key it does not know and every
 *  value that is not a boolean — an array's keys are `0`, `1`, `length`, never a
 *  `PaneKey`. A guard that cannot change an answer is one more thing claiming to do work
 *  it does not do. The object check stays, because it turns "the row held a number" into
 *  an answer rather than into a TypeError the catch below happens to absorb. */
export declare function loadPanesHidden(): PanesHidden;
/** Written whole and on both edges, never removed on the default. Hiding Turns and
 *  revealing it again are both choices, and the second one has to survive a reload as
 *  much as the first — removing the row instead would be indistinguishable from never
 *  having chosen, which matters the day a default changes. */
export declare function savePanesHidden(panesHidden: PanesHidden): void;
/** The stored sizes, merged over the defaults per key — `loadPanesHidden`'s rule, and
 *  for its reason: a pane added after the row was written takes its own default rather
 *  than whatever a missing key would coerce to.
 *
 *  ⚠️ A value must be finite AND strictly positive, and that is a correctness check
 *  rather than tidiness. `measureSplitDragGeometry` returns null on a pair whose grow
 *  units total zero or less, and a null geometry makes the handle a silent no-op — so a
 *  row holding `{"turns": 0, "timeline": 0}`, from a hand edit or a truncated write,
 *  would leave a resizer on screen that cannot be dragged and says nothing about why.
 *  A negative would be worse: flex treats it as invalid and the pair's total stops
 *  describing the pair. Rejecting per key means the good half of a half-corrupt row
 *  still survives. */
export declare function loadPaneSizes(): PaneSizes;
/** Written whole, including a write back to the even split — for the reason
 *  `savePanesHidden` gives: dragging the boundary back to the middle, or
 *  double-clicking to reset it, is as much a choice as moving it was. */
export declare function savePaneSizes(paneSizes: PaneSizes): void;
/** The stored mobile pane, or the default.
 *
 *  Checked against `PANE_KEYS` rather than merged, because this record holds one value
 *  and not a set: a stored name this page has no renderer for has no partial reading to
 *  salvage. A row left by an older build, or by a hand edit, degrades to Turns — the
 *  pane every load of this page has always opened with. */
export declare function loadMobilePane(): PaneKey;
/** Collapsed. The rails and glyphs are meant to be legible without it — the legend is
 *  for the first read, not for every one. */
export declare const DEFAULT_VIBE_LEGEND_OPEN = false;
export declare function loadVibeLegendOpen(): boolean;
/** Written on both edges, including a close back to the default — for the reason
 *  `savePanesHidden` gives: shutting it again is a choice too. */
export declare function saveVibeLegendOpen(open: boolean): void;
/** Written on every pick, including a pick of the default — for the reason
 *  `savePanesHidden` states: choosing Turns back is as much a choice as leaving it. */
export declare function saveMobilePane(pane: PaneKey): void;
//# sourceMappingURL=panePersistence.d.ts.map