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
                    const lines = [
                        inst.name,
                        `${info?.label || inst.harness_type} · ${inst.host}`,
                        inst.working_dir ? `cwd: ${inst.working_dir}` : null,
                        `${count} session${count === 1 ? '' : 's'}`,
                        `click to ${active ? 'hide' : 'show'}`,
                    ].filter(Boolean).join('\n');
                    return (_jsx("button", { type: "button", className: `bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggle(inst.id), title: lines, children: info?.image
                            ? _jsx("img", { className: "bc-inst-chip-img", src: `${basePath}${info.image}`, alt: "" })
                            : _jsx("span", { className: "bc-inst-chip-emoji", children: info?.emoji || HARNESS_EMOJI[inst.harness_type] || '·' }) }, inst.id));
                }) }), anyExcluded && (_jsx("button", { type: "button", className: "bc-inst-filter-clear", onClick: onClear, title: "Show sessions from all instances", children: "show all" }))] }));
}
//# sourceMappingURL=InstanceFilterBar.js.map