/**
 * The top of a windowed pane: what is above the window, and the two ways to
 * bring it in.
 *
 * Shared by Thread and Timeline, which window the same way and count
 * different units — Thread counts log rows, Timeline counts timeline items —
 * so the noun is the caller's.
 */
export function PaneEarlierControl({ hiddenCount, unitNoun, onRevealMore, onRevealAll }: {
  hiddenCount: number
  unitNoun: string
  onRevealMore: () => void
  onRevealAll: () => void
}) {
  return (
    <div className="bc-pane-earlier">
      <span className="bc-pane-earlier-count">
        {hiddenCount.toLocaleString()} earlier {unitNoun}{hiddenCount === 1 ? '' : 's'} not rendered
      </span>
      <button
        type="button"
        className="bc-pane-earlier-btn"
        onClick={onRevealMore}
      >↑ Show earlier</button>
      <button
        type="button"
        className="bc-pane-earlier-btn bc-pane-earlier-all"
        onClick={onRevealAll}
        title="Render the whole log — needed to find text with the browser's own search"
      >Show all</button>
    </div>
  )
}
