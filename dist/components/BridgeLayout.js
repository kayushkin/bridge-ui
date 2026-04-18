import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from 'react-router-dom';
import { useBridgeConfig } from '../context';
export function BridgeLayout({ showConformance = true }) {
    const { routes } = useBridgeConfig();
    const tabs = [
        { to: routes.chat, label: 'Chat', end: true },
        { to: routes.instances, label: 'Instances', end: false },
        { to: routes.sessions, label: 'Sessions', end: false },
        { to: routes.auth, label: 'Auth', end: false },
        { to: routes.usage, label: 'Usage', end: false },
        { to: routes.settings, label: 'Settings', end: false },
        ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
    ];
    return (_jsxs("div", { className: "bridge-layout", children: [_jsx("nav", { className: "bridge-nav", children: tabs.map(t => (_jsx(NavLink, { to: t.to, end: t.end, className: ({ isActive }) => `bridge-tab ${isActive ? 'bridge-tab-active' : ''}`, children: t.label }, t.to))) }), _jsx("div", { className: "bridge-content", children: _jsx(Outlet, {}) })] }));
}
//# sourceMappingURL=BridgeLayout.js.map