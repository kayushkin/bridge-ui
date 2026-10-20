// The Conversations page's short names: `/messages/kat` addresses the chat
// short-name-store calls messages/kat. The store owns the names and joins them
// to rooms by Matrix room id; this module holds the pure rules — which path a
// URL asks for, the requests, and which name each room shows.

import type { ConversationLink } from '@kayushkin/multichat-types'
import type { ShortName } from './types-short-name-store'

/** short-name-store's namespace for the Messages page. */
export const MESSAGES_SHORT_NAME_NAMESPACE = 'messages'
/** What a messages short name points at: a multichat (Matrix) room id. */
export const MULTICHAT_ROOM_ENTITY_TYPE = 'multichat_room'
/** The largest page short-name-store answers. */
export const SHORT_NAME_PAGE_SIZE = 1000
/** The most segments a short name has. */
export const SHORT_NAME_MOST_SEGMENTS = 3
/** Why the operator's rename happened, as the store records it. */
export const OPERATOR_RENAME_REASON = 'renamed by the operator in dash'

/** Every route the page calls, relative to `shortNameStoreBasePath`; the
 *  host's proxy must forward each. dash: server/api_short_names.go. */
export const SHORT_NAME_STORE_ROUTES_CALLED: readonly string[] = [
  'GET /short-names',
  'GET /short-names/resolve',
  'POST /short-names',
]

/** What the part of the URL after `/messages/` asks for. */
export type MessagesAddress =
  | { kind: 'none' }
  | { kind: 'path'; path: string }
  | { kind: 'too-long'; path: string }

/** Reads the router's splat (decoded, without the leading slash). Empty means
 *  the bare list. One trailing slash is dropped; anything else is kept as
 *  typed, so the store judges the spelling and the page shows its answer. */
export function messagesAddressOf(splat: string): MessagesAddress {
  const path = splat.endsWith('/') ? splat.slice(0, -1) : splat
  if (path === '') return { kind: 'none' }
  if (path.split('/').length > SHORT_NAME_MOST_SEGMENTS) return { kind: 'too-long', path }
  return { kind: 'path', path }
}

/** The list request for one page of current room names. */
export function shortNamesPagePath(offset: number): string {
  const query = new URLSearchParams({
    namespace: MESSAGES_SHORT_NAME_NAMESPACE,
    entity_type: MULTICHAT_ROOM_ENTITY_TYPE,
    limit: String(SHORT_NAME_PAGE_SIZE),
    offset: String(offset),
  })
  return `/short-names?${query.toString()}`
}

/** Whether a page of the list was the last one. */
export function shortNamesPageIsLast(page: readonly ShortName[]): boolean {
  return page.length < SHORT_NAME_PAGE_SIZE
}

/** The resolve request for a path. */
export function shortNameResolvePath(path: string): string {
  return `/short-names/resolve?${new URLSearchParams({ namespace: MESSAGES_SHORT_NAME_NAMESPACE, path }).toString()}`
}

/** The name a room shows, and which room the name belongs to: the room itself,
 *  or the room in its conversation link that holds the name. */
export interface RoomShortName {
  path: string
  namedRoomID: string
}

/** Room id → the name it shows. A room uses its own current name. A room with
 *  none, in a conversation link, shows the name of the first room in the link
 *  (multichat sorts a link's rooms by id) that has one, because the linked
 *  rooms are listed as one conversation. Superseded names and other entity
 *  types are left out. */
export function roomShortNames(names: readonly ShortName[], links: readonly ConversationLink[]): Map<string, RoomShortName> {
  const own = new Map<string, RoomShortName>()
  for (const name of names) {
    if (name.namespace !== MESSAGES_SHORT_NAME_NAMESPACE || name.entity_type !== MULTICHAT_ROOM_ENTITY_TYPE || name.superseded_at !== 0) continue
    own.set(name.entity_id, { path: name.path, namedRoomID: name.entity_id })
  }
  const shown = new Map(own)
  for (const link of links) {
    const named = link.room_ids.map(roomID => own.get(roomID)).find(name => name !== undefined)
    if (!named) continue
    for (const roomID of link.room_ids) if (!shown.has(roomID)) shown.set(roomID, named)
  }
  return shown
}

/** Where a room opens. A room that holds its name opens at `/messages/<name>`.
 *  A room showing a linked room's name opens at that name with `?room=` to say
 *  which tab, since the name itself opens the room that holds it. A room with
 *  no name opens at `?room=<id>`. `keep` carries the page's other query
 *  parameters. */
export function conversationAddress(
  conversationsRoute: string, roomID: string, names: ReadonlyMap<string, RoomShortName>, keep: URLSearchParams = new URLSearchParams(),
): string {
  const query = new URLSearchParams(keep)
  query.delete('room')
  const name = names.get(roomID)
  let pathname = conversationsRoute
  if (name) pathname = `${conversationsRoute}/${name.path}`
  if (!name || name.namedRoomID !== roomID) query.set('room', roomID)
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

/** The rename control's body. The typed path may carry the `messages/` the
 *  header shows; the store judges the rest. `created_by` is the host's to set. */
export function shortNameRenameBodyOf(roomID: string, typed: string): { ok: true; body: Record<string, string> } | { ok: false; error: string } {
  let path = typed.trim().replace(/^\/+/, '')
  if (path.startsWith(`${MESSAGES_SHORT_NAME_NAMESPACE}/`)) path = path.slice(MESSAGES_SHORT_NAME_NAMESPACE.length + 1)
  if (path === '') return { ok: false, error: 'Type the new name, such as kat or 20s30s/general.' }
  return {
    ok: true,
    body: {
      namespace: MESSAGES_SHORT_NAME_NAMESPACE, path,
      entity_type: MULTICHAT_ROOM_ENTITY_TYPE, entity_id: roomID, reason: OPERATOR_RENAME_REASON,
    },
  }
}

/** The store's refusal as it gave it: the `error` of its JSON body, or the
 *  body itself when it is not that shape. */
export function shortNameStoreRefusal(status: number, body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string') {
      return `${status}: ${(parsed as { error: string }).error}`
    }
  } catch {
    // Not JSON: show it as it came.
  }
  return `${status}: ${body.trim()}`
}
