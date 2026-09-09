import type { RefObject } from 'react';
export interface AnchoredDropdown<A extends HTMLElement> {
    /** Put this on the element the panel should hang off. */
    anchorRef: RefObject<A | null>;
    /** Put this on the portaled panel; it is what makes a click inside the panel count as
     *  "inside" rather than dismissing it, and what gets measured for the flip. */
    panelRef: RefObject<HTMLDivElement | null>;
    /** Viewport coordinates for the `position: fixed` panel. Null until measured — render
     *  the panel hidden rather than at (0,0), or it flashes in the corner. */
    panelStyle: {
        top: number;
        left: number;
    } | null;
}
/**
 * Placement and dismissal for a dropdown that is PORTALED onto document.body.
 *
 * Ported from chat-core's `useAnchoredPanel` (`src/react/RefChip.tsx`), and portaled for
 * the same two reasons that hook documents, both of which apply verbatim to the session
 * list: the list is an inner scroller with `overflow` that would clip a panel opened on
 * the last visible row, and its rows are virtua list items whose wrapper carries
 * `contain: layout style` — a stacking context, inside which no z-index can lift a panel
 * above the rows painted after it. An inline panel is therefore both clipped and
 * unclickable; escaping to the body fixes both.
 *
 * The cost of the portal is that placement becomes manual, so the panel is anchored to
 * the anchor's measured rect and re-measured on scroll and resize. `capture: true` on the
 * scroll listener is required — the session list scrolls internally and its scroll events
 * never reach window on the bubble phase.
 *
 * `open` is a PARAMETER rather than state owned here: the sidebar allows one dropdown at a
 * time, and that rule can only be enforced by whoever knows about all of them. Dismissal
 * (Escape, click-outside) is reported through `onDismiss` for the same reason.
 */
export declare function useAnchoredDropdown<A extends HTMLElement>(open: boolean, onDismiss: () => void): AnchoredDropdown<A>;
//# sourceMappingURL=useAnchoredDropdown.d.ts.map