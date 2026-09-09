import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useMinimalChrome } from './minimal/MinimalChromeContext';
export function BridgeLayout({ showConformance = true }) {
    const { routes, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, principalStoreBasePath, producerBasePath, } = useBridgeConfig();
    // Gated on the chrome being DRAWN, not on the viewport being narrow. These tabs
    // are the only navigation on every page here except the host's chat, and the
    // routed child that replaces them exists on that chat alone — so dropping them
    // for a narrow window used to strand the user on Instances, Sessions, Auth,
    // Usage, Settings, Agents, Files, Skills, Tools, Permissions, Kanban,
    // Principals and Conformance, with the host's own header hidden by the same
    // mistaken signal.
    const { minimal, minimalChromeMounted } = useMinimalChrome();
    const chromeTakenOver = minimal && minimalChromeMounted;
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
        // The directory the Kanban assignees resolve against. Same gate as the
        // assignee UI itself: a host that proxies no principal-store gets no tab.
        ...(principalStoreBasePath ? [{ to: routes.principals, label: 'Principals', end: false }] : []),
        // The page exists on every host; the tab is drawn only where the producer is
        // proxied, since without it the page can say nothing but "not configured".
        ...(producerBasePath ? [{ to: routes.orchestrator, label: 'Orchestrator', end: false }] : []),
        ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
    ];
    return (_jsxs("div", { className: `bridge-layout ${chromeTakenOver ? 'bridge-layout-minimal' : ''}`, children: [!chromeTakenOver && _jsx("nav", { className: "bridge-nav", children: tabs.map(t => (_jsx(NavLink, { to: t.to, end: t.end, className: ({ isActive }) => `bridge-tab ${isActive ? 'bridge-tab-active' : ''}`, children: t.label }, t.to))) }), _jsx("div", { className: "bridge-content", children: _jsx(Outlet, {}) })] }));
}
//# sourceMappingURL=BridgeLayout.js.map