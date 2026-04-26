import { NavLink, Outlet } from 'react-router-dom'
import { useBridgeConfig } from '../context'

interface BridgeLayoutProps {
  /** If true, include the Conformance tab. Default: true. */
  showConformance?: boolean
}

export function BridgeLayout({ showConformance = true }: BridgeLayoutProps) {
  const { routes, skillStoreBasePath } = useBridgeConfig()
  const tabs = [
    { to: routes.chat, label: 'Chat', end: true },
    ...(routes.chat2 ? [{ to: routes.chat2, label: 'Chat2', end: false }] : []),
    ...(routes.chat3 ? [{ to: routes.chat3, label: 'Chat3', end: false }] : []),
    ...(routes.chat4 ? [{ to: routes.chat4, label: 'Chat4', end: false }] : []),
    { to: routes.instances, label: 'Instances', end: false },
    { to: routes.sessions, label: 'Sessions', end: false },
    { to: routes.auth, label: 'Auth', end: false },
    { to: routes.usage, label: 'Usage', end: false },
    { to: routes.settings, label: 'Settings', end: false },
    ...(skillStoreBasePath ? [{ to: routes.skills, label: 'Skills', end: false }] : []),
    ...(showConformance ? [{ to: routes.conformance, label: 'Conformance', end: false }] : []),
  ]

  return (
    <div className="bridge-layout">
      <nav className="bridge-nav">
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
      </nav>
      <div className="bridge-content">
        <Outlet />
      </div>
    </div>
  )
}
