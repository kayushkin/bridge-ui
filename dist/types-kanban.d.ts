export interface Board {
    id: string;
    name: string;
    description: string;
    archived: boolean;
    created_at: string;
    updated_at: string;
}
export interface Column {
    id: string;
    board_id: string;
    name: string;
    position: number;
    color: string;
    wip_limit?: number;
    auto_status?: string;
    created_at: string;
    updated_at: string;
}
export interface Placement {
    card_id: string;
    board_id: string;
    column_id: string;
    position: number;
    created_at: string;
    updated_at: string;
}
export interface CardLink {
    id: string;
    card_id: string;
    entity_type: string;
    entity_ref: string;
    label: string;
    created_at: string;
}
export interface EntityTag {
    entity_type: string;
    entity_ref: string;
    tag: string;
    created_at: string;
}
export interface CardView {
    placement: Placement;
    /** Raw noteboard item (passed through unchanged). Null if the upstream item
     * was hard-deleted out from under kanban-store — these surface in `orphans`. */
    item: NoteboardItem | null;
    links?: CardLink[];
}
export interface EntityCardView {
    card_id: string;
    item: NoteboardItem | null;
}
export interface ColumnView {
    column: Column;
    cards: CardView[] | null;
}
export interface BoardView {
    board: Board;
    columns: ColumnView[];
    orphans?: CardView[];
}
export interface NoteboardItem {
    id: string;
    type: string;
    title: string;
    body: string;
    tags: string[];
    priority: number;
    status: string;
    list_id: string;
    due_at?: string | null;
    links: string[];
    created_at: string;
    updated_at: string;
    [extra: string]: unknown;
}
export interface EntityTypeInfo {
    type: string;
    service?: string;
    search?: string;
}
export interface TagCount {
    tag: string;
    count: number;
}
//# sourceMappingURL=types-kanban.d.ts.map