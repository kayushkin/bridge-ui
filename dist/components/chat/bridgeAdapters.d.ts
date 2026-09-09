import type { SessionInfo as ChatSessionInfo, EntryUsage } from '@kayushkin/chat-core';
import type { TokenUsage } from '../../types';
import type { ToolsPanelProps } from './ToolsPanel';
type BridgeSessionInfo = ToolsPanelProps['info'];
/** Map chat-core's camelCase SessionInfo onto bridge-ui's snake_case SessionInfo
 *  (the shape ToolsPanel / SystemPromptModal read). */
export declare function toBridgeSessionInfo(info: ChatSessionInfo): BridgeSessionInfo;
/** hh:mm:ss for a turn/entry/timeline timestamp — matches bridge-ui's turns &
 *  timeline `formatHMS` (chat/utils, not exported from the package), reproduced
 *  once here at the render edge so TurnList and Timeline share one formatter. */
export declare function formatHMS(ts: string): string;
/** Map chat-core's per-entry EntryUsage onto bridge-ui's TokenUsage (the shape
 *  UsageLine reads). total_tokens is derived from the parts chat-core carries;
 *  UsageLine only renders the non-zero fields, so the derived total is inert. */
export declare function toBridgeUsage(usage: EntryUsage): TokenUsage;
/** Is this session filed in the canonical Archive folder?
 *
 *  `ARCHIVE_FOLDER` ('Archive') is the server's own constant, re-exported by
 *  chat-core — join on that, never on a literal typed here.
 *
 *  The lowercase spelling is tolerated on purpose and is NOT a second source of
 *  truth. chat-core used to write `folderName: 'archive'` optimistically while
 *  POSTing to `/sessions/{id}/archive`, a route the gateway has never had. The POST
 *  always 404'd, so the lowercase value never reached the server and no row on this
 *  box carries it (checked 2026-08-02: the only folders that exist are Scheduled,
 *  Archive, Auto-rename, Conformance, Subagents, Kanban). But the optimistic row
 *  could be written to the IndexedDB SessionCache before the revert landed, so a
 *  browser with a warm cache from before that fix can still paint one. Reading both
 *  costs nothing and stops such a row rendering as un-archived.
 *
 *  Delete the lowercase arm once caches have turned over. */
export declare function isArchivedFolder(folderName: string): boolean;
export {};
//# sourceMappingURL=bridgeAdapters.d.ts.map