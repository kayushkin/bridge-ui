import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
const STORAGE_KEY = 'bridge-chrome-override';
const PANE_KEY = 'bridge-mobile-pane';
const MOBILE_BREAKPOINT = 640;
const VALID_PANES = ['turns', 'thread', 'timeline', 'git', 'kanban'];
function loadMobilePane() {
    if (typeof window === 'undefined')
        return 'turns';
    const v = window.localStorage.getItem(PANE_KEY);
    if (v && VALID_PANES.includes(v))
        return v;
    return 'turns';
}
function saveMobilePane(pane) {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(PANE_KEY, pane);
}
function loadOverride() {
    if (typeof window === 'undefined')
        return null;
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'minimal' || v === 'full')
        return v;
    return null;
}
function saveOverride(value) {
    if (typeof window === 'undefined')
        return;
    if (value === null)
        window.localStorage.removeItem(STORAGE_KEY);
    else
        window.localStorage.setItem(STORAGE_KEY, value);
}
const MinimalChromeContext = createContext(null);
export function useMinimalChrome() {
    const ctx = useContext(MinimalChromeContext);
    if (!ctx) {
        return {
            minimal: false,
            minimalChromeMounted: false,
            registerMinimalChrome: () => () => { },
            override: null,
            setOverride: () => { },
            drawerOpen: false,
            setDrawerOpen: () => { },
            sheetOpen: false,
            setSheetOpen: () => { },
            controlsSlot: null,
            registerControlsSlot: () => { },
            mobilePane: 'turns',
            setMobilePane: () => { },
        };
    }
    return ctx;
}
export function MinimalChromeProvider({ children }) {
    const [override, setOverrideState] = useState(() => loadOverride());
    const [vw, setVw] = useState(() => typeof window === 'undefined' ? 1024 : window.innerWidth);
    const [drawerOpen, setDrawerOpenState] = useState(false);
    const [sheetOpen, setSheetOpenState] = useState(false);
    const [controlsSlot, setControlsSlot] = useState(null);
    const [mobilePane, setMobilePaneState] = useState(() => loadMobilePane());
    const slotRef = useRef(null);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        const onResize = () => setVw(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const minimal = useMemo(() => {
        if (override === 'minimal')
            return true;
        if (override === 'full')
            return false;
        return vw < MOBILE_BREAKPOINT;
    }, [override, vw]);
    const setOverride = useCallback((next) => {
        setOverrideState(next);
        saveOverride(next);
    }, []);
    // Counted rather than a plain boolean: during a route change React mounts the
    // incoming surface before it unmounts the outgoing one, so a boolean would be
    // cleared by the departing chrome right after the arriving chrome set it.
    const minimalChromeCountRef = useRef(0);
    const [minimalChromeMounted, setMinimalChromeMounted] = useState(false);
    const registerMinimalChrome = useCallback(() => {
        minimalChromeCountRef.current += 1;
        setMinimalChromeMounted(true);
        return () => {
            minimalChromeCountRef.current -= 1;
            if (minimalChromeCountRef.current <= 0) {
                minimalChromeCountRef.current = 0;
                setMinimalChromeMounted(false);
            }
        };
    }, []);
    useEffect(() => {
        if (!minimal) {
            setDrawerOpenState(false);
            setSheetOpenState(false);
        }
    }, [minimal]);
    // The body class is the signal a HOST reads to hide its own site header, so it
    // has to mean "the minimal chrome has taken the navigation over", not merely
    // "the window is narrow". Gate it on a surface having registered: a page that
    // is under a `BridgeProvider` but draws no minimal chrome would otherwise hide
    // the host's header and leave the user with no way out of the page.
    const showMinimalChrome = minimal && minimalChromeMounted;
    useEffect(() => {
        if (typeof document === 'undefined')
            return;
        if (showMinimalChrome)
            document.body.classList.add('bridge-minimal-chrome');
        else
            document.body.classList.remove('bridge-minimal-chrome');
        return () => { document.body.classList.remove('bridge-minimal-chrome'); };
    }, [showMinimalChrome]);
    const registerControlsSlot = useCallback((el) => {
        slotRef.current = el;
        setControlsSlot(el);
    }, []);
    const setDrawerOpen = useCallback((v) => setDrawerOpenState(v), []);
    const setSheetOpen = useCallback((v) => setSheetOpenState(v), []);
    const setMobilePane = useCallback((pane) => {
        setMobilePaneState(pane);
        saveMobilePane(pane);
    }, []);
    const value = useMemo(() => ({
        minimal,
        minimalChromeMounted,
        registerMinimalChrome,
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
    }), [minimal, minimalChromeMounted, registerMinimalChrome, override, setOverride, drawerOpen, setDrawerOpen, sheetOpen, setSheetOpen, controlsSlot, registerControlsSlot, mobilePane, setMobilePane]);
    return (_jsx(MinimalChromeContext.Provider, { value: value, children: children }));
}
/**
 * Declare that this surface draws the minimal chrome while `active` is true.
 *
 * Call it from the component that renders `MinimalTopBar` / `SessionDrawer`, with
 * the same condition it renders them under. Until something calls this, the
 * library treats a narrow viewport as unanswered and leaves every navigation in
 * place — which is the safe direction, because the alternative hides the host's
 * chrome for a replacement that was never drawn.
 *
 * A layout effect, not a plain one: `BridgeLayout` renders the nav a frame before
 * its routed child registers, so an ordinary effect would show the tab row and
 * then snatch it away on the next paint.
 */
export function useRegisterMinimalChrome(active) {
    const { registerMinimalChrome } = useMinimalChrome();
    useLayoutEffect(() => {
        if (!active)
            return;
        return registerMinimalChrome();
    }, [active, registerMinimalChrome]);
}
//# sourceMappingURL=MinimalChromeContext.js.map