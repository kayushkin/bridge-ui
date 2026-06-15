import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
// Two coordinated multi-select rows in the session sidebar:
//
//   Machines row:    one chip per machine. Hidden machines drop every
//                    session bound to them out of both this filter and
//                    the session list.
//   Harnesses row:   one chip per harness present among sessions on
//                    visible machines. Hidden harnesses drop their
//                    sessions only.
//
// A session passes iff its harness is not excluded AND its instance's
// machine_id is not excluded.
// Sessions also carry three orthogonal classification fields — type
// (interactive | autonomous | system), purpose (chat, autoworker, …) and
// mode (events | pty). Each gets its own labelled chip row below the
// machine/harness rows. A session passes iff none of its classification
// values are excluded. Empty mode is normalised to "events" (legacy default);
// empty type/purpose carry no chip and are never excluded.
export const MODE_DEFAULT = 'events';
export function sessionMode(s) {
    return s.mode || MODE_DEFAULT;
}
// One labelled row of text chips for a classification dimension. Values are
// derived from all sessions (so an excluded value keeps its chip and can be
// toggled back on); counts are over all sessions for predictability.
function ClassFilterRow({ label, values, counts, excluded, onToggle }) {
    if (values.length <= 1)
        return null;
    return (_jsxs("div", { className: "bc-inst-filter-chips bc-class-filter-row", children: [_jsx("span", { className: "bc-class-filter-label", children: label }), values.map(v => {
                const active = !excluded.has(v);
                const count = counts.get(v) ?? 0;
                const tooltip = [
                    v,
                    `${count} session${count === 1 ? '' : 's'}`,
                    `click to ${active ? 'hide' : 'show'}`,
                ].join('\n');
                return (_jsx("button", { type: "button", className: `bc-inst-chip bc-class-chip ${active ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggle(v), title: tooltip, children: _jsx("span", { className: "bc-class-chip-name", children: v }) }, v));
            })] }));
}
export function HarnessFilterBar({ machines, harnesses, sessions, instanceMachineByID, excludedHarnesses, excludedMachines, excludedTypes, excludedPurposes, excludedModes, onToggleHarness, onToggleMachine, onToggleClass, onClear, basePath, collapsed, onToggleCollapsed, }) {
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
    // Distinct values + counts per classification dimension, over all sessions.
    const classDims = useMemo(() => {
        const tally = (pick) => {
            const counts = new Map();
            for (const s of sessions) {
                const v = pick(s);
                if (!v)
                    continue;
                counts.set(v, (counts.get(v) ?? 0) + 1);
            }
            const values = [...counts.keys()].sort((a, b) => a.localeCompare(b));
            return { values, counts };
        };
        return {
            type: tally(s => s.type),
            purpose: tally(s => s.purpose),
            mode: tally(s => sessionMode(s)),
        };
    }, [sessions]);
    const hasClassRows = classDims.type.values.length > 1 ||
        classDims.purpose.values.length > 1 ||
        classDims.mode.values.length > 1;
    if (visibleHarnesses.length <= 1 && machines.length <= 1 && !hasClassRows)
        return null;
    const activeCount = visibleHarnesses.filter(h => excludedHarnesses.has(h)).length
        + machines.filter(m => excludedMachines.has(m.id)).length
        + excludedTypes.size + excludedPurposes.size + excludedModes.size;
    const anyExcluded = activeCount > 0;
    return (_jsxs("div", { className: "bc-inst-filter", children: [_jsxs("button", { type: "button", className: `bc-filter-toggle ${anyExcluded ? 'bc-filter-toggle-active' : ''}`, onClick: onToggleCollapsed, "aria-expanded": !collapsed, title: collapsed ? 'Show session filters' : 'Hide session filters', children: [_jsx("span", { className: "bc-filter-chevron", children: collapsed ? '▸' : '▾' }), _jsx("span", { className: "bc-filter-label", children: "Filters" }), anyExcluded && _jsx("span", { className: "bc-filter-badge", children: activeCount })] }), !collapsed && (_jsxs("div", { className: "bc-inst-filter-body", children: [machines.length > 1 && (_jsx("div", { className: "bc-inst-filter-chips bc-inst-filter-machines", children: machines.map(m => {
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
                        }) })), _jsx(ClassFilterRow, { label: "Type", values: classDims.type.values, counts: classDims.type.counts, excluded: excludedTypes, onToggle: v => onToggleClass('type', v) }), _jsx(ClassFilterRow, { label: "Purpose", values: classDims.purpose.values, counts: classDims.purpose.counts, excluded: excludedPurposes, onToggle: v => onToggleClass('purpose', v) }), _jsx(ClassFilterRow, { label: "Mode", values: classDims.mode.values, counts: classDims.mode.counts, excluded: excludedModes, onToggle: v => onToggleClass('mode', v) }), anyExcluded && (_jsx("button", { type: "button", className: "bc-inst-filter-clear", onClick: onClear, title: "Show all sessions \u2014 clear every machine, harness, type, purpose and mode filter", children: "show all" }))] }))] }));
}
//# sourceMappingURL=HarnessFilterBar.js.map