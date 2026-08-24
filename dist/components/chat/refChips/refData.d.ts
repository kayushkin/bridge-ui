import type { FetchFn } from '../../../types';
import type { ResolvedRefMatch } from '@kayushkin/chat-core';
export interface SessionCore {
    session_id: string;
    harness_session_id: string;
    display_name: string;
    state: string;
    type: string;
    purpose: string;
    harness: string;
    model: string;
    updated_at: string;
}
export interface NoteboardItemRef {
    type: string;
    title: string;
    status: string;
    priority: number;
    tags: string[];
    due_at: string;
    updated_at: string;
    held_at: string | null;
    deleted_at: string | null;
}
export declare function fetchSessionCore(fetchFn: FetchFn, basePath: string, sessionId: string): Promise<SessionCore>;
export declare function fetchNoteboardItemRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<NoteboardItemRef>;
export declare function fetchSessionCost(fetchFn: FetchFn, basePath: string, sessionId: string, harnessSessionId: string): Promise<number | null>;
/** Every registered store that recognizes `id`, per the host's resolver; an
 *  empty array is a definitive miss. Batched and cached like the other chip
 *  fetches. */
export declare function fetchResolvedRef(fetchFn: FetchFn, resolveEndpoint: string, id: string): Promise<ResolvedRefMatch[]>;
export declare function sessionEmoji(type: string, purpose: string, sessionId: string): string;
//# sourceMappingURL=refData.d.ts.map