import { type ComposerStatus } from './SessionStatusLine';
interface TurnListProps {
    sessionId: string | null;
    view: 'turns' | 'raw';
    /** Render assistant/user prose through ReactMarkdown (default) or as plain text. */
    markdown: boolean;
    /** The session is actively producing output — show a live streaming indicator on
     *  the trailing assistant turn. Derived from the session state by the parent. */
    streaming: boolean;
    /** A compaction this page asked for is in flight. Resolved by the parent's single
     *  `useSessionControls` — see the status slot's own note below for why it cannot be
     *  read here. */
    compacting: boolean;
    /** The status slice of the parent's single `useComposer` instance (paused/stopped/
     *  error), rendered in the pane's status slot. Hook-local state, same one-instance
     *  rule as `compacting`. */
    composerStatus: ComposerStatus;
    /** The pane's share of the split row, as `flex: <grow> 1 0`. Owned by the parent,
     *  which is the only place that knows what the other pane was given. Passed even when
     *  this pane is alone, because a sole flex child fills the row whatever its grow
     *  number is — see the note at the call site. */
    style?: React.CSSProperties;
}
/** Renders the active session's turns, virtualized with virtua, in bridge-ui's turns
 *  DOM (bc-turns-pane / bc-turns-body / bc-turns-item / bc-turns-meta / bc-turns-text
 *  / bc-turns-aside / bc-turns-marker) so it inherits the shared stylesheet. Supports
 *  the collapsed 'turns' view (dupes hidden, sources badge per message) and the 'raw'
 *  view (every entry incl. duplicates, with source + eventId — chat-only audit
 *  affordances). Consumes chat-core's pre-materialized turns/entries — no transcript
 *  re-derivation here. */
export default function TurnList({ sessionId, view, markdown, streaming, compacting, composerStatus, style, }: TurnListProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=TurnList.d.ts.map