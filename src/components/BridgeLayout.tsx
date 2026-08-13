import { NavLink, Outlet } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useMinimalChrome } from './minimal/MinimalChromeContext'

interface BridgeLayoutProps {
  /** If true, include the Conformance tab. Default: true. */
  showConformance?: boolean
}

export function BridgeLayout({ showConformance = true }: BridgeLayoutProps) {
  const { routes, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath } = useBridgeConfig()
  // Gated on the chrome being DRAWN, not on the viewport being narrow. These tabs
  // are the only navigation on every page here except the chat, and the routed
  // child that replaces them exists on the chat alone — so dropping them for a
  // narrow window used to strand the user on Instances, Sessions, Auth, Usage,
  // Settings, Agents, Files, Skills, Tools, Permissions, Kanban and Conformance,
  // with the host's own header hidden by the same mistaken signal.
  const { minimal, minimalChromeMounted } = useMinimalChrome()
  const chromeTakenOver = minimal && minimalChromeMounted
  const tabs = [
    { to: routes.chat, label: 'Chat', end: true },
    // Beside Chat and nowhere else: while one chat surface is replacing the
    // other, the only comparison anyone wants is the two of them side by side.
    // Gated on the route being named, which is how every optional tab here is
    // gated — llmux mounts no second chat and gets no tab.
    ...(routes.chatV2 ? [{ to: routes.chatV2, label: 'Chat v2', end: true }] : []),
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
    ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
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
