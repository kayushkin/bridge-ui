/** How many collapsed folder names are kept. A collapsed folder that is later deleted
 *  leaves its name behind — there is nowhere to notice the deletion, since the folder
 *  list is empty on the first paint and pruning against it then would drop every key.
 *  A bound on the record is the answer that needs no such question. */
export declare const MAX_PERSISTED_COLLAPSED_FOLDERS = 200;
/** Whether the whole sidebar is folded down to the vertical strip. Defaults to
 *  EXPANDED, and every value this code did not write means expanded too.
 *
 *  The fallback direction is the decision here and it is not symmetric. Collapsed hides
 *  the entire session list behind a 28px bar; a user who lands on that without having
 *  asked for it has no list, no search box and no filters, and nothing on screen says
 *  why. Expanded is the state the page has always opened in, so a truncated write or a
 *  hand-edited row degrades to it rather than to a page that looks broken. */
export declare function loadSidebarCollapsed(): boolean;
export declare function saveSidebarCollapsed(collapsed: boolean): void;
/** The collapsed folder names, in the order they were collapsed. The empty string is
 *  a real member — it is the unfoldered bucket — so an absent record and a record
 *  holding `''` are different answers and the parse must not conflate them. */
export declare function loadCollapsedFolders(): Set<string>;
export declare function saveCollapsedFolders(collapsed: ReadonlySet<string>): void;
/** Whether the filter chip rows are open. Defaults to OPEN, which is what chat has
 *  always done — a stored value only ever restores a choice the user made. */
export declare function loadFiltersOpen(): boolean;
export declare function saveFiltersOpen(open: boolean): void;
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
export declare function loadInboxOpen(): boolean;
export declare function saveInboxOpen(open: boolean): void;
//# sourceMappingURL=sidebarPersistence.d.ts.map