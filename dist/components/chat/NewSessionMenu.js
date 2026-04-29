import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SplitButtons } from './SplitButtons';
const SPLIT_MODE_LABEL = {
    'replace': 'Replace current',
    'split-auto': 'Split (auto)',
    'split-left': 'Split left',
    'split-right': 'Split right',
    'split-up': 'Split above',
    'split-down': 'Split below',
};
export function NewSessionMenu({ instances, harnesses, defaultInstanceId, basePath, instancesPath, onPick, onClose }) {
    const [mode, setMode] = useState('replace');
    const menuRef = useRef(null);
    useEffect(() => {
        const onDoc = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target))
                onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        window.addEventListener('mousedown', onDoc);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDoc);
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);
    const harnessMap = useMemo(() => {
        const m = new Map();
        for (const h of harnesses)
            m.set(h.name, h);
        return m;
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
    return (_jsxs("div", { ref: menuRef, className: "bc-new-session-menu", role: "menu", children: [_jsxs("div", { className: "bc-new-session-mode", role: "radiogroup", "aria-label": "Open in", children: [_jsx("button", { type: "button", role: "radio", "aria-checked": mode === 'replace', className: `bc-new-session-mode-btn ${mode === 'replace' ? 'bc-new-session-mode-btn-active' : ''}`, title: "Replace the focused workspace", onClick: () => setMode('replace'), children: "Replace current" }), _jsxs("span", { className: "bc-new-session-mode-split", children: [_jsx("span", { className: "bc-new-session-mode-label", title: SPLIT_MODE_LABEL[mode], children: mode === 'replace' ? 'Split…' : SPLIT_MODE_LABEL[mode] }), _jsx(SplitButtons, { onSplit: setMode, active: mode === 'replace' ? null : mode, size: "sm", autoTitle: "Open in a new split (auto direction)", chooseTitle: "Choose split direction" })] })] }), groups.length === 0 ? (_jsxs("div", { className: "bc-new-session-empty", children: ["No instances configured. ", _jsx(Link, { to: instancesPath, children: "Add an instance" }), "."] })) : groups.map(([harnessType, group]) => {
                const info = harnessMap.get(harnessType);
                const available = info?.available ?? false;
                return (_jsxs("div", { className: "bc-new-session-group", children: [_jsxs("div", { className: "bc-new-session-group-label", children: [info?.image
                                    ? _jsx("img", { className: "bc-new-session-group-img", src: `${basePath}${info.image}`, alt: "" })
                                    : _jsx("span", { children: info?.emoji || '' }), _jsx("span", { children: info?.label || harnessType })] }), group.map(inst => (_jsxs("button", { type: "button", className: `bc-new-session-item ${inst.id === defaultInstanceId ? 'bc-new-session-item-default' : ''}`, onClick: () => available && onPick(inst.id, mode), disabled: !available, title: available ? `Create new session in ${inst.name}` : `${harnessType} harness unavailable`, children: [_jsx("span", { className: `bc-new-session-avail ${available ? 'bc-new-session-avail-on' : 'bc-new-session-avail-off'}` }), _jsx("span", { className: "bc-new-session-item-name", children: inst.name }), _jsx("span", { className: "bc-new-session-item-meta", children: inst.machine?.name ?? '—' })] }, inst.id)))] }, harnessType));
            }), _jsx(Link, { to: instancesPath, className: "bc-new-session-manage", onClick: onClose, children: "Manage instances\u2026" })] }));
}
//# sourceMappingURL=NewSessionMenu.js.map