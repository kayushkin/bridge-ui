import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type ChromeOverride = 'minimal' | 'full' | null

const STORAGE_KEY = 'bridge-chrome-override'
const MOBILE_BREAKPOINT = 640

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
  }), [minimal, override, setOverride, drawerOpen, setDrawerOpen, sheetOpen, setSheetOpen, controlsSlot, registerControlsSlot])

  return (
    <MinimalChromeContext.Provider value={value}>
      {children}
    </MinimalChromeContext.Provider>
  )
}
