import type { FetchFn } from './types';
export declare const POLL_INTERVAL_MS = 30000;
export interface PollSnapshot<T> {
    readonly data: T;
    readonly loading: boolean;
    readonly error: string | null;
}
/** What one attempt to load the resource produced. A load reports failure as a
 *  value rather than throwing so the store never has to guess how to render an
 *  exception, and so each caller keeps its own error wording. */
export type LoadResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
};
type Listener = () => void;
export declare class SharedPoll<T> {
    readonly intervalMs: number;
    private readonly load;
    private readonly listeners;
    /** Counted separately from `listeners`, because a Set collapses two
     *  subscribers that happen to pass the same function and the timer would
     *  then stop while one of them is still watching. */
    private subscribers;
    private snapshot;
    /** Serialized last payload, so an unchanged answer keeps the old identity. */
    private lastJSON;
    private timer;
    private inFlight;
    constructor(load: () => Promise<LoadResult<T>>, initial: T, intervalMs?: number);
    getSnapshot: () => PollSnapshot<T>;
    /** True while a timer is running, i.e. while somebody is watching. */
    get polling(): boolean;
    get subscriberCount(): number;
    subscribe: (listener: Listener) => (() => void);
    /** Load now. Concurrent calls share one request — three components each
     *  awaiting a refresh after a write used to mean three GETs. */
    refresh: () => Promise<void>;
    private start;
    private stop;
    private run;
    private emit;
}
export declare function sharedPoll<T>(owner: object, key: string, create: () => SharedPoll<T>): SharedPoll<T>;
/** Subscribe to a shared poll for as long as the component is mounted. */
export declare function useSharedPoll<T>(poll: SharedPoll<T>): PollSnapshot<T>;
/** GET a JSON array, with the error wording the hooks have always used:
 *  `HTTP <status>` for a refused request and the stringified throw otherwise. */
export declare function loadJSONList<T>(fetchFn: FetchFn, url: string): Promise<LoadResult<T[]>>;
export {};
//# sourceMappingURL=sharedPoll.d.ts.map