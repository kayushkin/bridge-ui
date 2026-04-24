import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HARNESS_EMOJI, TRANSPORT_LABEL } from '../../constants';
export function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath, onToggleCollapse }) {
    const harnessMap = useMemo(() => {
        const map = new Map();
        for (const h of harnesses)
            map.set(h.name, h);
        return map;
    }, [harnesses]);
    const groups = useMemo(() => {
        const groupMap = new Map();
        for (const inst of instances) {
            if (!inst.enabled)
                continue;
            const list = groupMap.get(inst.harness_type) || [];
            list.push(inst);
            groupMap.set(inst.harness_type, list);
        }
        const order = harnesses.map(h => h.name);
        return Array.from(groupMap.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    }, [instances, harnesses]);
    const instanceMeta = useMemo(() => {
        const meta = new Map();
        for (const inst of instances) {
            const s = sessions.filter(s => s.instance_id === inst.id);
            meta.set(inst.id, { running: s.filter(s => s.state === 'running').length, total: s.length });
        }
        return meta;
    }, [instances, sessions]);
    if (groups.length === 0) {
        return (_jsxs("div", { className: "htb-wrapper", children: [_jsx("button", { className: "htb-collapse-btn", onClick: onToggleCollapse, title: "Collapse harness bar", "aria-label": "Collapse harness bar", children: "\u25B4" }), _jsxs("div", { className: "htb-empty", children: ["No harness instances configured. ", _jsx(Link, { to: instancesPath, children: "Add an instance" }), " to get started."] }), _jsx("button", { className: "htb-new-instance", onClick: onNewInstance, title: "Add new instance", children: "+" })] }));
    }
    return (_jsxs("div", { className: "htb-wrapper", children: [_jsx("button", { className: "htb-collapse-btn", onClick: onToggleCollapse, title: "Collapse harness bar", "aria-label": "Collapse harness bar", children: "\u25B4" }), _jsxs("div", { className: "htb-tabs", children: [groups.map(([harnessType, groupInstances], gi) => {
                        const info = harnessMap.get(harnessType);
                        return (_jsxs("div", { className: "htb-group", children: [gi > 0 && _jsx("div", { className: "htb-sep" }), groups.length > 1 && (_jsx("div", { className: "htb-group-label", children: info?.image
                                        ? _jsx("img", { className: "htb-group-img", src: `${basePath}${info.image}`, alt: info?.label || harnessType })
                                        : _jsx("span", { children: info?.emoji || HARNESS_EMOJI[harnessType] || '' }) })), groupInstances.map(inst => {
                                    const m = instanceMeta.get(inst.id);
                                    const isActive = selectedInstance === inst.id;
                                    const available = info?.available ?? false;
                                    return (_jsxs("button", { className: `htb-tab ${isActive ? 'htb-tab-active' : ''} ${!available ? 'htb-tab-disabled' : ''}`, onClick: () => available && onSelect(inst.id), disabled: !available, title: `${inst.name} (${TRANSPORT_LABEL[inst.transport] || inst.transport} - ${inst.host})`, children: [_jsxs("div", { className: "htb-tab-line1", children: [_jsx("span", { className: `htb-avail ${available ? 'htb-avail-on' : 'htb-avail-off'}` }), groups.length <= 1 && (info?.image
                                                        ? _jsx("img", { className: "htb-tab-img", src: `${basePath}${info.image}`, alt: "" })
                                                        : _jsx("span", { className: "htb-tab-emoji", children: info?.emoji || HARNESS_EMOJI[harnessType] || '' })), _jsx("span", { className: "htb-tab-name", children: inst.name }), _jsx("span", { className: "htb-transport", children: TRANSPORT_LABEL[inst.transport] || inst.transport })] }), m && (_jsx("div", { className: "htb-tab-line2", children: m.running > 0 ? `${m.running} running` : m.total > 0 ? `${m.total} sess` : 'no sessions' }))] }, inst.id));
                                })] }, harnessType));
                    }), _jsx("button", { className: "htb-new-instance", onClick: onNewInstance, title: "Add new instance", children: "+" })] })] }));
}
//# sourceMappingURL=HarnessTabBar.js.map