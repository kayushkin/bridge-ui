import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { HARNESS_EMOJI } from '../../constants';
export function InstanceFilterBar({ instances, harnesses, sessions, excluded, onToggle, onClear, basePath }) {
    const harnessMap = useMemo(() => {
        const m = new Map();
        for (const h of harnesses)
            m.set(h.name, h);
        return m;
    }, [harnesses]);
    const counts = useMemo(() => {
        const m = new Map();
        for (const s of sessions) {
            if (!s.instance_id)
                continue;
            m.set(s.instance_id, (m.get(s.instance_id) ?? 0) + 1);
        }
        return m;
    }, [sessions]);
    const enabled = useMemo(() => instances.filter(i => i.enabled), [instances]);
    if (enabled.length <= 1)
        return null;
    const anyExcluded = enabled.some(i => excluded.has(i.id));
    return (_jsxs("div", { className: "bc-inst-filter", children: [_jsx("div", { className: "bc-inst-filter-chips", children: enabled.map(inst => {
                    const info = harnessMap.get(inst.harness_type);
                    const active = !excluded.has(inst.id);
                    const count = counts.get(inst.id) ?? 0;
                    return (_jsxs("button", { type: "button", className: `bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggle(inst.id), title: `${inst.name} — click to ${active ? 'hide' : 'show'} sessions`, children: [info?.image
                                ? _jsx("img", { className: "bc-inst-chip-img", src: `${basePath}${info.image}`, alt: "" })
                                : _jsx("span", { className: "bc-inst-chip-emoji", children: info?.emoji || HARNESS_EMOJI[inst.harness_type] || '·' }), _jsx("span", { className: "bc-inst-chip-name", children: inst.name }), count > 0 && _jsx("span", { className: "bc-inst-chip-count", children: count })] }, inst.id));
                }) }), anyExcluded && (_jsx("button", { type: "button", className: "bc-inst-filter-clear", onClick: onClear, title: "Show sessions from all instances", children: "show all" }))] }));
}
//# sourceMappingURL=InstanceFilterBar.js.map