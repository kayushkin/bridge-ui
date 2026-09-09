import type { NewSessionTarget } from './useNewSessionTarget';
/** Sidebar → SessionList parity: mirrors bridge-ui's SessionList DOM (bc-session-list,
 *  bc-new-session, bc-session-search, bc-inst-filter / bc-class-filter-row chips,
 *  bc-session-item, bc-folder-header) so it inherits the shared stylesheet. A
 *  new-session split control, content search, a collapsible multi-axis chip filter
 *  with live counts, per-row status dot fed effectiveState, inline rename (bridge-ui's
 *  exported EditableName), and folder groups with collapse. Virtualized. All
 *  filtering/sorting/grouping is chat-core's — no transcript re-derivation here.
 *
 *  The loaded set is ONE page deep; older sessions are paged in on scroll-to-end or
 *  from the button at the foot of the list. */
interface SidebarProps {
    /** Where a new chat should be aimed, resolved once by the page (see
     *  `useNewSessionTarget`) and shared with the cold-load bootstrap so the button and
     *  the bootstrap can never target different instances. */
    newTarget: NewSessionTarget;
    /** Fold the sidebar down to the vertical strip. The flag itself lives in `Chat` —
     *  collapsing unmounts this component, so a flag held here would go with it. */
    onToggleCollapse: () => void;
    /** Called after a row has opened a session. The minimal (mobile) chrome renders this
     *  list inside a slide-over drawer, which has to close itself once it has been used —
     *  a drawer left open over the thread the user just asked for is the list refusing to
     *  answer the click.
     *
     *  A callback rather than the drawer watching the active id: the drawer must close
     *  when a ROW is clicked, and the active id also changes for a `?session=` deeplink
     *  and for a reference chip inside a transcript, neither of which the drawer is
     *  involved in. Optional, because the desktop sidebar has nothing to close. */
    onAfterSelect?: () => void;
}
export default function Sidebar({ newTarget, onToggleCollapse, onAfterSelect }: SidebarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Sidebar.d.ts.map