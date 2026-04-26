import { useCallback, useEffect, useRef, useState } from 'react';
export function useStickyBottomScroll(threshold = 40) {
    const containerRef = useRef(null);
    const endRef = useRef(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const isAtBottomRef = useRef(true);
    const updatePosition = useCallback(() => {
        const c = containerRef.current;
        if (!c)
            return;
        const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight <= threshold;
        if (isAtBottomRef.current !== atBottom) {
            isAtBottomRef.current = atBottom;
            setIsAtBottom(atBottom);
        }
    }, [threshold]);
    useEffect(() => {
        const c = containerRef.current;
        if (!c)
            return;
        c.addEventListener('scroll', updatePosition, { passive: true });
        updatePosition();
        return () => c.removeEventListener('scroll', updatePosition);
    }, [updatePosition]);
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        const end = endRef.current;
        if (!end)
            return;
        end.scrollIntoView({ behavior });
        isAtBottomRef.current = true;
        setIsAtBottom(true);
    }, []);
    const autoScrollIfAtBottom = useCallback((behavior = 'smooth') => {
        if (isAtBottomRef.current) {
            endRef.current?.scrollIntoView({ behavior });
        }
    }, []);
    return { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom };
}
//# sourceMappingURL=useStickyBottomScroll.js.map