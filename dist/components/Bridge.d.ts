import { type JSX } from 'react';
import { type BridgeProviderProps } from '../provider';
export interface BridgeProps extends Omit<BridgeProviderProps, 'children' | 'routes'> {
    /** The host's notes page, for `[todo:<id>]` references. Empty means the host has
     *  none and those references render as plain text. */
    notesPath?: string;
    /** Draw the Conformance tab. Default true. */
    showConformance?: boolean;
}
/** The bridge, whole: every page this library ships, its tab row, and the two
 *  providers they read — mounted by a host as ONE thing at the root of a router.
 *
 *  dash mounts it under a splat route and puts its own pages beside it; the
 *  standalone launcher mounts nothing else. Either way this component owns its
 *  host's root: the routes in `DEFAULT_BRIDGE_ROUTES` are what it renders, so a
 *  `?session=` deeplink, a card link or a reference chip built from them lands on
 *  a page this component serves. A host that instead composes pages by hand
 *  under a prefix passes `BridgeProvider` its own `routes` and does not use this.
 *
 *  `ChatProvider` sits above the router on purpose. It is chat-core's session
 *  store and sync engine, and holding it here rather than inside the chat page
 *  means the store survives a switch to Instances or Kanban and back — and that
 *  every page can render a reference chip, which throws without it. */
export declare function Bridge({ notesPath, showConformance, ...provider }: BridgeProps): JSX.Element;
//# sourceMappingURL=Bridge.d.ts.map