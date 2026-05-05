import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useMinimalChrome } from './MinimalChromeContext'

export function SessionDrawer({ children }: { children: ReactNode }) {
  const { drawerOpen, setDrawerOpen } = useMinimalChrome()

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
      </aside>
    </>
  )
}
