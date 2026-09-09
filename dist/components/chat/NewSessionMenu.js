import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from 'react';
import { useBridgeHarnesses } from '../../useBridgeHarnesses';
import { useBridgeInstances } from '../../useBridgeInstances';
import { useBridgeMachines } from '../../useBridgeMachines';
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
export default function NewSessionMenu({ onPick, onClose }) {
    const { instances } = useBridgeInstances();
    const { machineMap } = useBridgeMachines();
    const { harnessMap } = useBridgeHarnesses();
    const menuRef = useRef(null);
    useEffect(() => {
        const onDown = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target))
                onClose();
        };
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);
    // Bucket enabled instances by harness_type; groups ordered by harness name.
    const groups = useMemo(() => {
        const byHarness = new Map();
        for (const inst of instances) {
            if (!inst.enabled)
                continue;
            const list = byHarness.get(inst.harness_type) ?? [];
            list.push(inst);
            byHarness.set(inst.harness_type, list);
        }
        return [...byHarness.entries()]
            .map(([harness, list]) => ({ harness, instances: list }))
            .sort((a, b) => a.harness.localeCompare(b.harness));
    }, [instances]);
    return (_jsx("div", { className: "bc-new-session-menu", role: "menu", ref: menuRef, children: groups.length === 0 ? (_jsx("div", { className: "bc-new-session-empty", children: "No instances configured." })) : (groups.map((g) => {
            // A harness the server has not registered has no entry, and the honest
            // reading of "the registry does not list it" is that it cannot be reached.
            // Defaulting the other way is what painted every row green.
            const available = harnessMap.get(g.harness)?.available ?? false;
            return (_jsxs("div", { className: "bc-new-session-group", children: [_jsx("div", { className: "bc-new-session-group-label", children: _jsx("span", { children: g.harness }) }), g.instances.map((inst) => {
                        const machine = inst.machine ?? machineMap.get(inst.machine_id);
                        return (_jsxs("button", { type: "button", className: "bc-new-session-item", role: "menuitem", disabled: !available, title: available
                                ? `Create new session in ${inst.name}`
                                : `${g.harness} harness unavailable`, onClick: () => {
                                if (!available)
                                    return;
                                onPick({ instanceId: inst.id, harness: inst.harness_type });
                                onClose();
                            }, children: [_jsx("span", { className: `bc-new-session-avail ${available ? 'bc-new-session-avail-on' : 'bc-new-session-avail-off'}` }), _jsx("span", { className: "bc-new-session-item-name", children: inst.name }), _jsxs("span", { className: "bc-new-session-item-meta", children: [machine?.emoji ? `${machine.emoji} ` : '', machine?.name || '—'] })] }, inst.id));
                    })] }, g.harness));
        })) }));
}
//# sourceMappingURL=NewSessionMenu.js.map