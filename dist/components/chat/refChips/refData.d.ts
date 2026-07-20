import type { FetchFn } from '../../../types';
export interface SessionRef {
    display_name: string;
    state: string;
    type: string;
    harness: string;
    model: string;
    updated_at: string;
    cost_usd: number | null;
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
export declare function fetchSessionRef(fetchFn: FetchFn, basePath: string, sessionId: string): Promise<SessionRef>;
export declare function fetchTodoRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<TodoRef>;
//# sourceMappingURL=refData.d.ts.map