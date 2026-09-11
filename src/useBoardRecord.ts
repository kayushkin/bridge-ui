import { useEffect, useState } from 'react'
import { useBridgeConfig } from './context'
import { getBoard } from './kanbanStoreClient'
import type { Board } from './types-kanban'

export interface BoardRecord {
  /** The board, or null while loading, when there is no board id, or after a
   *  failure — `error` tells the last two apart. */
  board: Board | null
  error: string | null
}

/**
 * One board's record, by id, read once per id. A card view carries only the
 * board id; the board's defaults (the instance a dispatch would run on, the
 * bundle it is provisioned with) live on the board, so the card reads it here.
 * Both mounts of the card — the drawer and the standalone page — use it, so
 * the page, which never loads a board view, still knows the board.
 */
export function useBoardRecord(boardID: string | null): BoardRecord {
  const { fetch: fetchFn, kanbanStoreBasePath } = useBridgeConfig()
  const [state, setState] = useState<BoardRecord & { forBoardID: string | null }>({ board: null, error: null, forBoardID: null })
  useEffect(() => {
    if (!boardID || !kanbanStoreBasePath) {
      setState({ board: null, error: null, forBoardID: boardID })
      return
    }
    let cancelled = false
    getBoard(fetchFn, kanbanStoreBasePath, boardID).then(result => {
      if (cancelled) return
      setState(result.ok
        ? { board: result.value, error: null, forBoardID: boardID }
        : { board: null, error: result.error, forBoardID: boardID })
    })
    return () => { cancelled = true }
  }, [fetchFn, kanbanStoreBasePath, boardID])
  // A record for the previous board must not stand in for this one's while it loads.
  return state.forBoardID === boardID ? { board: state.board, error: state.error } : { board: null, error: null }
}
