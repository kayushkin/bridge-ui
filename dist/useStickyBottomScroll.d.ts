export interface StickyBottomScroll<T extends HTMLElement> {
    containerRef: React.RefObject<T | null>;
    endRef: React.RefObject<HTMLDivElement | null>;
    isAtBottom: boolean;
    scrollToBottom: (behavior?: ScrollBehavior) => void;
}
export declare function useStickyBottomScroll<T extends HTMLElement = HTMLDivElement>(threshold?: number): StickyBottomScroll<T>;
//# sourceMappingURL=useStickyBottomScroll.d.ts.map