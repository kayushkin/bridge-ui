// Which of the thread's panes are on screen. chat used to draw exactly one — an
// exclusive `'turns' | 'raw' | 'timeline'` switch in `SessionHeader` — so Turns and
// Timeline could never be read at the same time. This record replaces the exclusive
// part of that switch with a per-pane visibility flag, which is what bridge-ui's
// `PanesHidden` (bridge-ui `chat/types.ts`) has always been.
//
// ⚠️ The key is chat's own, for the reason `sidebarPersistence.ts` states at length:
// dash served bridge-ui's chat beside its own while both existed — one origin and one
// localStorage. bridge-ui persists its own visibility inside the single
// `bridge-ui-workspaces` blob, keyed per workspace and validated by its own parser, so
// there is no shared row to join on even if the two pages wanted one.
import { chatKey, migrateLegacyKeys } from './storageKeys';
/** Draw order, left to right. The array is the layout — `visiblePanes` filters it and
 *  the row renders what comes back, so moving an entry here moves the pane on screen. */
export const PANE_KEYS = ['turns', 'timeline', 'kanban', 'git', 'attach'];
/** What chat has always opened as: the Turns pane, alone. Timeline starts hidden so
 *  the change is additive — nobody who never touches the toggles sees a different page. */
export const DEFAULT_PANES_HIDDEN = {
    turns: false,
    timeline: true,
    kanban: true,
    git: true,
    attach: true,
};
// Keys live under the chat prefix. They were written under the page's old prefix while
// it had its old name, and `storageKeys.ts` carries those rows over on first read — see
// the `migrateLegacyKeys` call in `storage()` below. Add a key here AND to MIGRATED_KEYS.
const PANES_HIDDEN_KEY = chatKey('panes-hidden');
/** Even. Both panes `flex: 1 1 0` is what `styles.css` already gives them, so a user
 *  who never drags the boundary sees exactly the page they saw before sizes existed. */
export const DEFAULT_PANE_SIZES = {
    turns: 1,
    timeline: 1,
    kanban: 1,
    git: 1,
    attach: 1,
};
const PANE_SIZES_KEY = chatKey('pane-sizes');
/** Which single pane the minimal (mobile) chrome draws.
 *
 *  Below 640px the thread is one pane wide, so the visibility RECORD above cannot
 *  answer what to show: it can say "both", and both is what does not fit. The minimal
 *  chrome asks a different question — which ONE — so it gets its own answer rather
 *  than a reading of `panesHidden` that would have to invent a winner when the user
 *  has revealed two panes on the desktop.
 *
 *  The two records are kept apart on purpose, in both directions: widening the phone
 *  back out restores exactly the panes the user had arranged there, and picking
 *  Timeline on a phone does not hide Turns on the desktop.
 *
 *  ⚠️ This is chat's own key, and NOT bridge-ui's `bridge-mobile-pane`. The library
 *  stores the same idea under that key typed as its own `PaneKey` — seven members,
 *  including `thread`, `git` and `kanban`, which this page cannot draw. dash serves
 *  both surfaces from one origin and one localStorage, so sharing the row would mean
 *  reading back a pane with no renderer here, and writing `turns` over a `git` the
 *  user chose on the chat at `/`. The vocabularies are not a superset relation
 *  (`PaneKey` above says why `raw` is not in this one either), so there is no row to
 *  join on — the same reasoning `sidebarPersistence.ts` and the header of this file
 *  already record. */
const MOBILE_PANE_KEY = chatKey('mobile-pane');
/** Turns, matching what a cold desktop load opens as. */
export const DEFAULT_MOBILE_PANE = 'turns';
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
export function visiblePanes(panesHidden, drawable = {}) {
    return PANE_KEYS.filter(key => {
        if (panesHidden[key])
            return false;
        if (key === 'attach')
            return drawable.attach === true;
        return true;
    });
}
/** Whether persistence works here at all. Checks the METHODS rather than the name — see
 *  chat-core's `webStorage.ts` for the Node/SSR/blocked-by-policy cases this covers.
 *  Duplicated from `sidebarPersistence.ts` rather than shared, for the reason
 *  `threadPersistence.ts` gives for its own copy: the three files are independent, and a
 *  shared helper would be the only thing tying their storage together. */
function storage() {
    try {
        if (typeof window === 'undefined')
            return null;
        const candidate = window.localStorage;
        if (!candidate ||
            typeof candidate.getItem !== 'function' ||
            typeof candidate.setItem !== 'function' ||
            typeof candidate.removeItem !== 'function') {
            return null;
        }
        // First read after the rename carries the legacy rows across; see storageKeys.ts.
        migrateLegacyKeys(candidate, MIGRATED_KEYS);
        return candidate;
    }
    catch {
        return null;
    }
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
export function loadPanesHidden() {
    const store = storage();
    if (!store)
        return { ...DEFAULT_PANES_HIDDEN };
    try {
        const raw = store.getItem(PANES_HIDDEN_KEY);
        if (!raw)
            return { ...DEFAULT_PANES_HIDDEN };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return { ...DEFAULT_PANES_HIDDEN };
        const record = parsed;
        const merged = { ...DEFAULT_PANES_HIDDEN };
        for (const key of PANE_KEYS) {
            const value = record[key];
            if (typeof value === 'boolean')
                merged[key] = value;
        }
        return merged;
    }
    catch {
        return { ...DEFAULT_PANES_HIDDEN };
    }
}
/** Written whole and on both edges, never removed on the default. Hiding Turns and
 *  revealing it again are both choices, and the second one has to survive a reload as
 *  much as the first — removing the row instead would be indistinguishable from never
 *  having chosen, which matters the day a default changes. */
export function savePanesHidden(panesHidden) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(PANES_HIDDEN_KEY, JSON.stringify(panesHidden));
    }
    catch {
        // A full or refused quota must not cost the user the click they just made.
    }
}
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
export function loadPaneSizes() {
    const store = storage();
    if (!store)
        return { ...DEFAULT_PANE_SIZES };
    try {
        const raw = store.getItem(PANE_SIZES_KEY);
        if (!raw)
            return { ...DEFAULT_PANE_SIZES };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return { ...DEFAULT_PANE_SIZES };
        const record = parsed;
        const merged = { ...DEFAULT_PANE_SIZES };
        for (const key of PANE_KEYS) {
            const value = record[key];
            if (typeof value === 'number' && Number.isFinite(value) && value > 0)
                merged[key] = value;
        }
        return merged;
    }
    catch {
        return { ...DEFAULT_PANE_SIZES };
    }
}
/** Written whole, including a write back to the even split — for the reason
 *  `savePanesHidden` gives: dragging the boundary back to the middle, or
 *  double-clicking to reset it, is as much a choice as moving it was. */
export function savePaneSizes(paneSizes) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(PANE_SIZES_KEY, JSON.stringify(paneSizes));
    }
    catch {
        // A full or refused quota must not cost the user the drag they just made.
    }
}
/** The stored mobile pane, or the default.
 *
 *  Checked against `PANE_KEYS` rather than merged, because this record holds one value
 *  and not a set: a stored name this page has no renderer for has no partial reading to
 *  salvage. A row left by an older build, or by a hand edit, degrades to Turns — the
 *  pane every load of this page has always opened with. */
export function loadMobilePane() {
    const store = storage();
    if (!store)
        return DEFAULT_MOBILE_PANE;
    try {
        const raw = store.getItem(MOBILE_PANE_KEY);
        if (!raw)
            return DEFAULT_MOBILE_PANE;
        if (PANE_KEYS.includes(raw))
            return raw;
        return DEFAULT_MOBILE_PANE;
    }
    catch {
        return DEFAULT_MOBILE_PANE;
    }
}
/** Whether the Turns pane's vibe legend is expanded.
 *
 *  Per PANE, not per turn and not per session: the legend explains a colour scheme that
 *  is the same in every turn of every session, so a reader who has learnt it wants it
 *  shut everywhere and a reader who has not wants it open everywhere.
 *
 *  It lives here rather than in `threadPersistence.ts` for the same reason the two
 *  records above do — it is a property of what the pane is drawing, not of which session
 *  is open. */
const VIBE_LEGEND_KEY = chatKey('vibe-legend-open');
const MIGRATED_KEYS = [PANES_HIDDEN_KEY, PANE_SIZES_KEY, MOBILE_PANE_KEY, VIBE_LEGEND_KEY];
/** Collapsed. The rails and glyphs are meant to be legible without it — the legend is
 *  for the first read, not for every one. */
export const DEFAULT_VIBE_LEGEND_OPEN = false;
export function loadVibeLegendOpen() {
    const store = storage();
    if (!store)
        return DEFAULT_VIBE_LEGEND_OPEN;
    try {
        const raw = store.getItem(VIBE_LEGEND_KEY);
        if (raw === null)
            return DEFAULT_VIBE_LEGEND_OPEN;
        // Compared against the two values this writes, not coerced. A row holding anything
        // else was not written by this page, and truthiness would turn `"false"` into open.
        if (raw === 'true')
            return true;
        if (raw === 'false')
            return false;
        return DEFAULT_VIBE_LEGEND_OPEN;
    }
    catch {
        return DEFAULT_VIBE_LEGEND_OPEN;
    }
}
/** Written on both edges, including a close back to the default — for the reason
 *  `savePanesHidden` gives: shutting it again is a choice too. */
export function saveVibeLegendOpen(open) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(VIBE_LEGEND_KEY, open ? 'true' : 'false');
    }
    catch {
        // A full or refused quota must not cost the user the click they just made.
    }
}
/** Written on every pick, including a pick of the default — for the reason
 *  `savePanesHidden` states: choosing Turns back is as much a choice as leaving it. */
export function saveMobilePane(pane) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(MOBILE_PANE_KEY, pane);
    }
    catch {
        // A full or refused quota must not cost the user the click they just made.
    }
}
//# sourceMappingURL=panePersistence.js.map