import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
export function HarnessFilterBar({ machines, harnesses, sessions, instanceMachineByID, excludedHarnesses, excludedMachines, onToggleHarness, onToggleMachine, onClear, basePath, }) {
    const harnessMap = useMemo(() => {
        const m = new Map();
        for (const h of harnesses)
            m.set(h.name, h);
        return m;
    }, [harnesses]);
    const { harnessCounts, machineCounts, visibleHarnessNames } = useMemo(() => {
        const hCounts = new Map();
        const mCounts = new Map();
        const visible = new Set();
        for (const s of sessions) {
            const machineID = s.instance_id ? instanceMachineByID.get(s.instance_id) : undefined;
            if (machineID)
                mCounts.set(machineID, (mCounts.get(machineID) ?? 0) + 1);
            if (machineID && excludedMachines.has(machineID))
                continue;
            hCounts.set(s.harness, (hCounts.get(s.harness) ?? 0) + 1);
            visible.add(s.harness);
        }
        return { harnessCounts: hCounts, machineCounts: mCounts, visibleHarnessNames: visible };
    }, [sessions, instanceMachineByID, excludedMachines]);
    const visibleHarnesses = useMemo(() => {
        const names = [...visibleHarnessNames];
        names.sort((a, b) => {
            const la = harnessMap.get(a)?.label ?? a;
            const lb = harnessMap.get(b)?.label ?? b;
            return la.localeCompare(lb);
        });
        return names;
    }, [visibleHarnessNames, harnessMap]);
    if (visibleHarnesses.length <= 1 && machines.length <= 1)
        return null;
    const anyExcluded = visibleHarnesses.some(h => excludedHarnesses.has(h))
        || machines.some(m => excludedMachines.has(m.id));
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
                }) })), visibleHarnesses.length > 1 && (_jsx("div", { className: "bc-inst-filter-chips", children: visibleHarnesses.map(h => {
                    const info = harnessMap.get(h);
                    const active = !excludedHarnesses.has(h);
                    const count = harnessCounts.get(h) ?? 0;
                    const lines = [
                        info?.label || h,
                        `${count} session${count === 1 ? '' : 's'}`,
                        `click to ${active ? 'hide' : 'show'}`,
                    ].filter(Boolean).join('\n');
                    return (_jsx("button", { type: "button", className: `bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggleHarness(h), title: lines, children: info?.image
                            ? _jsx("img", { className: "bc-inst-chip-img", src: `${basePath}${info.image}`, alt: "" })
                            : _jsx("span", { className: "bc-inst-chip-emoji", children: info?.emoji || '·' }) }, h));
                }) })), anyExcluded && (_jsx("button", { type: "button", className: "bc-inst-filter-clear", onClick: onClear, title: "Show sessions from all machines and harnesses", children: "show all" }))] }));
}
//# sourceMappingURL=HarnessFilterBar.js.map