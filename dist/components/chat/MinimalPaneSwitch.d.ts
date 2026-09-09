import { type PaneKey } from './panePersistence';
interface MinimalPaneSwitchProps {
    /** The pane on screen. */
    pane: PaneKey;
    /** Show this pane instead. */
    onPick: (pane: PaneKey) => void;
}
/** The mobile pane switch: pick ONE of the thread's panes.
 *
 *  ## Why this is chat's own component and not bridge-ui's
 *
 *  bridge-ui ships a `MinimalPaneSwitch` and it is the one piece of the minimal chrome
 *  that could not be mounted here unmodified — it hardcodes five of its own `PaneKey`s
 *  (`thread`, `git` and `kanban` among them), and this page can draw none of those. Its
 *  three siblings — `MinimalTopBar`, `SessionDrawer`, `ChromeSheet` — take no pane
 *  vocabulary at all and ARE imported from the library rather than copied.
 *
 *  It ships no CSS: `bc-mc-paneswitch` and `bc-mc-paneswitch-btn` are bridge-ui's own
 *  classes, already in the stylesheet dash loads.
 *
 *  ## Why a one-of-N switch, when the desktop header's pane row is not one
 *
 *  The desktop toggles are independent flags — Turns and Timeline can both be up, which
 *  is the whole point of that row. One pane wide, "both" is not an available answer, so
 *  the mobile control asks the question it can actually act on and the two records stay
 *  separate. `panePersistence.ts` records why neither reading is derived from the other.
 *
 *  Raw is deliberately not a button here. It is a MODE of the Turns pane rather than a
 *  pane (see `panePersistence.ts`), so it would not be one of these N; on a narrow
 *  viewport it is reached the same way every other header control is, through the
 *  sheet's "Show full layout". */
export default function MinimalPaneSwitch({ pane, onPick }: MinimalPaneSwitchProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=MinimalPaneSwitch.d.ts.map