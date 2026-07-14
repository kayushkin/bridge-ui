// Types mirroring kanban-store's Go model. Item is opaque (any) — kanban-store
// returns the noteboard item unchanged in CardView.item, and we don't redefine
// noteboard's full schema here.

export interface Board {
  id: string
  name: string
  description: string
  archived: boolean
  created_at: string
  updated_at: string
}

export interface Column {
  id: string
  board_id: string
  name: string
  position: number
  color: string
  wip_limit?: number
  auto_status?: string
  created_at: string
  updated_at: string
}

export interface Placement {
  card_id: string
  board_id: string
  column_id: string
  position: number
  created_at: string
  updated_at: string
}

export interface CardLink {
  id: string
  card_id: string
  entity_type: string
  entity_ref: string
  label: string
  created_at: string
}

export interface EntityTag {
  entity_type: string
  entity_ref: string
  tag: string
  created_at: string
}

export interface CardView {
  placement: Placement
  /** Raw noteboard item (passed through unchanged). Null if the upstream item
   * was hard-deleted out from under kanban-store — these surface in `orphans`. */
  item: NoteboardItem | null
  links?: CardLink[]
}

export interface EntityCardView {
  card_id: string
  item: NoteboardItem | null
}

export interface ColumnView {
  column: Column
  cards: CardView[] | null
}

export interface BoardView {
  board: Board
  columns: ColumnView[]
  orphans?: CardView[]
}

export interface NoteboardItem {
  id: string
  type: string
  title: string
  body: string
  tags: string[]
  priority: number
  status: string
  list_id: string
  due_at?: string | null
  links: string[]
  created_at: string
  updated_at: string
  /** The agent gate. Set => this work is parked and no autoworker will pick it
   * up, in any column. Separate from `status` on purpose: a held card is still
   * open work, it just isn't cleared to run unattended. */
  held_at?: string | null
  hold_reason?: string
  /** Spend ceiling: this card auto-holds once its agent sessions have cost this
   * much in total. Absent/null = no ceiling. Zero is a REAL ceiling. */
  auto_hold_at_usd?: number | null
  [extra: string]: unknown
}

export interface EntityTypeInfo {
  type: string
  service?: string
  search?: string
}

export interface TagCount {
  tag: string
  count: number
}
