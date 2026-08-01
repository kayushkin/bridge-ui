export interface StickyBottomScroll<T extends HTMLElement> {
    /**
     * Put this on the scrolling element: `<div ref={attachContainer}>`.
     *
     * A callback rather than a ref object because the hook has to *react* to
     * the element being swapped, and a ref object changing its `.current`
     * re-runs nothing. Thread swaps its container on every load transition —
     * its loading and empty states render a different div — so a hook that
     * only reads `.current` keeps its scroll listener and its ResizeObserver
     * bound to a node that has left the document.
     */
    attachContainer: (node: T | null) => void;
    /** The attached element, for callers that need to read its scroll metrics. */
    containerRef: React.RefObject<T | null>;
    endRef: React.RefObject<HTMLDivElement | null>;
    isAtBottom: boolean;
    scrollToBottom: (behavior?: ScrollBehavior) => void;
}
export interface StickyBottomScrollOptions {
    /**
     * Identity of the log this container is showing — the session id, for the
     * chat panes. Required, and deliberately so: a pane that scrolls a log it
     * can swap has to say which log, because everything this hook remembers
     * about where the reader is belongs to one log and to no other. A container
     * that will only ever show one thing passes a constant.
     */
    logIdentity: string;
    /** Distance from the bottom, in pixels, still counted as at the bottom. */
    threshold?: number;
}
export declare function useStickyBottomScroll<T extends HTMLElement = HTMLDivElement>({ logIdentity, threshold }: StickyBottomScrollOptions): StickyBottomScroll<T>;
//# sourceMappingURL=useStickyBottomScroll.d.ts.map