import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PaneKey } from '../chat/types'

export type ChromeOverride = 'minimal' | 'full' | null

const STORAGE_KEY = 'bridge-chrome-override'
const PANE_KEY = 'bridge-mobile-pane'
const MOBILE_BREAKPOINT = 640
const VALID_PANES: readonly PaneKey[] = ['turns', 'thread', 'timeline', 'git', 'kanban']

function loadMobilePane(): PaneKey {
  if (typeof window === 'undefined') return 'turns'
  const v = window.localStorage.getItem(PANE_KEY)
  if (v && (VALID_PANES as readonly string[]).includes(v)) return v as PaneKey
  return 'turns'
}

function saveMobilePane(pane: PaneKey) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PANE_KEY, pane)
}

function loadOverride(): ChromeOverride {
  if (typeof window === 'undefined') return null
  const v = window.localStorage.getItem(STORAGE_KEY)
  if (v === 'minimal' || v === 'full') return v
  return null
}

function saveOverride(value: ChromeOverride) {
  if (typeof window === 'undefined') return
  if (value === null) window.localStorage.removeItem(STORAGE_KEY)
  else window.localStorage.setItem(STORAGE_KEY, value)
}

interface MinimalChromeValue {
  minimal: boolean
  override: ChromeOverride
  setOverride: (v: ChromeOverride) => void
  drawerOpen: boolean
  setDrawerOpen: (v: boolean) => void
  sheetOpen: boolean
  setSheetOpen: (v: boolean) => void
  controlsSlot: HTMLElement | null
  registerControlsSlot: (el: HTMLElement | null) => void
  mobilePane: PaneKey
  setMobilePane: (pane: PaneKey) => void
}

const MinimalChromeContext = createContext<MinimalChromeValue | null>(null)

export function useMinimalChrome(): MinimalChromeValue {
  const ctx = useContext(MinimalChromeContext)
  if (!ctx) {
    return {
      minimal: false,
      override: null,
      setOverride: () => {},
      drawerOpen: false,
      setDrawerOpen: () => {},
      sheetOpen: false,
      setSheetOpen: () => {},
      controlsSlot: null,
      registerControlsSlot: () => {},
      mobilePane: 'turns',
      setMobilePane: () => {},
    }
  }
  return ctx
}

export function MinimalChromeProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<ChromeOverride>(() => loadOverride())
  const [vw, setVw] = useState<number>(() => typeof window === 'undefined' ? 1024 : window.innerWidth)
  const [drawerOpen, setDrawerOpenState] = useState(false)
  const [sheetOpen, setSheetOpenState] = useState(false)
  const [controlsSlot, setControlsSlot] = useState<HTMLElement | null>(null)
  const [mobilePane, setMobilePaneState] = useState<PaneKey>(() => loadMobilePane())
  const slotRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const minimal = useMemo(() => {
    if (override === 'minimal') return true
    if (override === 'full') return false
    return vw < MOBILE_BREAKPOINT
  }, [override, vw])

  const setOverride = useCallback((next: ChromeOverride) => {
    setOverrideState(next)
    saveOverride(next)
  }, [])

  useEffect(() => {
    if (!minimal) {
      setDrawerOpenState(false)
      setSheetOpenState(false)
    }
  }, [minimal])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (minimal) document.body.classList.add('bridge-minimal-chrome')
    else document.body.classList.remove('bridge-minimal-chrome')
    return () => { document.body.classList.remove('bridge-minimal-chrome') }
  }, [minimal])

  const registerControlsSlot = useCallback((el: HTMLElement | null) => {
    slotRef.current = el
    setControlsSlot(el)
  }, [])

  const setDrawerOpen = useCallback((v: boolean) => setDrawerOpenState(v), [])
  const setSheetOpen = useCallback((v: boolean) => setSheetOpenState(v), [])
  const setMobilePane = useCallback((pane: PaneKey) => {
    setMobilePaneState(pane)
    saveMobilePane(pane)
  }, [])

  const value = useMemo<MinimalChromeValue>(() => ({
    minimal,
    override,
    setOverride,
    drawerOpen,
    setDrawerOpen,
    sheetOpen,
    setSheetOpen,
    controlsSlot,
    registerControlsSlot,
    mobilePane,
    setMobilePane,
  }), [minimal, override, setOverride, drawerOpen, setDrawerOpen, sheetOpen, setSheetOpen, controlsSlot, registerControlsSlot, mobilePane, setMobilePane])

  return (
    <MinimalChromeContext.Provider value={value}>
      {children}
    </MinimalChromeContext.Provider>
  )
}
