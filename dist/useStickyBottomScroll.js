import { useCallback, useEffect, useRef, useState } from 'react';
export function useStickyBottomScroll(threshold = 40) {
    const containerRef = useRef(null);
    const endRef = useRef(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const isAtBottomRef = useRef(true);
    const programmaticUntilRef = useRef(0);
    const setAtBottom = useCallback((v) => {
        if (isAtBottomRef.current !== v) {
            isAtBottomRef.current = v;
            setIsAtBottom(v);
        }
    }, []);
    const pinNow = useCallback(() => {
        const c = containerRef.current;
        if (!c)
            return;
        const target = c.scrollHeight - c.clientHeight;
        if (target < 0)
            return;
        if (Math.abs(c.scrollTop - target) < 1)
            return;
        programmaticUntilRef.current = performance.now() + 120;
        c.scrollTop = target;
    }, []);
    // User-scroll tracking. Suppress while we're driving scrollTop ourselves.
    useEffect(() => {
        const c = containerRef.current;
        if (!c)
            return;
        const onScroll = () => {
            if (performance.now() < programmaticUntilRef.current)
                return;
            const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight <= threshold;
            setAtBottom(atBottom);
        };
        c.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => c.removeEventListener('scroll', onScroll);
    }, [threshold, setAtBottom]);
    // Re-pin on container resize and content size changes (streaming text,
    // image loads, expanding rows, window/pane resize). When the user is sticky,
    // any layout change snaps back to the bottom; otherwise we leave them be.
    useEffect(() => {
        const c = containerRef.current;
        if (!c)
            return;
        const ro = new ResizeObserver(() => {
            if (isAtBottomRef.current)
                pinNow();
        });
        ro.observe(c);
        const observed = new WeakSet();
        const observeChildren = () => {
            for (const child of Array.from(c.children)) {
                if (!observed.has(child)) {
                    ro.observe(child);
                    observed.add(child);
                }
            }
        };
        observeChildren();
        const mo = new MutationObserver(observeChildren);
        mo.observe(c, { childList: true });
        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    }, [pinNow]);
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        const c = containerRef.current;
        if (!c)
            return;
        setAtBottom(true);
        if (behavior === 'smooth') {
            programmaticUntilRef.current = performance.now() + 800;
            const end = endRef.current;
            if (end)
                end.scrollIntoView({ behavior: 'smooth' });
            else
                c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
        }
        else {
            pinNow();
        }
    }, [pinNow, setAtBottom]);
    return { containerRef, endRef, isAtBottom, scrollToBottom };
}
//# sourceMappingURL=useStickyBottomScroll.js.map