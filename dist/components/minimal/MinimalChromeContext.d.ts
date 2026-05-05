import type { ReactNode } from 'react';
export type ChromeOverride = 'minimal' | 'full' | null;
interface MinimalChromeValue {
    minimal: boolean;
    override: ChromeOverride;
    setOverride: (v: ChromeOverride) => void;
    drawerOpen: boolean;
    setDrawerOpen: (v: boolean) => void;
    sheetOpen: boolean;
    setSheetOpen: (v: boolean) => void;
    controlsSlot: HTMLElement | null;
    registerControlsSlot: (el: HTMLElement | null) => void;
}
export declare function useMinimalChrome(): MinimalChromeValue;
export declare function MinimalChromeProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=MinimalChromeContext.d.ts.map