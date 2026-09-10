import type { FetchFn } from '../types';
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
export declare function fetchNoteboardItemRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<NoteboardItemRef>;
//# sourceMappingURL=noteboardItemRef.d.ts.map