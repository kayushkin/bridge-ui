import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useKanban } from '../useKanban'
import type { CardLink, CardView, ColumnView, NoteboardItem } from '../types-kanban'
import type { Signal } from '../types'
import { SignalKindQuestion } from '../types'
import { useOpenSignalsByTodo } from './chat/signalData'
import {
  CARD_AXES, allCardsOf, axisUsage, filterIsActive, matchesFilter,
  parseEmailLocator, sortCards, withAxisValue,
  type AxisFilter, type SortKey,
} from '../kanbanAxes'

// Pulls the first session link off a card. Post session-consolidation
// (2026-05-09) every card_link with entity_type='session' carries the
// canonical llm-bridge-server session_id, which is a direct deeplink target.
type SessionLinkRef = { ref: string }
type OpenChatFn = (link: SessionLinkRef) => void

function sessionLink(card: CardView): SessionLinkRef | null {
  for (const l of card.links ?? []) {
    if (!l.entity_ref) continue
    if (l.entity_type === 'session') return { ref: l.entity_ref }
  }
  return null
}

const LAYOUT_KEY = 'bk:layout'
const LAST_BOARD_KEY = 'bk:lastBoardId'
const COLLAPSED_COLUMNS_KEY = 'bk:collapsedColumns'
const DEFAULT_BOARD_NAME = 'Agent runs'

// How many linked emails a card drawer shows before collapsing the rest behind a
// button. Bucket cards on the Email board accumulate every message from a sender,
// so this list grows without bound while the card itself stays one thing.
const EMAIL_LINKS_SHOWN = 25

type Layout = 'horizontal' | 'vertical'

function loadCollapsedColumns(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(COLLAPSED_COLUMNS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Kanban page. The header carries a board selector and a layout toggle so the
 * column flow can run side-by-side (landscape) or stacked (portrait). Card
 * click opens a drawer with body, status, links, and entity-link/tag editors.
 */
export function BridgeKanban() {
  const [selectedBoardID, setSelectedBoardID] = useState<string | null>(null)
  const [drawerCardID, setDrawerCardID] = useState<string | null>(null)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [showNewColumn, setShowNewColumn] = useState(false)
  const [composeColumn, setComposeColumn] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>(() => {
    if (typeof localStorage === 'undefined') return 'horizontal'
    return localStorage.getItem(LAYOUT_KEY) === 'vertical' ? 'vertical' : 'horizontal'
  })
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(loadCollapsedColumns)
  // Axis filter and sort are view state only: they never write to the board, so
  // two people can look at the same board through different lenses.
  const [axisFilter, setAxisFilter] = useState<AxisFilter>({})
  const [sortKey, setSortKey] = useState<SortKey>('default')

  const { routes } = useBridgeConfig()
  const navigate = useNavigate()
  const openSessionLink = (link: SessionLinkRef) => {
    navigate(`${routes.chat}?session=${encodeURIComponent(link.ref)}`)
  }

  const k = useKanban(selectedBoardID)
  // A card id IS a noteboard todo id here, so the signals a session raised
  // against its todo land on the card that todo already has. The map covers
  // every todo, so switching boards needs no refetch.
  const signalsByTodo = useOpenSignalsByTodo()

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout)
  }, [layout])

  useEffect(() => {
    localStorage.setItem(COLLAPSED_COLUMNS_KEY, JSON.stringify([...collapsedColumns]))
  }, [collapsedColumns])

  const toggleColumnCollapsed = (columnID: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev)
      if (next.has(columnID)) next.delete(columnID); else next.add(columnID)
      return next
    })
  }

  useEffect(() => {
    if (selectedBoardID) localStorage.setItem(LAST_BOARD_KEY, selectedBoardID)
  }, [selectedBoardID])

  // Pick the initial board: last-opened (if it still exists) → Agent Runs → first.
  useEffect(() => {
    if (selectedBoardID) return
    if (k.boards.length === 0) return
    const last = localStorage.getItem(LAST_BOARD_KEY)
    if (last && k.boards.some(b => b.id === last)) {
      setSelectedBoardID(last)
      return
    }
    const named = k.boards.find(b => b.name === DEFAULT_BOARD_NAME)
    if (named) {
      setSelectedBoardID(named.id)
      return
    }
    setSelectedBoardID(k.boards[0].id)
  }, [k.boards, selectedBoardID])

  const drawerCard: CardView | null = useMemo(() => {
    if (!drawerCardID || !k.view) return null
    for (const col of k.view.columns) {
      for (const c of col.cards ?? []) {
        if (c.placement.card_id === drawerCardID) return c
      }
    }
    return null
  }, [drawerCardID, k.view])

  // Axis controls render only for boards whose cards actually carry these tags.
  // Boards that predate the classifier report no axes and are left exactly as
  // they were — this component is shared with llmux.
  const axes = useMemo(() => (k.view ? axisUsage(allCardsOf(k.view.columns)) : []), [k.view])

  // Filtering and sorting are applied to a copy. The board view itself stays
  // untouched so the drawer, the delete-column count and the orphan list keep
  // reporting what is really on the board rather than what survived the filter.
  const visibleColumns: ColumnView[] = useMemo(() => {
    if (!k.view) return []
    return k.view.columns.map(cv => ({
      ...cv,
      cards: sortCards((cv.cards ?? []).filter(c => matchesFilter(c, axisFilter)), sortKey),
    }))
  }, [k.view, axisFilter, sortKey])

  const hiddenCardCount = k.view
    ? allCardsOf(k.view.columns).length - allCardsOf(visibleColumns).length
    : 0

  return (
    <div className="bk-container">
      <main className="bk-main">
        {k.error && <div className="bridge-error">{k.error}</div>}

        <div className="bk-board-header">
          <div className="bk-board-header-main">
            <select
              className="bk-board-select"
              value={selectedBoardID ?? ''}
              onChange={e => setSelectedBoardID(e.target.value || null)}
            >
              {!selectedBoardID && <option value="">— select board —</option>}
              {k.boards.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            <button className="bi-add-btn" onClick={() => setShowNewBoard(s => !s)}>+ New Board</button>
            {k.view?.board.description && (
              <p className="bk-board-desc">{k.view.board.description}</p>
            )}
          </div>
          <div className="bk-board-actions">
            <button
              className="bi-add-btn"
              onClick={() => setLayout(l => l === 'horizontal' ? 'vertical' : 'horizontal')}
              title={layout === 'horizontal' ? 'Switch to vertical (stacked) columns' : 'Switch to horizontal (side-by-side) columns'}
            >
              {layout === 'horizontal' ? 'Vertical layout' : 'Horizontal layout'}
            </button>
            {selectedBoardID && k.view && (
              <>
                <button className="bi-add-btn" onClick={() => setShowNewColumn(s => !s)}>+ Column</button>
                <button
                  className="bi-add-btn"
                  onClick={async () => {
                    if (!confirm(`Delete board "${k.view!.board.name}"? Cards remain in noteboard.`)) return
                    const ok = await k.deleteBoard(k.view!.board.id)
                    if (ok) setSelectedBoardID(null)
                  }}
                >Delete board</button>
              </>
            )}
          </div>
        </div>

        {showNewBoard && (
          <NewBoardForm
            onCreate={async (args) => {
              const b = await k.createBoard(args)
              if (b) { setSelectedBoardID(b.id); setShowNewBoard(false) }
            }}
            onCancel={() => setShowNewBoard(false)}
          />
        )}

        {!selectedBoardID ? (
          k.boards.length === 0 && !k.loading
            ? <div className="bi-empty">No boards. Create one to start.</div>
            : <div className="bi-empty">Select a board.</div>
        ) : !k.view ? (
          <div className="bi-loading">Loading…</div>
        ) : (
          <>
            {showNewColumn && (
              <NewColumnForm
                onCreate={async (args) => {
                  const ok = await k.createColumn(args)
                  if (ok) setShowNewColumn(false)
                }}
                onCancel={() => setShowNewColumn(false)}
              />
            )}

            {axes.length > 0 && (
              <CardAxisToolbar
                axes={axes}
                filter={axisFilter}
                onFilterChange={setAxisFilter}
                sortKey={sortKey}
                onSortChange={setSortKey}
                hiddenCardCount={hiddenCardCount}
              />
            )}

            <div className={`bk-columns bk-columns-${layout}`}>
              {visibleColumns.map(cv => (
                <ColumnPane
                  key={cv.column.id}
                  cv={cv}
                  signalsByTodo={signalsByTodo}
                  boardColumns={k.view!.columns.map(c => c.column)}
                  collapsed={collapsedColumns.has(cv.column.id)}
                  onToggleCollapse={() => toggleColumnCollapsed(cv.column.id)}
                  onCompose={() => setComposeColumn(cv.column.id)}
                  composeOpen={composeColumn === cv.column.id}
                  onCancelCompose={() => setComposeColumn(null)}
                  onCreateCard={async (args) => {
                    const ok = await k.createCard({ ...args, column_id: cv.column.id })
                    if (ok) setComposeColumn(null)
                  }}
                  onMoveCard={(cardID, columnID) => k.moveCard(cardID, columnID)}
                  onOpenCard={(cardID) => setDrawerCardID(cardID)}
                  onOpenChat={openSessionLink}
                  onStopCard={async (cardID) => {
                    // Parking work nobody is doing yet is cheap and reversible, so
                    // it just happens. Interrupting an agent mid-turn is not the
                    // same act, and the card's own session link is what tells the
                    // two apart — so only that case asks.
                    const card = cv.cards?.find(c => c.placement.card_id === cardID)
                    if (card && sessionLink(card)) {
                      if (!confirm('This card has a running session. Stop will pause the agent mid-turn (resumable) and park the work. Continue?')) return false
                    }
                    return k.stopCard(cardID)
                  }}
                  onPlayCard={(cardID) => k.playCard(cardID)}
                  onDeleteColumn={async () => {
                    // Count from the real board, not the filtered copy: deleting
                    // a column detaches every card in it, including the ones the
                    // active filter is hiding, and a count that only reflects
                    // what is on screen would understate what is about to happen.
                    const actual = k.view!.columns.find(c => c.column.id === cv.column.id)?.cards?.length ?? 0
                    if (actual > 0) {
                      if (!confirm(`Column "${cv.column.name}" has ${actual} cards. Delete column AND detach those cards?`)) return
                    }
                    await k.deleteColumn(cv.column.id)
                  }}
                />
              ))}
            </div>

            {k.view.orphans && k.view.orphans.length > 0 && (
              <div className="bk-orphans">
                <h3>Orphaned placements ({k.view.orphans.length})</h3>
                <p className="bk-orphan-note">
                  These cards have placements in this board but their noteboard items
                  were deleted. Detach them in /api/cards/:id?hard=true.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {drawerCard && k.view && (
        <CardDrawer
          card={drawerCard}
          boardID={k.view.board.id}
          entityTypes={k.entityTypes}
          onClose={() => setDrawerCardID(null)}
          onPatch={(patch) => k.patchCard(drawerCard.placement.card_id, patch)}
          onDelete={async (hard) => {
            const ok = await k.deleteCard(drawerCard.placement.card_id, hard)
            if (ok) setDrawerCardID(null)
          }}
          onAddLink={(et, er, label) => k.addCardLink(drawerCard.placement.card_id, et, er, label)}
          onDeleteLink={(linkID) => k.deleteCardLink(linkID)}
          onOpenChat={openSessionLink}
        />
      )}
    </div>
  )
}

// ============================ Sub-components ============================

/**
 * Filter and sort controls for the card axes a board actually uses.
 *
 * Both are view state — neither writes to the board — so this is safe to leave
 * on while the classifier keeps filing in the background.
 */
function CardAxisToolbar({
  axes,
  filter,
  onFilterChange,
  sortKey,
  onSortChange,
  hiddenCardCount,
}: {
  axes: ReturnType<typeof axisUsage>
  filter: AxisFilter
  onFilterChange: (f: AxisFilter) => void
  sortKey: SortKey
  onSortChange: (k: SortKey) => void
  hiddenCardCount: number
}) {
  const toggle = (prefix: string, value: string) => {
    const current = filter[prefix] ?? []
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    onFilterChange({ ...filter, [prefix]: next })
  }

  return (
    <div className="bk-axis-toolbar">
      {axes.map(({ axis, values }) => (
        <div key={axis.prefix} className="bk-axis-group">
          <span className="bk-axis-label">{axis.label}</span>
          {values.map(({ value, count }) => {
            const on = (filter[axis.prefix] ?? []).includes(value)
            return (
              <button
                key={value}
                type="button"
                className={`bk-axis-chip${on ? ' bk-axis-chip-on' : ''}`}
                onClick={() => toggle(axis.prefix, value)}
                title={`${count} card${count === 1 ? '' : 's'}`}
              >
                {value} <span className="bk-axis-count">{count}</span>
              </button>
            )
          })}
        </div>
      ))}

      <div className="bk-axis-group">
        <span className="bk-axis-label">Sort</span>
        <select value={sortKey} onChange={e => onSortChange(e.target.value as SortKey)}>
          {/* 'Board order' is kept because every writer on this host passes
              position 0, so the stored order is arbitrary — but it is still the
              order the board itself reports, and hiding it would be a lie. */}
          <option value="default">Board order</option>
          <option value="urgency">Urgency</option>
          <option value="newest">Recently updated</option>
          <option value="title">Title</option>
        </select>
      </div>

      {filterIsActive(filter) && (
        <div className="bk-axis-group">
          <button type="button" className="bi-add-btn" onClick={() => onFilterChange({})}>
            Clear filter{hiddenCardCount > 0 ? ` (${hiddenCardCount} hidden)` : ''}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Structured editors for a card's axis tags.
 *
 * The drawer already has a free-text tag box, and it stays: it is the only way
 * to touch tags that are not axes. These selects exist because reclassifying by
 * retyping "cat:commerce, action:decide, urgency:high" invites typos that
 * silently drop a card out of every filter.
 */
function CardAxisEditor({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  return (
    <div className="bk-axis-editor">
      {CARD_AXES.map(axis => {
        const current = tags.find(t => t.startsWith(axis.prefix))?.slice(axis.prefix.length) ?? ''
        // A value the classifier wrote outside the vocabulary is offered as an
        // extra option rather than silently reset to blank by the select.
        const options = current && !axis.values.includes(current)
          ? [...axis.values, current]
          : axis.values
        return (
          <div key={axis.prefix}>
            <label className="bk-drawer-label">{axis.label}</label>
            <select
              value={current}
              onChange={e => onChange(withAxisValue(tags, axis.prefix, e.target.value))}
            >
              <option value="">— unset —</option>
              {options.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )
      })}
    </div>
  )
}

function NewBoardForm({
  onCreate,
  onCancel,
}: {
  onCreate: (args: { name: string; description?: string }) => void | Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <form
      className="bk-new-form"
      onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate({ name: name.trim(), description: description.trim() || undefined }) }}
    >
      <input autoFocus placeholder="Board name" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
      <div className="bk-form-actions">
        <button type="submit" className="bi-save-btn">Create</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function NewColumnForm({
  onCreate,
  onCancel,
}: {
  onCreate: (args: { name: string; wip_limit?: number; auto_status?: string }) => void | Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [wip, setWip] = useState('')
  const [autoStatus, setAutoStatus] = useState('')
  return (
    <form
      className="bk-new-form"
      onSubmit={e => {
        e.preventDefault()
        if (!name.trim()) return
        onCreate({
          name: name.trim(),
          wip_limit: wip ? Number(wip) : undefined,
          auto_status: autoStatus || undefined,
        })
      }}
    >
      <input autoFocus placeholder="Column name" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="WIP limit (optional)" type="number" min={1} value={wip} onChange={e => setWip(e.target.value)} />
      <select value={autoStatus} onChange={e => setAutoStatus(e.target.value)}>
        <option value="">— no auto-status —</option>
        <option value="open">open</option>
        <option value="done">done</option>
        <option value="archived">archived</option>
      </select>
      <div className="bk-form-actions">
        <button type="submit" className="bi-save-btn">Add column</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ColumnPane({
  cv,
  signalsByTodo,
  boardColumns,
  collapsed,
  onToggleCollapse,
  onCompose,
  composeOpen,
  onCancelCompose,
  onCreateCard,
  onMoveCard,
  onOpenCard,
  onOpenChat,
  onStopCard,
  onPlayCard,
  onDeleteColumn,
}: {
  cv: ColumnView
  signalsByTodo: Map<string, Signal[]>
  boardColumns: { id: string; name: string }[]
  collapsed: boolean
  onToggleCollapse: () => void
  onCompose: () => void
  composeOpen: boolean
  onCancelCompose: () => void
  onCreateCard: (args: NewCardArgs) => void | Promise<void>
  onMoveCard: (cardID: string, columnID: string) => Promise<boolean>
  onOpenCard: (cardID: string) => void
  onOpenChat: OpenChatFn
  onStopCard: (cardID: string) => Promise<boolean>
  onPlayCard: (cardID: string) => Promise<boolean>
  onDeleteColumn: () => void
}) {
  const cards = cv.cards ?? []
  const wip = cv.column.wip_limit
  const overWIP = wip != null && cards.length > wip
  const className = [
    'bk-column',
    overWIP ? 'bk-column-over-wip' : '',
    collapsed ? 'bk-column-collapsed' : '',
  ].filter(Boolean).join(' ')
  return (
    <section className={className}>
      <header className="bk-column-head" style={cv.column.color ? { borderTopColor: cv.column.color } : undefined}>
        <div className="bk-column-title">
          <button
            className="bk-column-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand column' : 'Collapse column'}
            aria-label={collapsed ? 'Expand column' : 'Collapse column'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <strong>{cv.column.name}</strong>
          <span className="bk-column-count">
            {cards.length}{wip != null ? ` / ${wip}` : ''}
          </span>
        </div>
        {!collapsed && (
          <div className="bk-column-actions">
            <button className="bi-add-btn" onClick={onCompose}>+</button>
            <button className="bi-add-btn" onClick={onDeleteColumn} title="Delete column">×</button>
          </div>
        )}
        {cv.column.auto_status && !collapsed && (
          <div className="bk-column-meta">auto-status: {cv.column.auto_status}</div>
        )}
      </header>

      {!collapsed && composeOpen && (
        <NewCardForm onCreate={onCreateCard} onCancel={onCancelCompose} />
      )}

      {!collapsed && (
        <div className="bk-card-list">
          {cards.map(c => (
            <CardTile
              key={c.placement.card_id}
              card={c}
              signals={signalsByTodo.get(c.placement.card_id) ?? []}
              currentColumn={cv.column.id}
              boardColumns={boardColumns}
              onMove={onMoveCard}
              onOpen={() => onOpenCard(c.placement.card_id)}
              onOpenChat={onOpenChat}
              onStop={onStopCard}
              onPlay={onPlayCard}
            />
          ))}
          {cards.length === 0 && (
            <div className="bk-card-empty">no cards</div>
          )}
        </div>
      )}
    </section>
  )
}

/** What the new-card form collects. Mirrors the subset of CreateCardArgs the
 *  form exposes; column_id is supplied by the column that owns the form. */
interface NewCardArgs {
  title: string
  body?: string
  tags?: string[]
  hold?: boolean
  hold_reason?: string
  auto_hold_at_usd?: number
}

function NewCardForm({
  onCreate,
  onCancel,
}: {
  onCreate: (args: NewCardArgs) => void | Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [hold, setHold] = useState(false)
  const [ceiling, setCeiling] = useState('')
  return (
    <form
      className="bk-new-form bk-new-card"
      onSubmit={e => {
        e.preventDefault()
        if (!title.trim()) return
        // An empty box is NO ceiling, not a ceiling of zero — and a ceiling of
        // zero is a real thing ("stop before spending a cent"). parseFloat('')
        // is NaN, so the empty case is filtered out explicitly rather than
        // being allowed to fall through as 0.
        const parsed = parseFloat(ceiling)
        const auto_hold_at_usd = ceiling.trim() === '' || Number.isNaN(parsed) ? undefined : parsed
        onCreate({
          title: title.trim(),
          body: body.trim() || undefined,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
          hold: hold || undefined,
          hold_reason: hold ? 'created held' : undefined,
          auto_hold_at_usd,
        })
      }}
    >
      <input autoFocus placeholder="Card title" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea placeholder="Body (markdown, optional)" rows={3} value={body} onChange={e => setBody(e.target.value)} />
      <input placeholder="tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />
      <label className="bk-form-check" title="Create this card parked: no agent will pick it up until you press play.">
        <input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} />
        Start held (agents can't pick this up)
      </label>
      <input
        type="number" min="0" step="0.50"
        placeholder="Auto-hold at $ (optional — blank = no limit)"
        value={ceiling}
        onChange={e => setCeiling(e.target.value)}
        title="Once this card's agent sessions have cost this much in total, it is held automatically. Each session is also capped at whatever is left."
      />
      <div className="bk-form-actions">
        <button type="submit" className="bi-save-btn">Add card</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/** What a card says when a session working this todo has raised something.
 *
 * A question and a notification are different demands and get different words:
 * a question is blocking a session that cannot proceed without an answer, a
 * notification is an FYI nobody has read yet. When both are open the question
 * is what the card leads with — it is the one costing time right now.
 *
 * The named one is the newest, matching the order every other signal surface
 * reads in. The count is what says there are more.
 *
 * The badge states the problem and does not offer to solve it. Answering
 * happens where the signal has a resolve verb: the chat, the inbox, or the
 * RefChip panel. Putting an inert answer box on a board card would promise a
 * resolution the board cannot deliver. */
function SignalBadge({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null
  const questions = signals.filter(s => s.kind === SignalKindQuestion)
  const leading = questions[0] ?? signals[0]
  const label = questions.length > 0
    ? (questions.length > 1 ? `❓ ${questions.length} open questions` : '❓ open question')
    : (signals.length > 1 ? `📣 ${signals.length} unread notifications` : '📣 unread notification')
  return (
    <div className={`bk-card-signal bk-card-signal-${leading.kind}`} title={leading.title}>
      <span className="bk-card-signal-label">{label}</span>
      <span className="bk-card-signal-title">{leading.title}</span>
    </div>
  )
}

function CardTile({
  card,
  signals,
  currentColumn,
  boardColumns,
  onMove,
  onOpen,
  onOpenChat,
  onStop,
  onPlay,
}: {
  card: CardView
  signals: Signal[]
  currentColumn: string
  boardColumns: { id: string; name: string }[]
  onMove: (cardID: string, columnID: string) => Promise<boolean>
  onOpen: () => void
  onOpenChat: OpenChatFn
  onStop: (cardID: string) => Promise<boolean>
  onPlay: (cardID: string) => Promise<boolean>
}) {
  const item = card.item
  if (!item) {
    return (
      <div className="bk-card bk-card-orphan" onClick={onOpen}>
        <em>missing noteboard item</em>
        <small>{card.placement.card_id}</small>
      </div>
    )
  }
  const tags: string[] = Array.isArray(item.tags) ? item.tags : []
  const status = item.status as string
  const session = sessionLink(card)
  // The gate is a property of the work, not of the column it sits in — so the
  // button renders on every card in every column, not just in a gate column.
  const held = !!item.held_at
  const ceiling = typeof item.auto_hold_at_usd === 'number' ? item.auto_hold_at_usd : null
  return (
    <div className={`bk-card${held ? ' bk-card-held' : ''}`} onClick={onOpen}>
      <div className="bk-card-title">{item.title}</div>
      {ceiling !== null && (
        <div
          className="bk-card-ceiling"
          title={`Auto-holds once this card's sessions have cost $${ceiling.toFixed(2)} in total. Each session is capped at whatever is left of that.`}
        >
          ⛽ auto-hold at ${ceiling.toFixed(2)}
        </div>
      )}
      {held && (
        <div className="bk-card-hold" title={item.hold_reason || 'No reason given'}>
          ⏸ held — no agent will pick this up
          {item.hold_reason ? `: ${item.hold_reason}` : ''}
        </div>
      )}
      <SignalBadge signals={signals} />
      {tags.length > 0 && (
        <div className="bk-card-tags">
          {tags.map(t => <span key={t} className="bk-tag">{t}</span>)}
        </div>
      )}
      <div className="bk-card-foot">
        <span className={`bk-status bk-status-${status}`}>{status}</span>
        <button
          type="button"
          className={held ? 'bk-card-play' : 'bk-card-stop'}
          title={held
            ? 'Play — clear the hold so agents may work this, and resume its session if it was paused'
            : 'Stop — park this work so no agent picks it up, and pause any session already running it'}
          onClick={e => {
            e.stopPropagation()
            held ? onPlay(card.placement.card_id) : onStop(card.placement.card_id)
          }}
        >{held ? '▶' : '⏸'}</button>
        {session && (
          <button
            type="button"
            className="bk-card-chat"
            title={`Open chat session ${session.ref}`}
            onClick={e => { e.stopPropagation(); onOpenChat(session) }}
          >chat ↗</button>
        )}
        <select
          value={currentColumn}
          onClick={e => e.stopPropagation()}
          onChange={e => onMove(card.placement.card_id, e.target.value)}
          title="Move to column"
        >
          {boardColumns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function CardDrawer({
  card,
  boardID: _boardID,
  entityTypes,
  onClose,
  onPatch,
  onDelete,
  onAddLink,
  onDeleteLink,
  onOpenChat,
}: {
  card: CardView
  boardID: string
  entityTypes: { type: string; service?: string; search?: string }[]
  onClose: () => void
  onPatch: (patch: Record<string, unknown>) => Promise<boolean>
  onDelete: (hard: boolean) => void | Promise<void>
  onAddLink: (entity_type: string, entity_ref: string, label?: string) => Promise<boolean>
  onDeleteLink: (linkID: string) => Promise<boolean>
  onOpenChat: OpenChatFn
}) {
  const item = card.item as NoteboardItem | null
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [tags, setTags] = useState((item?.tags ?? []).join(', '))
  const [status, setStatus] = useState(item?.status ?? 'open')
  const [dirty, setDirty] = useState(false)
  const [showAllEmails, setShowAllEmails] = useState(false)

  // Escape closes the drawer. Until the stacking fix above it was the only way
  // out that could not misfire, and it stays because a modal that traps you
  // until you find the backdrop is a modal people stop opening.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Re-seed when the underlying card changes (e.g. after a refresh)
  useEffect(() => {
    setTitle(item?.title ?? '')
    setBody(item?.body ?? '')
    setTags((item?.tags ?? []).join(', '))
    setStatus(item?.status ?? 'open')
    setDirty(false)
    setShowAllEmails(false)
  }, [item?.id, item?.updated_at])

  const links: CardLink[] = card.links ?? []
  const tagList = tags.split(',').map(s => s.trim()).filter(Boolean)
  // email_msgid and email_sender links are bookkeeping the classifier reads, not
  // something to show a human, so only the addressable email links are listed.
  const emailLinks = links.filter(l => l.entity_type === 'email')
  const otherLinks = links.filter(l => l.entity_type !== 'email')
  const shownEmailLinks = showAllEmails ? emailLinks : emailLinks.slice(0, EMAIL_LINKS_SHOWN)

  const save = async () => {
    const patch: Record<string, unknown> = {
      title,
      body,
      status,
      tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    }
    const ok = await onPatch(patch)
    if (ok) setDirty(false)
  }

  return (
    <div className="bk-drawer-backdrop" onClick={onClose}>
      <aside className="bk-drawer" onClick={e => e.stopPropagation()}>
        <header className="bk-drawer-head">
          <h3>Card</h3>
          <button onClick={onClose} className="bi-add-btn">×</button>
        </header>

        {!item ? (
          <div className="bridge-error">noteboard item is missing for placement {card.placement.card_id}</div>
        ) : (
          <>
            <label className="bk-drawer-label">Title</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true) }} />

            <label className="bk-drawer-label">Body (markdown)</label>
            <textarea rows={8} value={body} onChange={e => { setBody(e.target.value); setDirty(true) }} />

            <div className="bk-drawer-row">
              <div>
                <label className="bk-drawer-label">Status</label>
                <select value={status} onChange={e => { setStatus(e.target.value); setDirty(true) }}>
                  <option value="open">open</option>
                  <option value="done">done</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <div className="bk-drawer-grow">
                <label className="bk-drawer-label">Tags</label>
                <input value={tags} onChange={e => { setTags(e.target.value); setDirty(true) }} placeholder="comma-separated" />
              </div>
            </div>

            {/* Shown only for cards that already carry a classification, so
                boards that never had these tags see no extra controls. */}
            {tagList.some(t => CARD_AXES.some(a => t.startsWith(a.prefix))) && (
              <CardAxisEditor
                tags={tagList}
                onChange={next => { setTags(next.join(', ')); setDirty(true) }}
              />
            )}

            <div className="bk-form-actions">
              <button className="bi-save-btn" disabled={!dirty} onClick={save}>Save</button>
              <button onClick={() => onDelete(false)}>Archive</button>
              <button onClick={() => { if (confirm('Hard delete card from noteboard? Cannot be undone.')) onDelete(true) }}>Hard delete</button>
            </div>

            <hr />

            {/* Email links are split out and capped. A bucket card gathers every
                message from a sender, so "Medium Daily Digest" reaches hundreds
                of links within months — rendering them all would bury the
                handful of links that describe the card itself. */}
            {emailLinks.length > 0 && (
              <>
                <h4>Linked emails ({emailLinks.length})</h4>
                <ul className="bk-link-list">
                  {shownEmailLinks.map(l => {
                    const parsed = parseEmailLocator(l.entity_ref)
                    return (
                      <li key={l.id}>
                        <span className="bk-link-label">{l.label || '(no label)'}</span>
                        <span
                          className="bk-link-ref"
                          title={parsed
                            ? `account ${parsed.accountID}, message ${parsed.messageID}`
                            : l.entity_ref}
                        >
                          {parsed ? parsed.messageID : l.entity_ref}
                        </span>
                        <button className="bk-link-del" onClick={() => onDeleteLink(l.id)}>×</button>
                      </li>
                    )
                  })}
                  {emailLinks.length > shownEmailLinks.length && (
                    <li>
                      <button type="button" className="bi-add-btn" onClick={() => setShowAllEmails(true)}>
                        Show {emailLinks.length - shownEmailLinks.length} more
                      </button>
                    </li>
                  )}
                </ul>
              </>
            )}

            <h4>Entity links</h4>
            <ul className="bk-link-list">
              {otherLinks.map(l => {
                const isSessionLink = l.entity_type === 'session' && !!l.entity_ref
                return (
                  <li key={l.id}>
                    <span className="bk-link-type">{l.entity_type}</span>
                    {isSessionLink ? (
                      <button
                        type="button"
                        className="bk-link-ref bk-link-ref-action"
                        title={`Open chat session ${l.entity_ref}`}
                        onClick={() => onOpenChat({ ref: l.entity_ref })}
                      >{l.entity_ref} ↗</button>
                    ) : (
                      <span className="bk-link-ref">{l.entity_ref}</span>
                    )}
                    {l.label && <span className="bk-link-label">{l.label}</span>}
                    <button className="bk-link-del" onClick={() => onDeleteLink(l.id)}>×</button>
                  </li>
                )
              })}
              {otherLinks.length === 0 && <li className="bi-empty">No links yet.</li>}
            </ul>
            <AddLinkForm entityTypes={entityTypes} onAdd={onAddLink} />
          </>
        )}
      </aside>
    </div>
  )
}

function AddLinkForm({
  entityTypes,
  onAdd,
}: {
  entityTypes: { type: string }[]
  onAdd: (entity_type: string, entity_ref: string, label?: string) => Promise<boolean>
}) {
  const [type, setType] = useState(entityTypes[0]?.type ?? 'session')
  const [ref, setRef] = useState('')
  const [label, setLabel] = useState('')
  return (
    <form
      className="bk-new-form bk-link-form"
      onSubmit={async e => {
        e.preventDefault()
        if (!type || !ref.trim()) return
        const ok = await onAdd(type, ref.trim(), label.trim() || undefined)
        if (ok) { setRef(''); setLabel('') }
      }}
    >
      <select value={type} onChange={e => setType(e.target.value)}>
        {entityTypes.map(t => <option key={t.type} value={t.type}>{t.type}</option>)}
      </select>
      <input placeholder="entity ref (id/url/path)" value={ref} onChange={e => setRef(e.target.value)} />
      <input placeholder="label (optional)" value={label} onChange={e => setLabel(e.target.value)} />
      <button type="submit" className="bi-save-btn">+ Link</button>
    </form>
  )
}
