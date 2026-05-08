import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useKanban } from '../useKanban'
import type { CardLink, CardView, ColumnView, NoteboardItem } from '../types-kanban'

// Pulls the first session link off a card if one exists. Cards from the
// classifier carry entity_type='session' with the bridge_id as ref, so this
// is enough to deeplink into BridgeChat (?session=<bridge_id>). Autoworker-
// created cards use entity_type='bus_session' and need a separate lookup —
// not supported yet.
function sessionLinkBridgeId(card: CardView): string | null {
  for (const l of card.links ?? []) {
    if (l.entity_type === 'session' && l.entity_ref) return l.entity_ref
  }
  return null
}

const LAYOUT_KEY = 'bk:layout'
const LAST_BOARD_KEY = 'bk:lastBoardId'
const COLLAPSED_COLUMNS_KEY = 'bk:collapsedColumns'
const DEFAULT_BOARD_NAME = 'Agent runs'

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

  const { routes } = useBridgeConfig()
  const navigate = useNavigate()
  const openSessionInChat = (bridgeID: string) => {
    navigate(`${routes.chat}?session=${encodeURIComponent(bridgeID)}`)
  }

  const k = useKanban(selectedBoardID)

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

            <div className={`bk-columns bk-columns-${layout}`}>
              {k.view.columns.map(cv => (
                <ColumnPane
                  key={cv.column.id}
                  cv={cv}
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
                  onOpenChat={openSessionInChat}
                  onDeleteColumn={async () => {
                    if ((cv.cards?.length ?? 0) > 0) {
                      if (!confirm(`Column "${cv.column.name}" has ${cv.cards!.length} cards. Delete column AND detach those cards?`)) return
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
          onOpenChat={openSessionInChat}
        />
      )}
    </div>
  )
}

// ============================ Sub-components ============================

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
  onDeleteColumn,
}: {
  cv: ColumnView
  boardColumns: { id: string; name: string }[]
  collapsed: boolean
  onToggleCollapse: () => void
  onCompose: () => void
  composeOpen: boolean
  onCancelCompose: () => void
  onCreateCard: (args: { title: string; body?: string; tags?: string[] }) => void | Promise<void>
  onMoveCard: (cardID: string, columnID: string) => Promise<boolean>
  onOpenCard: (cardID: string) => void
  onOpenChat: (bridgeID: string) => void
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
              currentColumn={cv.column.id}
              boardColumns={boardColumns}
              onMove={onMoveCard}
              onOpen={() => onOpenCard(c.placement.card_id)}
              onOpenChat={onOpenChat}
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

function NewCardForm({
  onCreate,
  onCancel,
}: {
  onCreate: (args: { title: string; body?: string; tags?: string[] }) => void | Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  return (
    <form
      className="bk-new-form bk-new-card"
      onSubmit={e => {
        e.preventDefault()
        if (!title.trim()) return
        onCreate({
          title: title.trim(),
          body: body.trim() || undefined,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        })
      }}
    >
      <input autoFocus placeholder="Card title" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea placeholder="Body (markdown, optional)" rows={3} value={body} onChange={e => setBody(e.target.value)} />
      <input placeholder="tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />
      <div className="bk-form-actions">
        <button type="submit" className="bi-save-btn">Add card</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function CardTile({
  card,
  currentColumn,
  boardColumns,
  onMove,
  onOpen,
  onOpenChat,
}: {
  card: CardView
  currentColumn: string
  boardColumns: { id: string; name: string }[]
  onMove: (cardID: string, columnID: string) => Promise<boolean>
  onOpen: () => void
  onOpenChat: (bridgeID: string) => void
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
  const sessionID = sessionLinkBridgeId(card)
  return (
    <div className="bk-card" onClick={onOpen}>
      <div className="bk-card-title">{item.title}</div>
      {tags.length > 0 && (
        <div className="bk-card-tags">
          {tags.map(t => <span key={t} className="bk-tag">{t}</span>)}
        </div>
      )}
      <div className="bk-card-foot">
        <span className={`bk-status bk-status-${status}`}>{status}</span>
        {sessionID && (
          <button
            type="button"
            className="bk-card-chat"
            title={`Open chat session ${sessionID}`}
            onClick={e => { e.stopPropagation(); onOpenChat(sessionID) }}
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
  onOpenChat: (bridgeID: string) => void
}) {
  const item = card.item as NoteboardItem | null
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [tags, setTags] = useState((item?.tags ?? []).join(', '))
  const [status, setStatus] = useState(item?.status ?? 'open')
  const [dirty, setDirty] = useState(false)

  // Re-seed when the underlying card changes (e.g. after a refresh)
  useEffect(() => {
    setTitle(item?.title ?? '')
    setBody(item?.body ?? '')
    setTags((item?.tags ?? []).join(', '))
    setStatus(item?.status ?? 'open')
    setDirty(false)
  }, [item?.id, item?.updated_at])

  const links: CardLink[] = card.links ?? []

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

            <div className="bk-form-actions">
              <button className="bi-save-btn" disabled={!dirty} onClick={save}>Save</button>
              <button onClick={() => onDelete(false)}>Archive</button>
              <button onClick={() => { if (confirm('Hard delete card from noteboard? Cannot be undone.')) onDelete(true) }}>Hard delete</button>
            </div>

            <hr />

            <h4>Entity links</h4>
            <ul className="bk-link-list">
              {links.map(l => (
                <li key={l.id}>
                  <span className="bk-link-type">{l.entity_type}</span>
                  {l.entity_type === 'session' && l.entity_ref ? (
                    <button
                      type="button"
                      className="bk-link-ref bk-link-ref-action"
                      title={`Open chat session ${l.entity_ref}`}
                      onClick={() => onOpenChat(l.entity_ref)}
                    >{l.entity_ref} ↗</button>
                  ) : (
                    <span className="bk-link-ref">{l.entity_ref}</span>
                  )}
                  {l.label && <span className="bk-link-label">{l.label}</span>}
                  <button className="bk-link-del" onClick={() => onDeleteLink(l.id)}>×</button>
                </li>
              ))}
              {links.length === 0 && <li className="bi-empty">No links yet.</li>}
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
