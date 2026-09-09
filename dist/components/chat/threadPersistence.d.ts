/** Whether assistant prose renders as markdown. Defaults to ON, which is what chat
 *  has always done and what bridge-ui does.
 *
 *  Only the literal `'off'` turns it off. Absent means "never chosen" and anything else
 *  means a value this code did not write — both render markdown, so a corrupted or
 *  half-written record degrades to the default rather than to plain text. Plain text is
 *  the state a user has to ask for; it should never be the state they arrive in. */
export declare function loadMarkdownPref(): boolean;
export declare function saveMarkdownPref(markdown: boolean): void;
//# sourceMappingURL=threadPersistence.d.ts.map