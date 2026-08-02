/** The instance registered under (owner, key), creating it on first ask.
 *  `create` runs at most once per pair however many callers race for it. */
export declare function sharedInstance<T>(owner: object, key: string, create: () => T): T;
//# sourceMappingURL=sharedInstance.d.ts.map