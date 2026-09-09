// The four pieces of sidebar state that belong to the COMPONENT rather than to
// chat-core: whether the sidebar itself is folded down to a strip, which folders are
// collapsed, whether the filter chip rows are open, and whether the signals inbox is
// open.
//
// The filter VALUES are not here — those live in chat-core's store and are persisted
// by `chat-core/src/store/filterStorage.ts`, because the store is what owns them and
// what has to have them in its first painted state. This file only covers state
// chat's `Sidebar` holds in `useState`.
//
// ⚠️ These keys are chat's own, and that is deliberate. dash serves bridge-ui's
// bridge-ui's chat beside its own while both existed, so they shared one origin and one
// localStorage. Reusing bridge-ui's `bridge-folder-collapsed` would have the two
// pages overwrite each other's collapse record, and they do not even agree on what a
// key means: chat keys collapse by the REAL folder name, with `''` for the
// unfoldered bucket that it labels "active", while bridge-ui keys its own buckets its
// own way. Same for the filter bar: bridge-ui's `bridge-ui-filter-collapsed` stores
// COLLAPSED and defaults to true, chat's filter section defaults to OPEN. Sharing
// either key would flip a default rather than restore a choice.
import { chatKey, migrateLegacyKeys } from './storageKeys';
// Keys live under the chat prefix. They were written under the page's old prefix while
// it had its old name, and `storageKeys.ts` carries those rows over on first read — see
// the `migrateLegacyKeys` call in `storage()` below. Add a key here AND to MIGRATED_KEYS.
const SIDEBAR_COLLAPSED_KEY = chatKey('sidebar-collapsed');
const FOLDER_COLLAPSED_KEY = chatKey('folder-collapsed');
const FILTERS_OPEN_KEY = chatKey('filters-open');
const INBOX_OPEN_KEY = chatKey('inbox-open');
const MIGRATED_KEYS = [SIDEBAR_COLLAPSED_KEY, FOLDER_COLLAPSED_KEY, FILTERS_OPEN_KEY, INBOX_OPEN_KEY];
/** How many collapsed folder names are kept. A collapsed folder that is later deleted
 *  leaves its name behind — there is nowhere to notice the deletion, since the folder
 *  list is empty on the first paint and pruning against it then would drop every key.
 *  A bound on the record is the answer that needs no such question. */
export const MAX_PERSISTED_COLLAPSED_FOLDERS = 200;
/** Whether persistence works here at all. Checks the METHODS rather than the name —
 *  see chat-core's `webStorage.ts` for the Node/SSR/blocked-by-policy cases this
 *  covers. */
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
/** Whether the whole sidebar is folded down to the vertical strip. Defaults to
 *  EXPANDED, and every value this code did not write means expanded too.
 *
 *  The fallback direction is the decision here and it is not symmetric. Collapsed hides
 *  the entire session list behind a 28px bar; a user who lands on that without having
 *  asked for it has no list, no search box and no filters, and nothing on screen says
 *  why. Expanded is the state the page has always opened in, so a truncated write or a
 *  hand-edited row degrades to it rather than to a page that looks broken. */
export function loadSidebarCollapsed() {
    const store = storage();
    if (!store)
        return false;
    try {
        return store.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    }
    catch {
        return false;
    }
}
export function saveSidebarCollapsed(collapsed) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    }
    catch {
        // A full or refused quota must not cost the user the click they just made.
    }
}
/** The collapsed folder names, in the order they were collapsed. The empty string is
 *  a real member — it is the unfoldered bucket — so an absent record and a record
 *  holding `''` are different answers and the parse must not conflate them. */
export function loadCollapsedFolders() {
    const store = storage();
    if (!store)
        return new Set();
    try {
        const raw = store.getItem(FOLDER_COLLAPSED_KEY);
        if (!raw)
            return new Set();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return new Set();
        return new Set(parsed.filter((v) => typeof v === 'string').slice(-MAX_PERSISTED_COLLAPSED_FOLDERS));
    }
    catch {
        return new Set();
    }
}
export function saveCollapsedFolders(collapsed) {
    const store = storage();
    if (!store)
        return;
    try {
        if (collapsed.size === 0) {
            // Nothing collapsed is the state the sidebar starts in, so keeping a row that
            // says so only leaves something to mis-read.
            store.removeItem(FOLDER_COLLAPSED_KEY);
            return;
        }
        // A Set iterates in insertion order, so the tail is the most recently collapsed —
        // which is what to keep when the bound bites.
        store.setItem(FOLDER_COLLAPSED_KEY, JSON.stringify([...collapsed].slice(-MAX_PERSISTED_COLLAPSED_FOLDERS)));
    }
    catch {
        // A full or refused quota must not cost the user the click they just made.
    }
}
/** Whether the filter chip rows are open. Defaults to OPEN, which is what chat has
 *  always done — a stored value only ever restores a choice the user made. */
export function loadFiltersOpen() {
    const store = storage();
    if (!store)
        return true;
    try {
        const raw = store.getItem(FILTERS_OPEN_KEY);
        // Absent means "never chosen", not "closed". Only the two values this writes are
        // honoured; anything else is treated as absent.
        if (raw === 'false')
            return false;
        return true;
    }
    catch {
        return true;
    }
}
export function saveFiltersOpen(open) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(FILTERS_OPEN_KEY, String(open));
    }
    catch {
        // As above — losing the preference is not worth losing the interaction.
    }
}
/** Whether the signals inbox is expanded. Defaults to OPEN.
 *
 *  Open, because the inbox exists to show what you would otherwise never see: a
 *  session that raised a question and then went quiet sinks out of the sidebar's
 *  newest-first page, and its `?` marker goes with it. Shipping that collapsed would
 *  reproduce the invisibility the panel is there to fix — the user cannot choose to
 *  open something they do not know is holding anything.
 *
 *  It collapses to a one-line count rather than disappearing, so the choice is
 *  reversible from the same spot. */
export function loadInboxOpen() {
    const store = storage();
    if (!store)
        return true;
    try {
        // Absent means "never chosen", not "closed" — same rule as the filter rows.
        return store.getItem(INBOX_OPEN_KEY) !== 'false';
    }
    catch {
        return true;
    }
}
export function saveInboxOpen(open) {
    const store = storage();
    if (!store)
        return;
    try {
        store.setItem(INBOX_OPEN_KEY, String(open));
    }
    catch {
        // As above — losing the preference is not worth losing the interaction.
    }
}
//# sourceMappingURL=sidebarPersistence.js.map