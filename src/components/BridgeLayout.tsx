import { NavLink, Outlet } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useMinimalChrome } from './minimal/MinimalChromeContext'

interface BridgeLayoutProps {
  /** If true, include the Conformance tab. Default: true. */
  showConformance?: boolean
  /** If true, include the Service inventory tab. Default: true. */
  showServiceInventory?: boolean
}

export function BridgeLayout({ showConformance = true, showServiceInventory = true }: BridgeLayoutProps) {
  const {
    routes, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, principalStoreBasePath,
    grantStoreBasePath, bundleStoreBasePath, producerBasePath,
  } = useBridgeConfig()
  // Gated on the chrome being DRAWN, not on the viewport being narrow. These tabs
  // are the only navigation on every page here except the host's chat, and the
  // routed child that replaces them exists on that chat alone — so dropping them
  // for a narrow window used to strand the user on Instances, Sessions, Auth,
  // Usage, Settings, Agents, Files, Skills, Tools, Permissions, Kanban,
  // Principals and Conformance, with the host's own header hidden by the same
  // mistaken signal.
  const { minimal, minimalChromeMounted } = useMinimalChrome()
  const chromeTakenOver = minimal && minimalChromeMounted
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
    // Who may use what. Its own tab, because "who holds a grant on this tool"
    // is a question about a resource, not a principal.
    ...(grantStoreBasePath ? [{ to: routes.grants, label: 'Grants', end: false }] : []),
    ...(bundleStoreBasePath ? [{ to: routes.bundles, label: 'Bundles', end: false }] : []),
    // The page exists on every host; the tab is drawn only where the producer is
    // proxied, since without it the page can say nothing but "not configured".
    ...(producerBasePath ? [{ to: routes.orchestrator, label: 'Orchestrator', end: false }] : []),
    ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
    // Reads the bridge server itself (`GET /services` on basePath), so no
    // store base path gates it; a host whose server lacks the route turns it off.
    ...(showServiceInventory ? [{ to: routes.serviceInventory, label: 'Service inventory', end: false }] : []),
  ]

  return (
    <div className={`bridge-layout ${chromeTakenOver ? 'bridge-layout-minimal' : ''}`}>
      {!chromeTakenOver && <nav className="bridge-nav">
        {tabs.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `bridge-tab ${isActive ? 'bridge-tab-active' : ''}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>}
      <div className="bridge-content">
        <Outlet />
      </div>
    </div>
  )
}
