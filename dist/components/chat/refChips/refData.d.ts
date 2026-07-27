import type { FetchFn } from '../../../types';
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
export interface TodoRef {
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
export declare function fetchTodoRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<TodoRef>;
export declare function fetchSessionCost(fetchFn: FetchFn, basePath: string, sessionId: string, harnessSessionId: string): Promise<number | null>;
export declare function sessionEmoji(type: string, purpose: string, sessionId: string): string;
//# sourceMappingURL=refData.d.ts.map