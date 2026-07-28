import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useMinimalChrome } from './minimal/MinimalChromeContext';
export function BridgeLayout({ showConformance = true }) {
    const { routes, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, eventsStoreBasePath } = useBridgeConfig();
    const { minimal } = useMinimalChrome();
    const tabs = [
        { to: routes.chat, label: 'Chat', end: true },
        { to: routes.instances, label: 'Instances', end: false },
        { to: routes.sessions, label: 'Sessions', end: false },
        { to: routes.auth, label: 'Auth', end: false },
        { to: routes.usage, label: 'Usage', end: false },
        { to: routes.settings, label: 'Settings', end: false },
        { to: routes.agents, label: 'Agents', end: false },
        { to: routes.files, label: 'Files', end: false },
        ...(skillStoreBasePath ? [{ to: routes.skills, label: 'Skills', end: false }] : []),
        ...(toolStoreBasePath ? [{ to: routes.tools, label: 'Tools', end: false }] : []),
        ...(permissionStoreBasePath ? [{ to: routes.permissions, label: 'Permissions', end: false }] : []),
        ...(kanbanStoreBasePath ? [{ to: routes.kanban, label: 'Kanban', end: false }] : []),
        ...(eventsStoreBasePath ? [{ to: routes.potentialEvents, label: 'Potential Events', end: false }] : []),
        ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
    ];
    return (_jsxs("div", { className: `bridge-layout ${minimal ? 'bridge-layout-minimal' : ''}`, children: [!minimal && _jsx("nav", { className: "bridge-nav", children: tabs.map(t => (_jsx(NavLink, { to: t.to, end: t.end, className: ({ isActive }) => `bridge-tab ${isActive ? 'bridge-tab-active' : ''}`, children: t.label }, t.to))) }), _jsx("div", { className: "bridge-content", children: _jsx(Outlet, {}) })] }));
}
//# sourceMappingURL=BridgeLayout.js.map