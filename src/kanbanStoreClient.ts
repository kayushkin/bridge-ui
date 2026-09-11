import type { FetchFn } from './types'
import type { Board, PriorityLadder } from './types-kanban'
import type { BoardSettingsPatch, LadderWireLevel } from './kanbanBoardSettings'
import { readErrorText } from './useKanban'

// The board-level reads and writes behind the board settings page, as typed
// functions over the host's authenticated fetch. `useKanban` carries the
// card-level verbs; these are the four the board's own record needs.
//
// Every call answers a `KanbanStoreResult`: the stored record on success, and
// on failure kanban-store's own `{"error":"…"}` text, verbatim — its refusals
// name the field and the owner that said no (an unknown or disabled principal,
// a slug where a numeric agent id belongs, a bundle name instead of its id,
// half a classifier, a zero rung), so the page shows them as they arrive.

export type KanbanStoreResult<T> = { ok: true; value: T } | { ok: false; error: string }

async function request<T>(fetchFn: FetchFn, verb: string, url: string, init?: RequestInit): Promise<KanbanStoreResult<T>> {
  let res: Response
  try {
    res = await fetchFn(url, init)
  } catch (err) {
    return { ok: false, error: `${verb}: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!res.ok) return { ok: false, error: await readErrorText(res, verb) }
  try {
    return { ok: true, value: (await res.json()) as T }
  } catch (err) {
    return { ok: false, error: `${verb}: response was not JSON (${err instanceof Error ? err.message : String(err)})` }
  }
}

function boardURL(kanbanStoreBasePath: string, boardID: string): string {
  return `${kanbanStoreBasePath}/api/boards/${encodeURIComponent(boardID)}`
}

/** `GET /api/boards/{id}` — the board with its settings. A cleared setting is
 *  absent on the wire, never an empty string. */
export function getBoard(fetchFn: FetchFn, kanbanStoreBasePath: string, boardID: string): Promise<KanbanStoreResult<Board>> {
  return request(fetchFn, 'read board', boardURL(kanbanStoreBasePath, boardID))
}

/** `PATCH /api/boards/{id}` — any subset of the settings. Omitted keys are left
 *  alone; the store checks each id with its owner before writing anything, so
 *  a refusal means nothing changed. Answers the stored board. */
export function patchBoard(
  fetchFn: FetchFn, kanbanStoreBasePath: string, boardID: string, patch: BoardSettingsPatch,
): Promise<KanbanStoreResult<Board>> {
  return request(fetchFn, 'save board', boardURL(kanbanStoreBasePath, boardID), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export function getPriorityLadder(fetchFn: FetchFn, kanbanStoreBasePath: string, boardID: string): Promise<KanbanStoreResult<PriorityLadder>> {
  return request(fetchFn, 'read priority ladder', `${boardURL(kanbanStoreBasePath, boardID)}/priority-levels`)
}

/** `PUT /api/boards/{id}/priority-levels` — the whole ladder, replaced. */
export function putPriorityLadder(
  fetchFn: FetchFn, kanbanStoreBasePath: string, boardID: string, body: { levels: LadderWireLevel[] },
): Promise<KanbanStoreResult<PriorityLadder>> {
  return request(fetchFn, 'save priority ladder', `${boardURL(kanbanStoreBasePath, boardID)}/priority-levels`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
