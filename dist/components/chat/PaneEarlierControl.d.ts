/**
 * The top of a windowed pane: what is above the window, and the two ways to
 * bring it in.
 *
 * Shared by Thread and Timeline, which window the same way and count
 * different units — Thread counts log rows, Timeline counts timeline items —
 * so the noun is the caller's.
 */
export declare function PaneEarlierControl({ hiddenCount, unitNoun, onRevealMore, onRevealAll }: {
    hiddenCount: number;
    unitNoun: string;
    onRevealMore: () => void;
    onRevealAll: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=PaneEarlierControl.d.ts.map