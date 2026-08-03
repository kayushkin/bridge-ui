import type { ReactNode } from 'react';
import type { PaneKey } from '../chat/types';
export type ChromeOverride = 'minimal' | 'full' | null;
interface MinimalChromeValue {
    minimal: boolean;
    /**
     * True only while some mounted surface is actually DRAWING the minimal chrome —
     * the top bar and the session drawer that replace the navigation a narrow
     * viewport hides.
     *
     * `minimal` alone says the viewport is narrow. It does NOT say anyone answered,
     * and the two are not the same fact: `MinimalChromeProvider` is nested inside
     * every `BridgeProvider`, so `minimal` goes true on every page a host mounts
     * under one — the instance list, the settings page, a host's own rewrite of the
     * chat — while only `BridgeChat` renders `MinimalTopBar` and `SessionDrawer`.
     * Anything that HIDES navigation on the strength of a narrow viewport has to
     * gate on this instead, or it takes the navigation away and puts nothing back.
     */
    minimalChromeMounted: boolean;
    /**
     * Called by a surface that draws the minimal chrome, for as long as it draws it.
     * Returns the unregister. Prefer the `useRegisterMinimalChrome` hook below;
     * registrations are counted, so several surfaces may overlap during a route change.
     */
    registerMinimalChrome: () => () => void;
    override: ChromeOverride;
    setOverride: (v: ChromeOverride) => void;
    drawerOpen: boolean;
    setDrawerOpen: (v: boolean) => void;
    sheetOpen: boolean;
    setSheetOpen: (v: boolean) => void;
    controlsSlot: HTMLElement | null;
    registerControlsSlot: (el: HTMLElement | null) => void;
    mobilePane: PaneKey;
    setMobilePane: (pane: PaneKey) => void;
}
export declare function useMinimalChrome(): MinimalChromeValue;
export declare function MinimalChromeProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
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
export declare function useRegisterMinimalChrome(active: boolean): void;
export {};
//# sourceMappingURL=MinimalChromeContext.d.ts.map