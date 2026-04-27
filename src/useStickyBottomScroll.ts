import { useCallback, useEffect, useRef, useState } from 'react'

export interface StickyBottomScroll<T extends HTMLElement> {
  containerRef: React.RefObject<T | null>
  endRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

export function useStickyBottomScroll<T extends HTMLElement = HTMLDivElement>(
  threshold = 40,
): StickyBottomScroll<T> {
  const containerRef = useRef<T | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const programmaticUntilRef = useRef(0)

  const setAtBottom = useCallback((v: boolean) => {
    if (isAtBottomRef.current !== v) {
      isAtBottomRef.current = v
      setIsAtBottom(v)
    }
  }, [])

  const pinNow = useCallback(() => {
    const c = containerRef.current
    if (!c) return
    const target = c.scrollHeight - c.clientHeight
    if (target < 0) return
    if (Math.abs(c.scrollTop - target) < 1) return
    programmaticUntilRef.current = performance.now() + 120
    c.scrollTop = target
  }, [])

  // User-scroll tracking. Suppress while we're driving scrollTop ourselves.
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onScroll = () => {
      if (performance.now() < programmaticUntilRef.current) return
      const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight <= threshold
      setAtBottom(atBottom)
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    // Initial mount: if we're starting in sticky-bottom mode (the default and
    // also the state we land in after a remount triggered by layout/split
    // changes), snap to the bottom before evaluating user position. Without
    // this, fresh DOM with scrollTop=0 and overflowing content makes onScroll
    // flip isAtBottom to false, which then disables the resize-pin path.
    if (isAtBottomRef.current) pinNow()
    onScroll()
    return () => c.removeEventListener('scroll', onScroll)
  }, [threshold, setAtBottom, pinNow])

  // Re-pin on container resize and content size changes (streaming text,
  // image loads, expanding rows, window/pane resize). When the user is sticky,
  // any layout change snaps back to the bottom; otherwise we leave them be.
  useEffect(() => {
    const c = containerRef.current
    if (!c) return

    const ro = new ResizeObserver(() => {
      if (isAtBottomRef.current) pinNow()
    })
    ro.observe(c)

    const observed = new WeakSet<Element>()
    const observeChildren = () => {
      for (const child of Array.from(c.children)) {
        if (!observed.has(child)) {
          ro.observe(child)
          observed.add(child)
        }
      }
    }
    observeChildren()

    const mo = new MutationObserver(observeChildren)
    mo.observe(c, { childList: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [pinNow])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const c = containerRef.current
    if (!c) return
    setAtBottom(true)
    if (behavior === 'smooth') {
      programmaticUntilRef.current = performance.now() + 800
      const end = endRef.current
      if (end) end.scrollIntoView({ behavior: 'smooth' })
      else c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
    } else {
      pinNow()
    }
  }, [pinNow, setAtBottom])

  return { containerRef, endRef, isAtBottom, scrollToBottom }
}
