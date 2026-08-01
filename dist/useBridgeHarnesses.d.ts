import { SharedPoll } from './sharedPoll';
import type { FetchFn, HarnessInfo } from './types';
/** The one `/harnesses` poll for this (fetch, basePath) — the same store the
 *  instances and machines hooks use, keyed on a different URL.
 *
 *  Exported for the render checks, which have no way to reach the key otherwise:
 *  this function is the copy-paste of the instances hook, and a key copied along
 *  with it would silently serve the instances answer here. Not part of the public
 *  API — `index.ts` exports only the hook. */
export declare function harnessesPoll(fetchFn: FetchFn, basePath: string): SharedPoll<HarnessInfo[]>;
export declare function useBridgeHarnesses(): {
    harnesses: HarnessInfo[];
    harnessMap: Map<string, HarnessInfo>;
    basePath: string;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};
/** The list as a `name → HarnessInfo` map. `name` is the id the rest of the
 *  system joins on: a session names its harness, an instance names its
 *  `harness_type`, and both look the row up here. */
export declare function harnessMapOf(harnesses: readonly HarnessInfo[]): Map<string, HarnessInfo>;
/** Identity of the harness *set*, for a caller that must react to a harness
 *  appearing or disappearing but not to one merely changing state.
 *
 *  Now that `/harnesses` is polled rather than fetched once, a harness coming
 *  back up delivers a new list on the next tick. A component that seeds editable
 *  state from that list — the settings form does — would reseed on that tick and
 *  discard whatever the user had typed and not yet saved. Keying its effect on
 *  this string instead of the list means only a real membership change reseeds.
 *
 *  JSON rather than a joined string because the key has to be injective: any
 *  separator can also appear inside a name, and two names that ran together
 *  would read as one, hiding exactly the membership change this exists to catch.
 *  Read it back with `harnessNamesFromKey`. */
export declare function harnessNameKey(harnesses: readonly HarnessInfo[]): string;
/** The names that went into `harnessNameKey`. */
export declare function harnessNamesFromKey(key: string): string[];
//# sourceMappingURL=useBridgeHarnesses.d.ts.map