import type { LogRow } from '../../types';
import type { TimelineBlock, TimelineItem } from './types';
export declare function rowsToTimeline(rows: LogRow[]): TimelineItem[];
/**
 * The item list as the blocks the pane renders: runs of consecutive items
 * sharing a turn id, and the items that carry none.
 *
 * Split out of the render walk because the window needs the list before
 * anything is rendered — it has to count items back from the newest block to
 * decide where the pane starts, and it must never cut a turn group in half.
 */
export declare function groupTimelineByTurn(items: TimelineItem[]): TimelineBlock[];
export declare function Timeline({ rows, onToggleCollapse, style, paneKey, sessionId }: {
    rows: LogRow[];
    onToggleCollapse: () => void;
    style?: React.CSSProperties;
    paneKey?: string;
    sessionId: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Timeline.d.ts.map