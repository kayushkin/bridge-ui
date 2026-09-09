import type { Entry } from '@kayushkin/chat-core';
import type { ToolEvent } from '../../types';
/**
 * One tool card's worth of data.
 *
 * ⚠️ `tool_id` is load-bearing beyond identity: it is the key the Edit and Bash
 * renderers fetch file snapshots with, and an empty one disables that fetch
 * silently. An entry whose source event carried no tool id (`unpairable`) yields
 * `''` here and correctly gets a card with no diff — there is nothing to look up.
 */
export declare function toToolEvent(entry: Entry): ToolEvent;
/**
 * Whether a tool call is still in flight, given the ids that have received a
 * result somewhere in the loaded model.
 *
 * Three distinct answers collapse into "not running", and only one of them is
 * "it finished":
 *   - the entry already carries its result (the live-tail reducer merges them);
 *   - the id appears in `resulted` (cold-loaded models keep call and result as
 *     two rows, so the call's own fields say nothing);
 *   - the entry is `unpairable` — no tool id was ever emitted, so its result can
 *     never be recognised. Rendering that as a spinner would leave a tool
 *     spinning forever on every OTel-derived stand-in.
 */
export declare function isToolRunning(entry: Entry, resulted: ReadonlySet<string>): boolean;
//# sourceMappingURL=toolEvents.d.ts.map