import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
const STORAGE_KEY = 'bridge-chrome-override';
const MOBILE_BREAKPOINT = 640;
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
            override: null,
            setOverride: () => { },
            drawerOpen: false,
            setDrawerOpen: () => { },
            sheetOpen: false,
            setSheetOpen: () => { },
            controlsSlot: null,
            registerControlsSlot: () => { },
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
    useEffect(() => {
        if (!minimal) {
            setDrawerOpenState(false);
            setSheetOpenState(false);
        }
    }, [minimal]);
    useEffect(() => {
        if (typeof document === 'undefined')
            return;
        if (minimal)
            document.body.classList.add('bridge-minimal-chrome');
        else
            document.body.classList.remove('bridge-minimal-chrome');
        return () => { document.body.classList.remove('bridge-minimal-chrome'); };
    }, [minimal]);
    const registerControlsSlot = useCallback((el) => {
        slotRef.current = el;
        setControlsSlot(el);
    }, []);
    const setDrawerOpen = useCallback((v) => setDrawerOpenState(v), []);
    const setSheetOpen = useCallback((v) => setSheetOpenState(v), []);
    const value = useMemo(() => ({
        minimal,
        override,
        setOverride,
        drawerOpen,
        setDrawerOpen,
        sheetOpen,
        setSheetOpen,
        controlsSlot,
        registerControlsSlot,
    }), [minimal, override, setOverride, drawerOpen, setDrawerOpen, sheetOpen, setSheetOpen, controlsSlot, registerControlsSlot]);
    return (_jsx(MinimalChromeContext.Provider, { value: value, children: children }));
}
//# sourceMappingURL=MinimalChromeContext.js.map