import type { Board, BoardView, CardLink, EntityCardView, EntityTypeInfo, EntityTag } from './types-kanban';
export declare function kanbanPollWouldFetch(enabled: boolean, loadBoards: boolean, boardID: string | null): boolean;
export declare function preserveUnchangedKanbanPayload<T>(previous: T[], next: T[]): T[];
export interface CreateBoardArgs {
    name: string;
    description?: string;
}
export interface UseKanbanOptions {
    loadBoards?: boolean;
    loadEntityTypes?: boolean;
}
export interface CreateColumnArgs {
    name: string;
    position?: number;
    color?: string;
    wip_limit?: number;
    auto_status?: string;
}
export interface CreateCardArgs {
    title: string;
    body?: string;
    tags?: string[];
    priority?: number;
    list_id?: string;
    column_id: string;
    position?: number;
    /** Create the card already parked, so no autoworker tick can pick the work up
     * in the gap between the card appearing and a human seeing it. */
    hold?: boolean;
    hold_reason?: string;
    /** Spend ceiling: auto-hold this card once its agent sessions have cost this
     * much in total. Undefined = no ceiling. Zero is a REAL ceiling ("stop before
     * spending a cent"), so callers must not coerce an empty input to 0. */
    auto_hold_at_usd?: number;
}
/**
 * useKanban — list/create boards and (when a board id is given) load its
 * full BoardView with cards joined to noteboard items. Polls every 15s.
 * All mutate actions auto-refresh the affected scope.
 */
export declare function useKanban(boardID: string | null, options?: UseKanbanOptions): {
    boards: Board[];
    view: BoardView | null;
    entityTypes: EntityTypeInfo[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
    createBoard: (args: CreateBoardArgs) => Promise<Board | null>;
    deleteBoard: (id: string) => Promise<boolean>;
    createColumn: (args: CreateColumnArgs) => Promise<boolean>;
    deleteColumn: (columnID: string) => Promise<boolean>;
    createCard: (args: CreateCardArgs) => Promise<boolean>;
    moveCard: (cardID: string, columnID: string, position?: number) => Promise<boolean>;
    patchCard: (cardID: string, patch: Record<string, unknown>) => Promise<boolean>;
    deleteCard: (cardID: string, hard?: boolean) => Promise<boolean>;
    holdCard: (cardID: string, reason?: string) => Promise<boolean>;
    unholdCard: (cardID: string) => Promise<boolean>;
    stopCard: (cardID: string, reason?: string) => Promise<boolean>;
    playCard: (cardID: string) => Promise<boolean>;
    listCardLinks: (cardID: string) => Promise<CardLink[]>;
    addCardLink: (cardID: string, entity_type: string, entity_ref: string, label?: string) => Promise<boolean>;
    deleteCardLink: (linkID: string) => Promise<boolean>;
    listCardsForEntity: (entityType: string, entityRef: string) => Promise<EntityCardView[]>;
    listEntityTags: (entityType: string, entityRef: string) => Promise<EntityTag[]>;
    addEntityTag: (entityType: string, entityRef: string, tag: string) => Promise<boolean>;
    deleteEntityTag: (entityType: string, entityRef: string, tag: string) => Promise<boolean>;
};
//# sourceMappingURL=useKanban.d.ts.map