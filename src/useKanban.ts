import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import type {
  Board,
  BoardView,
  CardLink,
  EntityCardView,
  EntityTypeInfo,
  EntityTag,
} from './types-kanban'

// kanbanPollWouldFetch reports whether the 15-second refresh has anything to
// ask for. It mirrors the guards at the top of fetchBoards and fetchView, which
// are what decide whether a poll issues an HTTP request or returns immediately.
// Exported so the render checks can pin it against those guards.
export function kanbanPollWouldFetch(enabled: boolean, loadBoards: boolean, boardID: string | null): boolean {
  if (!enabled) return false
  return loadBoards || Boolean(boardID)
}

export interface CreateBoardArgs { name: string; description?: string }
export interface UseKanbanOptions {
  loadBoards?: boolean
  loadEntityTypes?: boolean
}
export interface CreateColumnArgs {
  name: string
  position?: number
  color?: string
  wip_limit?: number
  auto_status?: string
}
export interface CreateCardArgs {
  title: string
  body?: string
  tags?: string[]
  priority?: number
  list_id?: string
  column_id: string
  position?: number
  /** Create the card already parked, so no autoworker tick can pick the work up
   * in the gap between the card appearing and a human seeing it. */
  hold?: boolean
  hold_reason?: string
  /** Spend ceiling: auto-hold this card once its agent sessions have cost this
   * much in total. Undefined = no ceiling. Zero is a REAL ceiling ("stop before
   * spending a cent"), so callers must not coerce an empty input to 0. */
  auto_hold_at_usd?: number
}

/**
 * useKanban — list/create boards and (when a board id is given) load its
 * full BoardView with cards joined to noteboard items. Polls every 15s.
 * All mutate actions auto-refresh the affected scope.
 */
export function useKanban(boardID: string | null, options: UseKanbanOptions = {}) {
  // basePath is llm-bridge-server: the stop button has to reach past kanban-store
  // to interrupt the session that is actually running the card's work.
  const { fetch: fetchFn, kanbanStoreBasePath, basePath } = useBridgeConfig()
  const enabled = !!kanbanStoreBasePath
  const { loadBoards = true, loadEntityTypes = true } = options

  const [boards, setBoards] = useState<Board[]>([])
  const [view, setView] = useState<BoardView | null>(null)
  const [entityTypes, setEntityTypes] = useState<EntityTypeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastViewJSON = useRef('')

  const fetchBoards = useCallback(async () => {
    if (!enabled || !loadBoards) { setLoading(false); return }
    try {
      const res = await fetchFn(`${kanbanStoreBasePath}/api/boards`)
      if (!res.ok) throw new Error(`/api/boards HTTP ${res.status}`)
      const data: Board[] = (await res.json()) ?? []
      setBoards(data)
      setError(null)
    } catch (err) {
      setError(`${err}`)
    }
  }, [fetchFn, kanbanStoreBasePath, enabled, loadBoards])

  const fetchView = useCallback(async () => {
    if (!enabled || !boardID) { setView(null); return }
    try {
      const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/cards`)
      if (!res.ok) throw new Error(`/api/boards/:id/cards HTTP ${res.status}`)
      const data: BoardView = await res.json()
      const json = JSON.stringify(data)
      if (json !== lastViewJSON.current) {
        lastViewJSON.current = json
        setView(data)
      }
      setError(null)
    } catch (err) {
      setError(`${err}`)
    }
  }, [fetchFn, kanbanStoreBasePath, enabled, boardID])

  const fetchEntityTypes = useCallback(async () => {
    if (!enabled || !loadEntityTypes) return
    try {
      const res = await fetchFn(`${kanbanStoreBasePath}/api/entity-types`)
      if (!res.ok) return
      setEntityTypes((await res.json()) ?? [])
    } catch {/* non-fatal */}
  }, [fetchFn, kanbanStoreBasePath, enabled, loadEntityTypes])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      await Promise.all([fetchBoards(), fetchView(), fetchEntityTypes()])
      if (!cancelled) setLoading(false)
    }
    run()
    // Only run the timer when one of the two calls it makes can actually fetch.
    // The chat pane's LinkedKanbanPanel constructs this hook with loadBoards
    // false and no board id, and both callbacks then return at their first line
    // — so the interval fired every 15 seconds, per open chat pane, and issued no
    // request at all. (The cards that panel does show are refreshed on mount
    // only; that they never refresh is a separate defect, not this timer's job.)
    if (!kanbanPollWouldFetch(enabled, loadBoards, boardID)) {
      return () => { cancelled = true }
    }
    const t = setInterval(() => { fetchBoards(); fetchView() }, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [fetchBoards, fetchView, fetchEntityTypes, enabled, loadBoards, boardID])

  const createBoard = useCallback(async (args: CreateBoardArgs): Promise<Board | null> => {
    if (!enabled) return null
    const res = await fetchFn(`${kanbanStoreBasePath}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) { setError(`createBoard HTTP ${res.status}`); return null }
    const b: Board = await res.json()
    await fetchBoards()
    return b
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchBoards])

  const deleteBoard = useCallback(async (id: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) { setError(`deleteBoard HTTP ${res.status}`); return false }
    await fetchBoards()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchBoards])

  const createColumn = useCallback(async (args: CreateColumnArgs): Promise<boolean> => {
    if (!enabled || !boardID) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) { setError(`createColumn HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, boardID, fetchView])

  const deleteColumn = useCallback(async (columnID: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/columns/${encodeURIComponent(columnID)}`, { method: 'DELETE' })
    if (!res.ok) { setError(`deleteColumn HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  const createCard = useCallback(async (args: CreateCardArgs): Promise<boolean> => {
    if (!enabled || !boardID) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      setError(`createCard HTTP ${res.status}: ${text}`)
      return false
    }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, boardID, fetchView])

  const moveCard = useCallback(async (cardID: string, columnID: string, position = 0): Promise<boolean> => {
    if (!enabled || !boardID) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: boardID, column_id: columnID, position }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      setError(`moveCard HTTP ${res.status}: ${text}`)
      return false
    }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, boardID, fetchView])

  const patchCard = useCallback(async (cardID: string, patch: Record<string, unknown>): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) { setError(`patchCard HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  /**
   * holdCard / unholdCard — the stop/play button.
   *
   * The hold lives on the noteboard item, not on this board, which is why it
   * works from ANY column rather than only from a designated gate column, and
   * why it also binds on the autoworker's noteboard-discovery path, which never
   * looks at a board at all.
   */
  const holdCard = useCallback(async (cardID: string, reason = ''): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) { setError(`holdCard HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  const unholdCard = useCallback(async (cardID: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/unhold`, {
      method: 'POST',
    })
    if (!res.ok) { setError(`unholdCard HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  const deleteCard = useCallback(async (cardID: string, hard = false): Promise<boolean> => {
    if (!enabled) return false
    const url = `${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}${hard ? '?hard=true' : ''}`
    const res = await fetchFn(url, { method: 'DELETE' })
    if (!res.ok) { setError(`deleteCard HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  const listCardLinks = useCallback(async (cardID: string): Promise<CardLink[]> => {
    if (!enabled) return []
    const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/links`)
    if (!res.ok) return []
    return (await res.json()) ?? []
  }, [fetchFn, kanbanStoreBasePath, enabled])

  /**
   * stopCard — the stop button, in whichever column the card is sitting.
   *
   * Two halves, because a card can be gated before it runs OR already running:
   *   1. Hold the item, so no future autoworker tick dispatches it.
   *   2. Interrupt any session already working it, so the agent stops NOW.
   *
   * The card does not move. It stays In Progress and paused, which keeps its
   * session link meaningful — a card bounced back to Queued would have a link to
   * a session that is no longer working it.
   *
   * Interrupt (not kill) is deliberate: llm-bridge models it as SessionPaused,
   * "user-interrupted, can be resumed", so pressing play genuinely resumes the
   * turn rather than starting the task over.
   */
  const stopCard = useCallback(async (cardID: string, reason = ''): Promise<boolean> => {
    if (!enabled) return false
    if (!(await holdCard(cardID, reason))) return false

    const sessions = (await listCardLinks(cardID))
      .filter(l => l.entity_type === 'session')
      .map(l => l.entity_ref)

    // A failed interrupt must not read as a successful stop. The hold already
    // landed, so nothing NEW will be dispatched — but the agent already running
    // is still running, and saying otherwise is the one lie this button cannot
    // afford to tell.
    let allPaused = true
    for (const sid of sessions) {
      const res = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sid)}/interrupt`, { method: 'POST' })
      if (!res.ok) {
        allPaused = false
        setError(`held the card, but session ${sid} did not interrupt (HTTP ${res.status}) — it may still be working`)
      }
    }
    await fetchView()
    return allPaused
  }, [fetchFn, basePath, enabled, holdCard, listCardLinks, fetchView])

  /**
   * playCard — the play button: clear the gate, and resume whatever we paused.
   *
   * A session is only resumed if it is actually `paused`. Blindly POSTing resume
   * to every linked session would also poke sessions that ended on their own —
   * play means "undo the stop", not "run this again", and a card can carry links
   * to sessions from earlier, completed dispatches.
   */
  const playCard = useCallback(async (cardID: string): Promise<boolean> => {
    if (!enabled) return false
    if (!(await unholdCard(cardID))) return false

    const sessions = (await listCardLinks(cardID))
      .filter(l => l.entity_type === 'session')
      .map(l => l.entity_ref)

    for (const sid of sessions) {
      const get = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sid)}`)
      if (!get.ok) continue
      const session = await get.json().catch(() => null)
      if (session?.state !== 'paused') continue
      const res = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sid)}/resume`, { method: 'POST' })
      if (!res.ok) setError(`cleared the hold, but session ${sid} did not resume (HTTP ${res.status})`)
    }
    await fetchView()
    return true
  }, [fetchFn, basePath, enabled, unholdCard, listCardLinks, fetchView])

  const addCardLink = useCallback(async (cardID: string, entity_type: string, entity_ref: string, label?: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type, entity_ref, label }),
    })
    if (!res.ok) { setError(`addCardLink HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  const deleteCardLink = useCallback(async (linkID: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/links/${encodeURIComponent(linkID)}`, { method: 'DELETE' })
    if (!res.ok) { setError(`deleteCardLink HTTP ${res.status}`); return false }
    await fetchView()
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled, fetchView])

  const listCardsForEntity = useCallback(async (entityType: string, entityRef: string): Promise<EntityCardView[]> => {
    if (!enabled) return []
    const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/cards`)
    if (!res.ok) {
      setError(`listCardsForEntity HTTP ${res.status}`)
      return []
    }
    return (await res.json()) ?? []
  }, [fetchFn, kanbanStoreBasePath, enabled])

  const listEntityTags = useCallback(async (entityType: string, entityRef: string): Promise<EntityTag[]> => {
    if (!enabled) return []
    const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags`)
    if (!res.ok) {
      setError(`listEntityTags HTTP ${res.status}`)
      return []
    }
    return (await res.json()) ?? []
  }, [fetchFn, kanbanStoreBasePath, enabled])

  const addEntityTag = useCallback(async (entityType: string, entityRef: string, tag: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
    if (!res.ok) { setError(`addEntityTag HTTP ${res.status}`); return false }
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled])

  const deleteEntityTag = useCallback(async (entityType: string, entityRef: string, tag: string): Promise<boolean> => {
    if (!enabled) return false
    const res = await fetchFn(`${kanbanStoreBasePath}/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRef)}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    })
    if (!res.ok) { setError(`deleteEntityTag HTTP ${res.status}`); return false }
    return true
  }, [fetchFn, kanbanStoreBasePath, enabled])

  return useMemo(() => ({
    boards,
    view,
    entityTypes,
    loading,
    error,
    refresh: () => { fetchBoards(); fetchView() },
    createBoard,
    deleteBoard,
    createColumn,
    deleteColumn,
    createCard,
    moveCard,
    patchCard,
    deleteCard,
    holdCard,
    unholdCard,
    stopCard,
    playCard,
    listCardLinks,
    addCardLink,
    deleteCardLink,
    listCardsForEntity,
    listEntityTags,
    addEntityTag,
    deleteEntityTag,
  }), [
    boards, view, entityTypes, loading, error,
    fetchBoards, fetchView,
    createBoard, deleteBoard, createColumn, deleteColumn,
    createCard, moveCard, patchCard, deleteCard,
    holdCard, unholdCard, stopCard, playCard,
    listCardLinks, addCardLink, deleteCardLink,
    listCardsForEntity, listEntityTags, addEntityTag, deleteEntityTag,
  ])
}
