import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { PAGE_GROUPS, groupForPath, navEntriesFor, type HostPage, type NavEntry, type PageGroupKey } from '../pages'
import { useMinimalChrome } from './minimal/MinimalChromeContext'

interface BridgeLayoutProps {
  /** If true, include the Conformance page. Default: true. */
  showConformance?: boolean
  /** If true, include the Service inventory page. Default: true. */
  showServiceInventory?: boolean
  /** Pages the host brings into this navigation. */
  hostPages?: readonly HostPage[]
}

/** The shell: two navigation rows and the page. The first row is the groups
 *  (Work, Agents, Access, System, Personal); the second is the pages of the
 *  group the current path belongs to. Both rows come from `navEntriesFor`, so a
 *  host that proxies no store for a page sees no tab for it, exactly as before —
 *  what changed on 2026-09-18 is that twenty-odd tabs became five groups. */
export function BridgeLayout({ showConformance = true, showServiceInventory = true, hostPages = [] }: BridgeLayoutProps) {
  const config = useBridgeConfig()
  const { pathname } = useLocation()
  // Gated on the chrome being DRAWN, not on the viewport being narrow. These rows
  // are the only navigation on every page here except the host's chat, and the
  // routed child that replaces them exists on that chat alone — so dropping them
  // for a narrow window used to strand the user on every other page, with the
  // host's own header hidden by the same mistaken signal.
  const { minimal, minimalChromeMounted } = useMinimalChrome()
  const chromeTakenOver = minimal && minimalChromeMounted

  const entries = navEntriesFor(config, { showConformance, showServiceInventory }, hostPages)
  const groups = PAGE_GROUPS.filter(g => entries.some(e => e.group === g.key))
  const matched = groupForPath(pathname, config.routes, hostPages)
  const activeGroup: PageGroupKey | null = matched && groups.some(g => g.key === matched) ? matched : (groups[0]?.key ?? null)
  const pages: NavEntry[] = entries.filter(e => e.group === activeGroup)

  return (
    <div className={`bridge-layout ${chromeTakenOver ? 'bridge-layout-minimal' : ''}`}>
      {!chromeTakenOver && <>
        <nav className="bridge-nav bridge-nav-groups" aria-label="Sections">
          {groups.map(g => {
            const first = entries.find(e => e.group === g.key)!
            return (
              <Link
                key={g.key}
                to={first.to}
                className={`bridge-tab bridge-group-tab ${g.key === activeGroup ? 'bridge-tab-active' : ''}`}
                aria-current={g.key === activeGroup ? 'true' : undefined}
              >
                {g.label}
              </Link>
            )
          })}
        </nav>
        <nav className="bridge-nav bridge-nav-pages" aria-label={`${groups.find(g => g.key === activeGroup)?.label ?? ''} pages`}>
          {pages.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `bridge-tab ${isActive ? 'bridge-tab-active' : ''}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </>}
      <div className="bridge-content">
        <Outlet />
      </div>
    </div>
  )
}
