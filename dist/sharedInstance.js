// One instance per (owner, key), for the stores this library shares between
// components.
//
// Two things live behind this: the `/instances`, `/machines` and `/harnesses`
// polls (`SharedPoll`), and the bridge-prefs record (`BridgePrefsStore`). They
// have nothing else in common, but they need the same table: a component must
// be able to ask for "the store for this URL" and get the one that already
// exists, or every caller is back to holding its own copy.
//
// Keyed on the owner first because two providers can serve the same path with
// different credentials, and those must not read each other's answer. The
// outer map is weak, so a store dies with the fetch function that owns it.
const registry = new WeakMap();
/** The instance registered under (owner, key), creating it on first ask.
 *  `create` runs at most once per pair however many callers race for it. */
export function sharedInstance(owner, key, create) {
    let byKey = registry.get(owner);
    if (!byKey) {
        byKey = new Map();
        registry.set(owner, byKey);
    }
    const existing = byKey.get(key);
    if (existing !== undefined)
        return existing;
    const made = create();
    byKey.set(key, made);
    return made;
}
//# sourceMappingURL=sharedInstance.js.map