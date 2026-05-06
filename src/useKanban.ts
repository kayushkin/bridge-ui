import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import type {
  Board,
  BoardView,
  CardLink,
  EntityTypeInfo,
} from './types-kanban'

export interface CreateBoardArgs { name: string; description?: string }
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
}

/**
 * useKanban — list/create boards and (when a board id is given) load its
 * full BoardView with cards joined to noteboard items. Polls every 15s.
 * All mutate actions auto-refresh the affected scope.
 */
export function useKanban(boardID: string | null) {
  const { fetch: fetchFn, kanbanStoreBasePath } = useBridgeConfig()
  const enabled = !!kanbanStoreBasePath

  const [boards, setBoards] = useState<Board[]>([])
  const [view, setView] = useState<BoardView | null>(null)
  const [entityTypes, setEntityTypes] = useState<EntityTypeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastViewJSON = useRef('')

  const fetchBoards = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    try {
      const res = await fetchFn(`${kanbanStoreBasePath}/api/boards`)
      if (!res.ok) throw new Error(`/api/boards HTTP ${res.status}`)
      const data: Board[] = (await res.json()) ?? []
      setBoards(data)
      setError(null)
    } catch (err) {
      setError(`${err}`)
    }
  }, [fetchFn, kanbanStoreBasePath, enabled])

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
    if (!enabled) return
    try {
      const res = await fetchFn(`${kanbanStoreBasePath}/api/entity-types`)
      if (!res.ok) return
      setEntityTypes((await res.json()) ?? [])
    } catch {/* non-fatal */}
  }, [fetchFn, kanbanStoreBasePath, enabled])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      await Promise.all([fetchBoards(), fetchView(), fetchEntityTypes()])
      if (!cancelled) setLoading(false)
    }
    run()
    const t = setInterval(() => { fetchBoards(); fetchView() }, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [fetchBoards, fetchView, fetchEntityTypes])

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
    listCardLinks,
    addCardLink,
    deleteCardLink,
  }), [
    boards, view, entityTypes, loading, error,
    fetchBoards, fetchView,
    createBoard, deleteBoard, createColumn, deleteColumn,
    createCard, moveCard, patchCard, deleteCard,
    listCardLinks, addCardLink, deleteCardLink,
  ])
}
