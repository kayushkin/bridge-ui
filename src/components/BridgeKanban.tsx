import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import type { FetchFn } from '../types'
import { cleanEmailBodyForPreview } from '../emailText'
import { useKanban } from '../useKanban'
import type { CardLink, CardView, ColumnView, MailMessage, NoteboardItem, Placement } from '../types-kanban'
import { formatAgeCompact } from '../utils'
import { readAgentPrompt, stripAgentPrompt, writeAgentPrompt, suggestAgentPrompt } from '../agentPrompt'
import { dispatchAgentOnCard } from '../agentDispatch'
import type { Signal } from '../types'
import { SignalKindQuestion } from '../types'
import { useOpenSignalsByTodo } from './chat/signalData'
import {
  CARD_AXES, allCardsOf, axisUsage, filterIsActive, matchesFilter,
  parseEmailLocator, sortCards, withAxisValue,
  type AxisFilter, type SortKey,
} from '../kanbanAxes'

// A card's link to the agent session working it. Post session-consolidation
// (2026-05-09) every card_link with entity_type='session' carries the
// canonical llm-bridge-server session_id, which is a direct deeplink target.
type SessionLinkRef = {
  ref: string
  // When the card was handed to this agent. Read straight off the link row, so
  // it costs nothing — the board view already carries every link.
  dispatchedAt: string
}
type OpenChatFn = (link: SessionLinkRef) => void

// latestSessionLink returns the most recently attached session, which is the one
// that describes what is happening to the card now.
//
// Cards carry a single session link today, so newest and first are the same row
// and the old "return the first match" behaviour was never visibly wrong. It was
// only ever right by accident: nothing stops a second dispatch adding a second
// link, and on the day that happens, first-match silently reports the oldest
// agent as the current one.
function latestSessionLink(card: CardView): SessionLinkRef | null {
  let newest: { ref: string; dispatchedAt: string; at: number } | null = null
  for (const l of card.links ?? []) {
    if (l.entity_type !== 'session' || !l.entity_ref) continue
    // An unparseable timestamp sorts oldest rather than winning by accident.
    const at = new Date(l.created_at).getTime()
    const rank = Number.isFinite(at) ? at : -Infinity
    if (!newest || rank > newest.at) {
      newest = { ref: l.entity_ref, dispatchedAt: l.created_at, at: rank }
    }
  }
  return newest ? { ref: newest.ref, dispatchedAt: newest.dispatchedAt } : null
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
  // ⚠️ The open card lives in the URL and NOWHERE else — there is deliberately no
  // `useState` mirroring it.
  //
  // A card is shareable ("look at this one"), so `?card=<id>` had to exist. The
  // obvious shape is local state plus two effects syncing it to the query string,
  // and that is the shape that loops: each effect observes the other's write and
  // writes back. `sessionDeeplink.ts` carries a small state machine precisely to
  // survive that, because the chat's `activeId` is genuine state owned by a store.
  // The drawer's is not — nothing but this component ever decides which card is
  // open — so making the query string the only copy removes the synchronisation
  // problem rather than managing it.
  //
  // The id IS a noteboard item id (see the signals comment below), so the link is
  // also a stable reference to the todo the card is made of.
  const [searchParams, setSearchParams] = useSearchParams()
  const drawerCardID = searchParams.get('card')
  const setDrawerCardID = useCallback(
    (cardID: string | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (cardID) next.set('card', cardID)
          else next.delete('card')
          return next
        },
        // Replace rather than push: opening and closing a drawer half a dozen
        // times while reading a board would otherwise bury the page the user
        // arrived from under a stack of its own states.
        { replace: true },
      )
    },
    [setSearchParams],
  )
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
  // Priority-then-due-date is the default because the stored order is arbitrary:
  // every writer on this host creates cards at position 0, so "board order" is
  // really "reverse order of creation" and says nothing about what to do first.
  const [sortKey, setSortKey] = useState<SortKey>('priority')

  const {
    routes, mailBasePath, mailPagePath, basePath: bridgeBasePath, fetch: fetchFn,
    // Read directly as well as through useKanban: resolving a deeplinked card's
    // board is a one-off request that hook has no verb for.
    kanbanStoreBasePath,
  } = useBridgeConfig()
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

  // Deep link into the host's mail page. The account is carried alongside the
  // message id because mailstack requires it on every read — a message id alone
  // is not addressable there.
  const openEmailInMail = (accountID: string, messageID: string) => {
    if (!mailPagePath) return
    navigate(`${mailPagePath}?account=${encodeURIComponent(accountID)}&message=${encodeURIComponent(messageID)}`)
  }

  const drawerCard: CardView | null = useMemo(() => {
    if (!drawerCardID || !k.view) return null
    for (const col of k.view.columns) {
      for (const c of col.cards ?? []) {
        if (c.placement.card_id === drawerCardID) return c
      }
    }
    return null
  }, [drawerCardID, k.view])

  // A deeplinked card is usually on some OTHER board than the one that opened.
  //
  // `drawerCard` above searches the loaded board's view, so without this a
  // `?card=` link silently opened nothing whenever the recipient's last-opened
  // board was not the card's — which is the common case, and indistinguishable
  // from a dead link. kanban-store answers "which boards is this card on?"
  // directly, so the fix is one request rather than loading every board.
  //
  // Guarded by a ref keyed on the card id, not a boolean: the effect re-runs when
  // the view arrives, and an unguarded version would re-request on every render
  // for a card that genuinely is on no board. One attempt per id, and a card that
  // resolves to nothing leaves the board selection alone rather than clearing it.
  const boardResolveAttempted = useRef<string | null>(null)
  useEffect(() => {
    if (!drawerCardID || drawerCard || !kanbanStoreBasePath) return
    // Wait for the view: mid-load it is null and the card may well be in it.
    if (!k.view) return
    if (boardResolveAttempted.current === drawerCardID) return
    boardResolveAttempted.current = drawerCardID

    let cancelled = false
    void (async () => {
      try {
        const res = await fetchFn(
          `${kanbanStoreBasePath}/api/cards/${encodeURIComponent(drawerCardID)}/placements`,
        )
        if (!res.ok || cancelled) return
        // ⚠️ kanban-store answers a card id it does not know with 200 and a JSON
        // `null` body, NOT a 404 — measured against the live service. So `res.ok`
        // is not evidence that a card exists, and annotating this `Placement[]`
        // was a claim the wire does not honour.
        //
        // Without the check below, `.find` throws on that null and the catch
        // underneath swallows it. The user-visible behaviour is identical, which
        // is exactly why it is worth fixing: the ordinary "this link is dead"
        // path would be reached by raising and discarding an exception, and the
        // next person to widen that catch would silently change what a dead link
        // does. (Contrast `panePersistence.ts`, where an `Array.isArray` guard
        // was DELETED for being unable to change any answer. This one decides
        // whether the normal path throws.)
        const placements: unknown = await res.json()
        if (!Array.isArray(placements) || cancelled) return
        const target = (placements as Placement[]).find(
          p => p.board_id && p.board_id !== selectedBoardID,
        )
        if (target?.board_id && !cancelled) setSelectedBoardID(target.board_id)
      } catch {
        // A link to a card that no longer exists is a dead link, not an error
        // state for the whole board — the drawer simply stays shut.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [drawerCardID, drawerCard, k.view, kanbanStoreBasePath, fetchFn, selectedBoardID])

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
                    if (card && latestSessionLink(card)) {
                      if (!confirm('This card has a running session. Stop will pause the agent mid-turn (resumable) and park the work. Continue?')) return false
                    }
                    return k.stopCard(cardID)
                  }}
                  onPlayCard={(cardID) => k.playCard(cardID)}
                  onRunAgent={async (card) => {
                    const item = card.item
                    const title = (item?.title as string) ?? card.placement.card_id
                    // The tile sends exactly what the drawer would: the saved
                    // prompt, or the same suggestion the drawer would show. A
                    // shortcut that dispatched something different from what
                    // the card displays would be a trap.
                    const stored = readAgentPrompt(item?.body as string | undefined)
                    const prompt = stored ?? suggestAgentPrompt({
                      cardID: card.placement.card_id,
                      title,
                      body: stripAgentPrompt(item?.body as string | undefined),
                      linkedEmailCount: (card.links ?? []).filter(l => l.entity_type === 'email').length,
                    })

                    // An autonomous session auto-allows tool calls and spends
                    // money, and this button sits on a tile next to two others.
                    // One misclick should not silently start an agent, so the
                    // confirmation names the card, says whether the prompt was
                    // written or merely suggested, and warns about a second
                    // agent when one is already attached.
                    const existing = latestSessionLink(card)
                    const lines = [
                      `Start an agent on "${title}"?`,
                      '',
                      stored ? 'Using the prompt saved on this card.' : 'Using the suggested prompt (nothing saved on this card).',
                    ]
                    if (existing) lines.push('', 'This card already has a session. This adds a second one.')
                    lines.push('', '--- prompt ---', prompt.length > 600 ? prompt.slice(0, 600) + '…' : prompt)
                    if (!window.confirm(lines.join('\n'))) return false

                    try {
                      const sessionID = await dispatchAgentOnCard({
                        basePath: bridgeBasePath,
                        fetchFn: fetchFn,
                        title,
                        prompt,
                        addLink: (et, er, label) => k.addCardLink(card.placement.card_id, et, er, label),
                      })
                      navigate(`${routes.chat}?session=${encodeURIComponent(sessionID)}`)
                      return true
                    } catch (e) {
                      // No toast surface on this page, and a dispatch that
                      // failed must not look like one that worked.
                      window.alert(`Could not start an agent: ${e instanceof Error ? e.message : String(e)}`)
                      return false
                    }
                  }}
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
          onOpenInMail={openEmailInMail}
          mailBasePath={mailBasePath}
          fetchFn={fetchFn}
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
          <option value="priority">Priority, then due date</option>
          <option value="urgency">Urgency</option>
          <option value="newest">Recently updated</option>
          <option value="title">Title</option>
          <option value="stored">Board order</option>
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
  onRunAgent,
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
  onRunAgent: (card: CardView) => Promise<boolean>
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
              onRunAgent={onRunAgent}
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

// LinkedActivity is the last thing that actually happened to a card: mail
// arriving on it, or an agent being handed it.
type LinkedActivity = { at: string; kind: 'email' | 'session' }

// latestLinkedActivity finds the most recent of those, from links the board
// view already carries.
//
// Only 'email' and 'session' count. 'email_msgid' is the same arrival recorded
// under its RFC identity and would double-count it, and 'email_sender' is a
// learned affinity between a sender and a card rather than an event.
function latestLinkedActivity(card: CardView): LinkedActivity | null {
  let newest: (LinkedActivity & { rank: number }) | null = null
  for (const l of card.links ?? []) {
    if (l.entity_type !== 'email' && l.entity_type !== 'session') continue
    const rank = new Date(l.created_at).getTime()
    if (!Number.isFinite(rank)) continue
    if (!newest || rank > newest.rank) {
      newest = { at: l.created_at, kind: l.entity_type as 'email' | 'session', rank }
    }
  }
  return newest ? { at: newest.at, kind: newest.kind } : null
}

// CardAgeBadge answers "when did anything last happen here?".
//
// It reports time since the last linked email or dispatch, not time since the
// card was created. Creation age says how long ago a bucket was opened, which
// stops being interesting immediately — a card opened in May that took mail an
// hour ago is live, and one opened yesterday that has been silent since is not.
// Creation time stays in the tooltip, where it is context rather than the
// headline.
//
// It deliberately does NOT show time since the agent last did something inside
// its session. That lives on the session, not the link, and reading it means
// asking llm-bridge-server per session. The Agent runs board holds 6,466 cards
// across 5,628 distinct sessions, so on a 15-second poll that is thousands of
// requests a minute to render a caption. The drawer shows it for one card.
function CardAgeBadge({
  card,
  placement,
}: {
  card: CardView
  placement: Placement
}) {
  const activity = latestLinkedActivity(card)
  // With no links at all there is no activity to report, so the card falls back
  // to saying how long it has been sitting there — which is the honest answer.
  const shown = activity
    ? formatAgeCompact(activity.at)
    : formatAgeCompact(placement.created_at)
  if (!shown) return null

  const title = [
    activity
      ? `Last ${activity.kind === 'email' ? 'email attached' : 'handed to an agent'}: ${new Date(activity.at).toLocaleString()}`
      : 'Nothing has happened on this card yet',
    `On this board since ${new Date(placement.created_at).toLocaleString()}`,
  ].join('\n')

  return (
    <span className="bk-card-age" title={title}>
      {activity ? (activity.kind === 'email' ? '✉' : '▶') : '🕒'} {shown}
    </span>
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
  onRunAgent,
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
  onRunAgent: (card: CardView) => Promise<boolean>
}) {
  // Guards the button between click and session id, so an impatient second
  // click cannot start a second agent on the same card.
  const [running, setRunning] = useState(false)
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
  const session = latestSessionLink(card)
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
        <CardAgeBadge card={card} placement={card.placement} />
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
        {/* Not ▶ — that glyph is already the unhold button two positions left,
            and two play triangles meaning different things on one row is how a
            misclick starts a paid agent. */}
        <button
          type="button"
          className="bk-card-run"
          disabled={held || running}
          title={held
            ? 'Held — clear the hold before starting an agent'
            : session
              ? 'Start another agent on this card. It already has one.'
              : 'Start an agent on this card, using its prompt'}
          onClick={async e => {
            e.stopPropagation()
            setRunning(true)
            try { await onRunAgent(card) } finally { setRunning(false) }
          }}
        >{running ? '…' : '🤖'}</button>
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

// CardTiming is the drawer's answer to "how long has this been going?".
//
// Unlike the badge on the tile, this one may ask llm-bridge-server for the
// session's real last activity, because the drawer shows one card at a time.
// The same question asked from the board would be thousands of requests per
// poll; asked here it is one, on open.
function CardTiming({
  card,
  fetchFn,
}: {
  card: CardView
  fetchFn: FetchFn
}) {
  const placement = card.placement
  const session = latestSessionLink(card)
  const { basePath } = useBridgeConfig()
  const [lastActivity, setLastActivity] = useState<string | null>(null)
  const [state, setState] = useState<string | null>(null)
  // Distinguishes "we have not asked yet" from "we asked and the bridge could
  // not say". Without it a failed lookup renders identically to a pending one
  // and the row just never fills in.
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setUnavailable(false)
    setLastActivity(null)
    setState(null)

    fetchFn(`${basePath}/sessions/${encodeURIComponent(session.ref)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(s => {
        if (cancelled) return
        setLastActivity(typeof s?.updated_at === 'string' ? s.updated_at : null)
        setState(typeof s?.state === 'string' ? s.state : null)
      })
      .catch(() => { if (!cancelled) setUnavailable(true) })

    return () => { cancelled = true }
  }, [session?.ref, basePath, fetchFn])

  const boardAge = formatAgeCompact(placement.created_at)
  const dispatchAge = session ? formatAgeCompact(session.dispatchedAt) : null
  const activityAge = lastActivity ? formatAgeCompact(lastActivity) : null

  const activity = latestLinkedActivity(card)
  const activityAgeFromLink = activity ? formatAgeCompact(activity.at) : null

  return (
    <dl className="bk-drawer-timing">
      <div>
        <dt>{activity?.kind === 'email' ? 'Last email' : activity ? 'Last dispatch' : 'Last activity'}</dt>
        <dd title={activity ? new Date(activity.at).toLocaleString() : undefined}>
          {activityAgeFromLink ?? 'never'}
        </dd>
      </div>
      <div>
        <dt>On this board</dt>
        <dd title={new Date(placement.created_at).toLocaleString()}>{boardAge ?? '—'}</dd>
      </div>
      {session && (
        <>
          <div>
            <dt>Given to an agent</dt>
            <dd title={new Date(session.dispatchedAt).toLocaleString()}>{dispatchAge ?? '—'}</dd>
          </div>
          <div>
            <dt>Last agent activity</dt>
            <dd title={lastActivity ? new Date(lastActivity).toLocaleString() : undefined}>
              {activityAge
                ? `${activityAge}${state ? ` · ${state}` : ''}`
                : unavailable
                  ? 'bridge did not answer'
                  : '…'}
            </dd>
          </div>
        </>
      )}
    </dl>
  )
}

// AgentPromptPanel is the card's "hand this to an agent" control: the prompt it
// will be given, editable in place, and the button that starts it.
//
// The prompt shown when a card carries none is a suggestion, not a saved value —
// it renders in the box but is not written to the card until the drawer is
// saved. Writing it on open would put an agent prompt on every card anyone
// merely looked at.
function AgentPromptPanel({
  cardID,
  title,
  body,
  linkedEmailCount,
  prompt,
  onPromptChange,
  existingSession,
  onAddLink,
  onOpenChat,
  fetchFn,
}: {
  cardID: string
  title: string
  body: string
  linkedEmailCount: number
  prompt: string
  onPromptChange: (next: string) => void
  existingSession: SessionLinkRef | null
  onAddLink: (entity_type: string, entity_ref: string, label?: string) => Promise<boolean>
  onOpenChat: OpenChatFn
  fetchFn: FetchFn
}) {
  const { basePath } = useBridgeConfig()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestion = useMemo(
    () => suggestAgentPrompt({ cardID, title, body, linkedEmailCount }),
    [cardID, title, body, linkedEmailCount],
  )
  // What the box shows, and — importantly — what a dispatch would actually send.
  // These must be the same string, or the agent gets something the human never
  // read.
  const effective = prompt.trim() ? prompt : suggestion
  const usingSuggestion = !prompt.trim()

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const sessionID = await dispatchAgentOnCard({
        basePath, fetchFn, title, prompt: effective, addLink: onAddLink,
      })
      onOpenChat({ ref: sessionID, dispatchedAt: new Date().toISOString() })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="bk-agent-prompt">
      <div className="bk-agent-prompt-head">
        <label className="bk-drawer-label">Agent prompt</label>
        {usingSuggestion && <span className="bk-agent-prompt-note">suggested — edit and save to keep</span>}
      </div>
      <textarea
        className="bk-agent-prompt-text"
        rows={10}
        value={effective}
        onChange={e => onPromptChange(e.target.value)}
      />
      <div className="bk-agent-prompt-actions">
        <button
          type="button"
          className="bi-add-btn"
          disabled={starting || !effective.trim()}
          onClick={start}
        >{starting ? 'Starting…' : '▶ Start an agent on this'}</button>
        {prompt.trim() && (
          <button
            type="button"
            className="bk-agent-prompt-reset"
            disabled={starting}
            onClick={() => onPromptChange('')}
            title="Drop the saved prompt and go back to the suggested one. Takes effect on save."
          >reset to suggested</button>
        )}
        {existingSession && (
          <button
            type="button"
            className="bk-agent-prompt-reset"
            onClick={() => onOpenChat(existingSession)}
            title={`This card already has session ${existingSession.ref}. Starting another adds a second one.`}
          >open current session ↗</button>
        )}
      </div>
      {existingSession && (
        <p className="bk-agent-prompt-warn">
          An agent already has this card. Starting another gives it a second session.
        </p>
      )}
      {error && <div className="bridge-error">{error}</div>}
    </section>
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
  onOpenInMail,
  mailBasePath,
  fetchFn,
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
  onOpenInMail: (accountID: string, messageID: string) => void
  mailBasePath: string
  fetchFn: FetchFn
}) {
  const item = card.item as NoteboardItem | null
  const [title, setTitle] = useState(item?.title ?? '')
  // The prompt block is split out of the body here and recombined on save, so
  // the body box shows what the card says and the prompt box shows what the
  // agent is told. Left merged, every card body would open with a wall of
  // instructions aimed at an agent rather than at the reader.
  const [body, setBody] = useState(stripAgentPrompt(item?.body))
  const [agentPrompt, setAgentPrompt] = useState(readAgentPrompt(item?.body) ?? '')
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
    setBody(stripAgentPrompt(item?.body))
    setAgentPrompt(readAgentPrompt(item?.body) ?? '')
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
      body: writeAgentPrompt(body, agentPrompt),
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

        <CardTiming card={card} fetchFn={fetchFn} />

        {item && (
          <AgentPromptPanel
            cardID={card.placement.card_id}
            title={title}
            body={body}
            linkedEmailCount={emailLinks.length}
            prompt={agentPrompt}
            onPromptChange={next => { setAgentPrompt(next); setDirty(true) }}
            existingSession={latestSessionLink(card)}
            onAddLink={onAddLink}
            onOpenChat={onOpenChat}
            fetchFn={fetchFn}
          />
        )}

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
                  {shownEmailLinks.map(l => (
                    <LinkedEmailRow
                      key={l.id}
                      link={l}
                      mailBasePath={mailBasePath}
                      fetchFn={fetchFn}
                      onOpenInMail={onOpenInMail}
                      onDeleteLink={onDeleteLink}
                    />
                  ))}
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
                        onClick={() => onOpenChat({ ref: l.entity_ref, dispatchedAt: l.created_at })}
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

/**
 * One linked email: its label, a deep link into the Mail page, and an expandable
 * preview of the message itself.
 *
 * The preview renders `body_text` as PLAIN TEXT, never `body_html`. Mail bodies
 * are attacker-controlled — anyone who can email this user can put markup in
 * them — and dash's Mail page only renders them safely because it uses a
 * sandboxed iframe with remote images stripped. Rebuilding that here would mean
 * maintaining a second sandbox; the deep link hands the job to the one that
 * already exists.
 *
 * The fetch is deliberate, not eager: mailstack caches nothing, so reading one
 * message is a live provider round trip. A bucket card can carry hundreds of
 * links, and expanding them all on open would be hundreds of Gmail calls.
 */
function LinkedEmailRow({
  link,
  mailBasePath,
  fetchFn,
  onOpenInMail,
  onDeleteLink,
}: {
  link: CardLink
  mailBasePath: string
  fetchFn: FetchFn
  onOpenInMail: (accountID: string, messageID: string) => void
  onDeleteLink: (linkID: string) => Promise<boolean>
}) {
  const parsed = parseEmailLocator(link.entity_ref)
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState<MailMessage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (message || loading || !parsed || !mailBasePath) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFn(
        `${mailBasePath}/messages/${encodeURIComponent(parsed.messageID)}?account=${encodeURIComponent(parsed.accountID)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(String(data.error))
      setMessage(data as MailMessage)
    } catch (e) {
      // Reported in place rather than swallowed: a message can genuinely be
      // gone (deleted upstream), and a silently empty preview reads as "this
      // email had no content", which is a different and wrong claim.
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const canOpen = !!parsed && !!mailBasePath
  return (
    <li className="bk-email-row">
      <div className="bk-email-head">
        <button type="button" className="bk-email-toggle" onClick={toggle} disabled={!canOpen}
          title={canOpen ? 'Show this email' : 'Mail service is not configured for this host'}>
          {expanded ? '▾' : '▸'}
        </button>
        <span className="bk-link-label">{link.label || '(no label)'}</span>
        {canOpen && (
          <button
            type="button"
            className="bk-link-ref bk-link-ref-action"
            title={`Open in Mail — account ${parsed!.accountID}`}
            onClick={() => onOpenInMail(parsed!.accountID, parsed!.messageID)}
          >open ↗</button>
        )}
        <button className="bk-link-del" onClick={() => onDeleteLink(link.id)} title="Unlink this email">×</button>
      </div>
      {expanded && (
        <div className="bk-email-body">
          {loading && <span className="bi-empty">Loading…</span>}
          {error && <span className="bridge-error">{error}</span>}
          {message && (
            <>
              <div className="bk-email-meta">
                <strong>{message.meta?.subject || '(no subject)'}</strong>
                <span>{message.meta?.from?.name || message.meta?.from?.email}</span>
                <span>{message.meta?.date ? new Date(message.meta.date).toLocaleString() : ''}</span>
              </div>
              {/* Plain text only — see the note on this component. */}
              <pre className="bk-email-text">
                {cleanEmailBodyForPreview(message.body_text)
                  || message.meta?.snippet
                  || '(this message has only an HTML body — use “open ↗” to read it in Mail)'}
              </pre>
            </>
          )}
        </div>
      )}
    </li>
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
