/** The chat page's localStorage key prefix, and the one-time carry-over from the
 *  prefix it had under the page's old name.
 *
 *  A storage key is a contract with the user's browser, not an internal name. Renaming
 *  one does not move a stored value, it abandons it: every preference under the old
 *  prefix — sidebar collapsed, pane sizes, markdown on or off, and six more — would
 *  silently reset to its default on the next load. So the rename of the page did not
 *  rename these, and this file is what finally lets it: each persistence module hands
 *  its keys to `migrateLegacyKeys` from its own `storage()` accessor, so the first read
 *  after the rename copies the legacy row across and deletes it.
 *
 *  Idempotent and cheap on purpose — nine `getItem`s per accessor call — because it
 *  runs on every read rather than once at boot. A once-at-boot migration would miss a
 *  legacy row written by a tab that is still open on the old build, and a preference
 *  saved from that tab would then be lost to this one. */
export declare const CHAT_KEY_PREFIX = "chat:";
/** Build a key under the chat prefix. The suffix is the part that survives the rename. */
export declare function chatKey(suffix: string): string;
/** Carry each key's legacy-prefix row over to its chat (`chat:`) row.
 *
 *  A key that already has a chat row keeps it — a preference set since the rename
 *  outranks one set before it — but the legacy row is removed either way, so the
 *  carry-over happens at most once per key. A key given without the chat prefix is a
 *  programming error and throws rather than silently migrating nothing. */
export declare function migrateLegacyKeys(store: Storage, keys: readonly string[]): void;
//# sourceMappingURL=storageKeys.d.ts.map