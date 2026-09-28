import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useMinimalChrome } from './MinimalChromeContext'
import { useShellNavigation } from '../shellNavigation'

export function SessionDrawer({ children }: { children: ReactNode }) {
  const { drawerOpen, setDrawerOpen } = useMinimalChrome()
  const navigation = useShellNavigation()

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, setDrawerOpen])

  return (
    <>
      <div
        className={`bc-mc-scrim ${drawerOpen ? 'bc-mc-scrim-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <aside
        className={`bc-mc-drawer ${drawerOpen ? 'bc-mc-drawer-open' : ''}`}
        aria-hidden={!drawerOpen}
        role="dialog"
        aria-label="Sessions"
      >
        <div className="bc-mc-drawer-header">
          <span className="bc-mc-drawer-title">Sessions</span>
          <button
            type="button"
            className="bc-mc-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
          >×</button>
        </div>
        <div className="bc-mc-drawer-body">
          {children}
        </div>
        {/* The minimal chrome hides the shell's two navigation rows, so without this
            the chat was a dead end on a phone: the only way out was "Show full
            layout" in the controls sheet. */}
        {navigation && (
          <details className="bc-mc-drawer-pages">
            <summary className="bc-mc-drawer-pages-summary">Pages</summary>
            <nav className="bc-mc-drawer-pages-body" aria-label="Pages">
              {navigation.groups.map(group => (
                <div key={group.key} className="bc-mc-drawer-pages-group">
                  <span className="bc-mc-drawer-pages-group-label">{group.label}</span>
                  <div className="bc-mc-drawer-pages-links">
                    {navigation.entries.filter(entry => entry.group === group.key).map(entry => (
                      <NavLink
                        key={entry.to}
                        to={entry.to}
                        end={entry.end}
                        draggable={false}
                        onClick={() => setDrawerOpen(false)}
                        className={({ isActive }) => `bc-mc-drawer-page ${isActive ? 'bc-mc-drawer-page-active' : ''}`}
                      >
                        {entry.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </details>
        )}
      </aside>
    </>
  )
}
