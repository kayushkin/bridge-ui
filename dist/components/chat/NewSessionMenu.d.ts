interface NewSessionMenuProps {
    /** Called with the picked instance + its harness → useSessionActions().newSession. */
    onPick: (opts: {
        instanceId: string;
        harness: string;
    }) => void;
    onClose: () => void;
}
/** Harness/instance picker grouped by harness, mirroring bridge-ui's NewSessionMenu
 *  DOM (bc-new-session-menu / bc-new-session-group / bc-new-session-item /
 *  bc-new-session-avail / …) so it inherits the shared stylesheet. Instance + machine
 *  metadata come from bridge-ui's config hooks (which read the BridgeProvider context
 *  the page mounts). Disabled instances are hidden; each row shows an availability
 *  dot, the instance name, and its machine. chat has no workspace splits, so the
 *  split-mode radiogroup is intentionally omitted.
 *
 *  Availability is per harness, not per instance: the server reports it on
 *  `HarnessInfo.available` and every instance of a harness whose process is gone is
 *  equally unreachable. It gates four things together — the dot's colour, the
 *  button's `disabled`, the title, and the click itself — because any one of them
 *  alone still leaves a row that lies. The click guard is not redundant with
 *  `disabled`: `disabled` is a property of the rendered button and says nothing
 *  about what the handler does when it is reached another way. */
export default function NewSessionMenu({ onPick, onClose }: NewSessionMenuProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=NewSessionMenu.d.ts.map