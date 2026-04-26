import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
export function InstanceFilterBar({ instances, machines, harnesses, sessions, excluded, excludedMachines, onToggle, onToggleMachine, onClear, basePath, }) {
    const harnessMap = useMemo(() => {
        const m = new Map();
        for (const h of harnesses)
            m.set(h.name, h);
        return m;
    }, [harnesses]);
    const machineMap = useMemo(() => {
        const m = new Map();
        for (const x of machines)
            m.set(x.id, x);
        return m;
    }, [machines]);
    const counts = useMemo(() => {
        const m = new Map();
        for (const s of sessions) {
            if (!s.instance_id)
                continue;
            m.set(s.instance_id, (m.get(s.instance_id) ?? 0) + 1);
        }
        return m;
    }, [sessions]);
    const machineCounts = useMemo(() => {
        const m = new Map();
        for (const inst of instances) {
            const c = counts.get(inst.id) ?? 0;
            m.set(inst.machine_id, (m.get(inst.machine_id) ?? 0) + c);
        }
        return m;
    }, [instances, counts]);
    const enabled = useMemo(() => instances.filter(i => i.enabled), [instances]);
    const visibleInstances = useMemo(() => enabled.filter(i => !excludedMachines.has(i.machine_id)), [enabled, excludedMachines]);
    // Hide the bar entirely when there's nothing meaningful to filter on —
    // single instance + single machine = no choice to make.
    if (enabled.length <= 1 && machines.length <= 1)
        return null;
    const anyExcluded = enabled.some(i => excluded.has(i.id)) || machines.some(m => excludedMachines.has(m.id));
    return (_jsxs("div", { className: "bc-inst-filter", children: [machines.length > 1 && (_jsx("div", { className: "bc-inst-filter-chips bc-inst-filter-machines", children: machines.map(m => {
                    const active = !excludedMachines.has(m.id);
                    const count = machineCounts.get(m.id) ?? 0;
                    const tooltip = [
                        m.name,
                        m.hostname || `transport: ${m.transport}`,
                        `${count} session${count === 1 ? '' : 's'}`,
                        `click to ${active ? 'hide' : 'show'}`,
                    ].filter(Boolean).join('\n');
                    return (_jsxs("button", { type: "button", className: `bc-inst-chip bc-machine-chip ${active ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggleMachine(m.id), title: tooltip, children: [m.emoji
                                ? _jsx("span", { className: "bc-inst-chip-emoji", children: m.emoji })
                                : _jsx("span", { className: "bc-inst-chip-emoji", "aria-hidden": true, children: "\uD83D\uDDA5" }), _jsx("span", { className: "bc-machine-chip-name", children: m.name })] }, m.id));
                }) })), visibleInstances.length > 1 && (_jsx("div", { className: "bc-inst-filter-chips", children: visibleInstances.map(inst => {
                    const info = harnessMap.get(inst.harness_type);
                    const machine = machineMap.get(inst.machine_id);
                    const active = !excluded.has(inst.id);
                    const count = counts.get(inst.id) ?? 0;
                    const lines = [
                        inst.name,
                        `${info?.label || inst.harness_type} · ${machine?.name ?? '?'}`,
                        inst.working_dir ? `cwd: ${inst.working_dir}` : null,
                        `${count} session${count === 1 ? '' : 's'}`,
                        `click to ${active ? 'hide' : 'show'}`,
                    ].filter(Boolean).join('\n');
                    return (_jsx("button", { type: "button", className: `bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggle(inst.id), title: lines, children: info?.image
                            ? _jsx("img", { className: "bc-inst-chip-img", src: `${basePath}${info.image}`, alt: "" })
                            : _jsx("span", { className: "bc-inst-chip-emoji", children: info?.emoji || '·' }) }, inst.id));
                }) })), anyExcluded && (_jsx("button", { type: "button", className: "bc-inst-filter-clear", onClick: onClear, title: "Show sessions from all machines and instances", children: "show all" }))] }));
}
//# sourceMappingURL=InstanceFilterBar.js.map