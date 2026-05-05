import { NavLink, Outlet } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useMinimalChrome } from './minimal/MinimalChromeContext'

interface BridgeLayoutProps {
  /** If true, include the Conformance tab. Default: true. */
  showConformance?: boolean
}

export function BridgeLayout({ showConformance = true }: BridgeLayoutProps) {
  const { routes, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath } = useBridgeConfig()
  const { minimal } = useMinimalChrome()
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
    ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
  ]

  return (
    <div className={`bridge-layout ${minimal ? 'bridge-layout-minimal' : ''}`}>
      {!minimal && <nav className="bridge-nav">
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
