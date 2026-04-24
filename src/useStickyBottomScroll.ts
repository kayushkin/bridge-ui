import { useCallback, useEffect, useRef, useState } from 'react'

export interface StickyBottomScroll<T extends HTMLElement> {
  containerRef: React.RefObject<T | null>
  endRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
  autoScrollIfAtBottom: (behavior?: ScrollBehavior) => void
}

export function useStickyBottomScroll<T extends HTMLElement = HTMLDivElement>(
  threshold = 40,
): StickyBottomScroll<T> {
  const containerRef = useRef<T | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)

  const updatePosition = useCallback(() => {
    const c = containerRef.current
    if (!c) return
    const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight <= threshold
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
    }
  }, [threshold])

  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    c.addEventListener('scroll', updatePosition, { passive: true })
    updatePosition()
    return () => c.removeEventListener('scroll', updatePosition)
  }, [updatePosition])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const end = endRef.current
    if (!end) return
    end.scrollIntoView({ behavior })
    isAtBottomRef.current = true
    setIsAtBottom(true)
  }, [])

  const autoScrollIfAtBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (isAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior })
    }
  }, [])

  return { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom }
}
