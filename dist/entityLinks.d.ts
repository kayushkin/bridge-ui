/**
 * Turning an entity ref into something you can click.
 *
 * kanban-store deliberately does not resolve refs — it publishes an entity-type
 * registry and leaves resolution to the client, so that adding a type does not
 * mean teaching the store about another service. That leaves this: the one place
 * that knows a `pull_request` ref is a GitHub pull request and what its URL is.
 *
 * Every function here refuses to guess. A ref that does not match the shape its
 * type promises returns null and renders as plain text, because a link that
 * 404s is worse than a string you can copy: it looks like the record is wrong
 * when it is the URL that is.
 */
/** Where a ref points, and what to call it on screen. */
export interface EntityTarget {
    href: string;
    /** Short human label — the part worth reading, not the whole ref. */
    label: string;
    /** Whether this leaves the app. Used to set rel/target. */
    external: boolean;
}
export declare function entityTarget(entityType: string, entityRef: string): EntityTarget | null;
/**
 * A ref that is a path on this machine rather than something to open.
 *
 * `repo` is registered as a local filesystem path and has no upstream to
 * resolve against, so it is shown as one — monospaced, not underlined, not
 * pretending to be a link.
 */
export declare function isLocalPathRef(entityType: string): boolean;
//# sourceMappingURL=entityLinks.d.ts.map