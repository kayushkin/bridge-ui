import { type Signal } from '@kayushkin/chat-core';
import type { FetchFn } from './types';
/** A 404 from the signals route means this bridge-server predates the signals
 *  API. Reported as `null` rather than an error: a server without the feature
 *  is not a failure to show the user, and the surfaces render nothing. Any
 *  other failure is a real error and is surfaced. */
type SignalsResult = Signal[] | null;
/** Every open signal that names a todo, grouped by that todo — the board's read.
 *
 *  Surface is deliberately not filtered. A todo is worked by chat sessions and
 *  by autonomous workers alike, and the badge answers "does this piece of work
 *  need me?", which is true of a signal on either surface. */
export declare function fetchOpenSignalsByTodo(fetchFn: FetchFn, basePath: string): Promise<Map<string, Signal[]> | null>;
/** Open signals against exactly one todo — the drawer's read. Narrowed
 *  server-side, so a view that knows its todo fetches only its own rows. An
 *  empty todo id is a 400 from the server, so callers must not pass one. */
export declare function fetchOpenSignalsForTodo(fetchFn: FetchFn, basePath: string, todoID: string): Promise<SignalsResult>;
/** Open signals grouped by the todo they propagate to, for a view that shows
 *  many todos at once. Empty until the first fetch lands, and empty forever
 *  against a bridge-server with no signals route — a board full of todos must
 *  render either way.
 *
 *  Takes no refresh key. The query has no dimension to key on: it asks for
 *  every open signal that names a todo, whatever board the caller is looking
 *  at. Keying it to the board id refetched an identical list on every
 *  selection change. Resolves still refresh it, through chat-core's announce. */
export declare function useOpenSignalsByTodo(): Map<string, Signal[]>;
/** Open signals against exactly one todo, for a view already looking at that
 *  todo alone — the card drawer.
 *
 *  Deliberately not a lookup into useOpenSignalsByTodo's map. That map is the
 *  board's read; a drawer knows its own todo id and asks the server for its own
 *  rows, so it is right whether or not a board-wide read ever ran.
 *
 *  Empty against a bridge-server with no signals route, and empty when the read
 *  fails: a drawer is a card editor first, and it must open either way. */
export declare function useOpenSignalsForTodo(todoID: string): Signal[];
export {};
//# sourceMappingURL=kanbanSignals.d.ts.map