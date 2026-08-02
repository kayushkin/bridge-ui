/** Faster than the 30s config polls: a machine going away is the thing this
 *  answer exists to report, so it is worth re-asking more often. Matches the
 *  interval the Workspace effect used. */
export declare const REACHABILITY_INTERVAL_MS = 15000;
/** Latest reachability for one instance, or null when it is unknown — no
 *  instance selected, or the status read did not answer.
 *
 *  Passing null/undefined starts no timer and issues no request, so a header
 *  with no session costs nothing. */
export declare function useInstanceReachable(instanceId: string | null | undefined): boolean | null;
//# sourceMappingURL=useInstanceReachable.d.ts.map