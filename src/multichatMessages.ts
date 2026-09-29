// The pure rules of the Messages pages (Conversations, Search, Contacts): the
// multichat paths they call, the bodies they send, and how multichat's answers
// are merged, filtered and ordered for display. The components only fetch and
// draw; everything here is covered by test/multichatMessages.test.ts.
//
// Every path is relative to `multichatBasePath`, which the host proxies (dash:
// `/api/multichat`). `MULTICHAT_ROUTES_CALLED` lists them all, because dash
// forwards only the multichat routes it names.

import type {
  MultichatContactTagMap, MultichatConversation, MultichatConversationTagMap, MultichatMessage, MultichatMessagePage,
  MultichatSearchAnswer, MultichatSearchGroup, MultichatSearchHit, MultichatTag, MultichatUnifiedContact,
} from './types-multichat'
import { EMOJI_ROUTES_CALLED } from './emojiCatalog'

/** How many messages one page asks for. multichat takes 1–200. */
export const MESSAGE_PAGE_SIZE = 50

/** Every multichat route the Messages pages call, as `METHOD path`, for the
 *  host's proxy allowlist. `{room_id}` is one URL-encoded path segment. */
export const MULTICHAT_ROUTES_CALLED: readonly string[] = [
  'GET /conversations',
  'GET /conversations/{room_id}/messages',
  'POST /conversations/{room_id}/send',
  // Reacting to a message, and taking back a reaction we posted.
  'POST /conversations/{room_id}/reactions',
  'DELETE /conversations/{room_id}/reactions/{reaction_event_id}',
  'GET /search',
  'GET /contacts/unified',
  'GET /tags',
  'POST /tags',
  'DELETE /tags',
  'GET /contacts/tags/bulk',
  'POST /contacts/tags',
  'DELETE /contacts/tags',
  'GET /conversations/tags/bulk',
  'POST /conversations/tags',
  'DELETE /conversations/tags',
  // Images, custom emoji and custom reactions, loaded by <img> (MessageContent).
  'GET /media/{server_name}/{media_id}',
  // Channel names for a Discord room's `<#id>` tokens, and which server's
  // custom emoji the room is offered.
  'GET /discord/status',
  // The emoji pickers, the quick-react bar and the Emoji page.
  ...EMOJI_ROUTES_CALLED,
]

const roomSegment = (roomID: string) => encodeURIComponent(roomID)

/** One page of a room's messages. Without `from`, the newest page; with it, the
 *  page before the one whose `end` it was. */
export function conversationMessagesPath(roomID: string, from?: string | null): string {
  const query = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) })
  if (from) query.set('from', from)
  return `/conversations/${roomSegment(roomID)}/messages?${query.toString()}`
}

/** Where a reaction to a message in the room is posted. */
export function reactionPostPath(roomID: string): string {
  return `/conversations/${roomSegment(roomID)}/reactions`
}

/** Where a reaction we posted is taken back. */
export function reactionTakeBackPath(roomID: string, reactionEventID: string): string {
  return `/conversations/${roomSegment(roomID)}/reactions/${encodeURIComponent(reactionEventID)}`
}

/** The message a reaction on a shown message goes to: the message itself, or,
 *  for an edit shown alone because its original is on an older page, the
 *  original — reactions point at the original, never at an edit. */
export function reactionTargetEventID(message: MultichatMessage): string {
  return message.replaces_event_id || message.event_id
}

export function conversationSendPath(roomID: string): string {
  return `/conversations/${roomSegment(roomID)}/send`
}

export type WireBodyResult<T> = { ok: true; body: T } | { ok: false; error: string }

/** The body of a send. Surrounding blank lines and spaces are dropped; a
 *  message with nothing else is refused here, as multichat would refuse it. */
export function sendMessageBodyOf(text: string): WireBodyResult<{ body: string }> {
  const body = text.trim()
  if (!body) return { ok: false, error: 'Nothing to send.' }
  return { ok: true, body: { body } }
}

/** The messages of a page, oldest first; multichat sends `null` for none. */
export function pageMessages(page: MultichatMessagePage): MultichatMessage[] {
  return page.messages ?? []
}

/** An older page put in front of what is shown. A message on both sides — a
 *  page boundary that moved while the reader scrolled — is kept once. */
export function prependOlderMessages(shown: readonly MultichatMessage[], older: readonly MultichatMessage[]): MultichatMessage[] {
  const shownIDs = new Set(shown.map(message => message.event_id))
  return [...older.filter(message => !shownIDs.has(message.event_id)), ...shown]
}

/** The newest page merged into what is shown, for the poll: every shown
 *  message older than the newest page is kept (the reader may have loaded
 *  pages further back), and the newest page replaces the rest. */
export function mergeNewestMessages(shown: readonly MultichatMessage[], newest: readonly MultichatMessage[]): MultichatMessage[] {
  if (newest.length === 0) return [...shown]
  const newestIDs = new Set(newest.map(message => message.event_id))
  const oldestNewestTimestamp = newest[0].timestamp
  const kept = shown.filter(message => !newestIDs.has(message.event_id) && message.timestamp < oldestNewestTimestamp)
  return [...kept, ...newest]
}

/** Whether two message lists show the same messages in the same order with
 *  the same reactions, so a poll that brought nothing new does not redraw the
 *  room, and one that brought only a reaction does. */
export function sameMessages(a: readonly MultichatMessage[], b: readonly MultichatMessage[]): boolean {
  return a.length === b.length && a.every((message, index) =>
    message.event_id === b[index].event_id && reactionSignature(message) === reactionSignature(b[index]))
}

function reactionSignature(message: MultichatMessage): string {
  return (message.reactions ?? []).map(r =>
    `${r.key}\u0000${r.count}\u0000${(r.sender_display_names ?? []).join('\u0001')}\u0000${r.my_reaction_event_id}\u0000${r.reacted_by_me}`).join('\u0002')
}

/** The apps the conversations are on, each once, sorted. */
export function conversationPlatforms(conversations: readonly MultichatConversation[]): string[] {
  return [...new Set(conversations.map(conversation => conversation.platform ?? '').filter(Boolean))].sort()
}

export interface ConversationFilter {
  /** Empty means every app. */
  platform: string
  /** Matched, in any case, against the room name, its members' names and its
   *  last message. */
  text: string
  /** Null means any tag or none; else one of `conversationTags`. */
  tagID: number | null
}

export function filterConversations(
  conversations: readonly MultichatConversation[], tagMaps: ConversationTagMaps, filter: ConversationFilter,
): MultichatConversation[] {
  const text = filter.text.trim().toLowerCase()
  return conversations.filter(conversation => {
    if (filter.platform && conversation.platform !== filter.platform) return false
    if (filter.tagID !== null && !conversationTags(conversation, tagMaps).some(tag => tag.id === filter.tagID)) return false
    if (!text) return true
    return conversation.name.toLowerCase().includes(text)
      || (conversation.members ?? []).some(member => (member.display_name ?? '').toLowerCase().includes(text))
      || (conversation.last_message ?? '').toLowerCase().includes(text)
  })
}

/** How many members a room named after its members names before it counts
 *  the rest. */
export const NAMED_MEMBERS_SHOWN = 3

/** The name to show for a room. A room named after more than
 *  NAMED_MEMBERS_SHOWN members shows the first ones and counts the rest, as
 *  Messenger does; any other room shows its name as multichat gives it. */
export function conversationShownName(conversation: MultichatConversation): string {
  if (!conversation.named_after_members) return conversation.name
  const names = (conversation.members ?? []).flatMap(member => member.display_name ? [member.display_name] : [])
  if (names.length <= NAMED_MEMBERS_SHOWN) return conversation.name
  const others = names.length - NAMED_MEMBERS_SHOWN
  return `${names.slice(0, NAMED_MEMBERS_SHOWN).join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`
}

/** The two places a room's tags come from. */
export interface ConversationTagMaps {
  contactTagMap: MultichatContactTagMap
  conversationTagMap: MultichatConversationTagMap
}

/** The tags put on the room itself. */
export function conversationOwnTags(conversation: MultichatConversation, conversationTagMap: MultichatConversationTagMap): MultichatTag[] {
  return uniqueTagsSorted(conversationTagMap[conversation.room_id] ?? [])
}

/** The tags a one-to-one DM takes from the other person's identity; none in
 *  any other room, so a busy channel does not carry every member's tags. */
export function conversationPartnerTags(conversation: MultichatConversation, contactTagMap: MultichatContactTagMap): MultichatTag[] {
  const partner = conversation.direct_message_partner_user_id
  return partner ? uniqueTagsSorted(contactTagMap[partner] ?? []) : []
}

/** The tags a room shows and is filtered by: its own, and in a one-to-one DM
 *  the other person's, once each, by name. */
export function conversationTags(conversation: MultichatConversation, tagMaps: ConversationTagMaps): MultichatTag[] {
  return uniqueTagsSorted([
    ...conversationOwnTags(conversation, tagMaps.conversationTagMap),
    ...conversationPartnerTags(conversation, tagMaps.contactTagMap),
  ])
}

function uniqueTagsSorted(tags: readonly MultichatTag[]): MultichatTag[] {
  const byID = new Map<number, MultichatTag>()
  for (const tag of tags) byID.set(tag.id, tag)
  return [...byID.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** `/search?q=`, or null when there is nothing to search for (multichat
 *  answers 400 to an empty term). */
export function searchPath(query: string): string | null {
  const term = query.trim()
  if (!term) return null
  return `/search?${new URLSearchParams({ q: term }).toString()}`
}

/** multichat's search groups, newest first: each group's hits newest first,
 *  and the groups by their newest hit. multichat sends them in map order. */
export function orderedSearchGroups(answer: MultichatSearchAnswer): (MultichatSearchGroup & { results: MultichatSearchHit[] })[] {
  const groups = (answer.groups ?? []).map(group => ({
    ...group,
    results: [...(group.results ?? [])].sort((a, b) => b.timestamp - a.timestamp),
  }))
  const newest = (group: { results: MultichatSearchHit[] }) => group.results[0]?.timestamp ?? 0
  return groups.sort((a, b) => newest(b) - newest(a))
}

export interface HighlightSegment {
  text: string
  match: boolean
}

/** `text` cut into the parts that match `term`, in any case, and the parts
 *  between, so the matches can be marked. The term is matched as plain text,
 *  never as a pattern. */
export function highlightSegments(text: string, term: string): HighlightSegment[] {
  const needle = term.trim().toLowerCase()
  if (!needle) return [{ text, match: false }]
  const haystack = text.toLowerCase()
  const segments: HighlightSegment[] = []
  let at = 0
  for (let found = haystack.indexOf(needle, at); found !== -1; found = haystack.indexOf(needle, at)) {
    if (found > at) segments.push({ text: text.slice(at, found), match: false })
    segments.push({ text: text.slice(found, found + needle.length), match: true })
    at = found + needle.length
  }
  if (at < text.length) segments.push({ text: text.slice(at), match: false })
  return segments
}

/** The apps a contact is on, each once, sorted. */
export function contactPlatforms(contact: MultichatUnifiedContact): string[] {
  return [...new Set(contact.identities.map(identity => identity.platform))].sort()
}

/** Every tag on any of a contact's identities, once each, by name. A tag sits
 *  on one identity — one Matrix user id — not on the merged contact. */
export function contactTags(contact: MultichatUnifiedContact, tagMap: MultichatContactTagMap): MultichatTag[] {
  return uniqueTagsSorted(contact.identities.flatMap(identity => tagMap[identity.user_id] ?? []))
}

export interface ContactFilter {
  /** Matched, in any case, against the display name and every user id. */
  text: string
  /** Empty means every app. */
  platform: string
  /** Null means any tag or none. */
  tagID: number | null
  /** Only contacts multichat found on more than one app. */
  onSeveralApps: boolean
}

export function filterContacts(contacts: readonly MultichatUnifiedContact[], tagMap: MultichatContactTagMap, filter: ContactFilter): MultichatUnifiedContact[] {
  const text = filter.text.trim().toLowerCase()
  return contacts.filter(contact => {
    const platforms = contactPlatforms(contact)
    if (filter.onSeveralApps && platforms.length < 2) return false
    if (filter.platform && !platforms.includes(filter.platform)) return false
    if (filter.tagID !== null && !contactTags(contact, tagMap).some(tag => tag.id === filter.tagID)) return false
    if (!text) return true
    return contact.display_name.toLowerCase().includes(text)
      || contact.identities.some(identity => identity.user_id.toLowerCase().includes(text))
  })
}

/** The apps any contact is on, each once, sorted. */
export function contactListPlatforms(contacts: readonly MultichatUnifiedContact[]): string[] {
  return [...new Set(contacts.flatMap(contactPlatforms))].sort()
}

/** The body of `POST /tags`. No colour is sent, so multichat picks its own. */
export function tagCreateBodyOf(name: string, existing: readonly MultichatTag[]): WireBodyResult<{ name: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'A tag needs a name.' }
  if (existing.some(tag => tag.name === trimmed)) return { ok: false, error: `There is already a tag named "${trimmed}".` }
  return { ok: true, body: { name: trimmed } }
}

export function tagDeletePath(tagID: number): string {
  return `/tags?${new URLSearchParams({ id: String(tagID) }).toString()}`
}

/** The body of `POST /contacts/tags`: one tag onto one identity. */
export function contactTagAssignBody(userID: string, tagID: number): { contact_user_id: string; tag_id: number } {
  return { contact_user_id: userID, tag_id: tagID }
}

export function contactTagRemovePath(userID: string, tagID: number): string {
  return `/contacts/tags?${new URLSearchParams({ contact: userID, tag: String(tagID) }).toString()}`
}

/** The body of `POST /conversations/tags`: one tag onto one room. */
export function conversationTagAssignBody(roomID: string, tagID: number): { room_id: string; tag_id: number } {
  return { room_id: roomID, tag_id: tagID }
}

export function conversationTagRemovePath(roomID: string, tagID: number): string {
  return `/conversations/tags?${new URLSearchParams({ room: roomID, tag: String(tagID) }).toString()}`
}

/** When a message or conversation was last active: the time alone for today,
 *  the date and time otherwise. */
export function messageTimeLabel(timestamp: number, now: Date = new Date()): string {
  const when = new Date(timestamp)
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (when.toDateString() === now.toDateString()) return time
  const sameYear = when.getFullYear() === now.getFullYear()
  const date = when.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
  return `${date} ${time}`
}

/** A message as the room shows it: an edited message carries its newest
 *  edit's content and is marked edited, and the edit events themselves are
 *  not shown. */
export type ShownMessage = MultichatMessage & { edited: boolean }

/** Folds edits into the messages they edit. multichat lists an edit as its
 *  own event with `replaces_event_id` and the edited content; each original
 *  takes the content of its newest edit and keeps its own id, time, sender and
 *  reactions (a reaction points at the original). An edit whose original is
 *  not loaded — it is on an older page — is shown by itself, marked edited. */
export function foldEdits(messages: readonly MultichatMessage[]): ShownMessage[] {
  const loadedIDs = new Set(messages.map(message => message.event_id))
  const newestEditOf = new Map<string, MultichatMessage>()
  for (const message of messages) {
    const original = message.replaces_event_id
    if (!original) continue
    const known = newestEditOf.get(original)
    if (!known || message.timestamp >= known.timestamp) newestEditOf.set(original, message)
  }
  const shown: ShownMessage[] = []
  for (const message of messages) {
    const original = message.replaces_event_id
    if (original) {
      if (!loadedIDs.has(original) && newestEditOf.get(original) === message) shown.push({ ...message, edited: true })
      continue
    }
    const edit = newestEditOf.get(message.event_id)
    if (!edit) {
      shown.push({ ...message, edited: false })
      continue
    }
    shown.push({
      ...message,
      body: edit.body,
      msg_type: edit.msg_type,
      format: edit.format,
      formatted_body: edit.formatted_body,
      media_url: edit.media_url,
      media_mimetype: edit.media_mimetype,
      edited: true,
    })
  }
  return shown
}

/** A conversation's last message as one line of plain text for the list.
 *  Discord bridges send the markdown source as the body, so the list showed
 *  `### Jazz Night … **Going**`; this drops the markers and turns Discord's
 *  `<:name:id>` emoji, `<#id>` channels and `<@id>` people into readable text. */
export function conversationPreviewText(lastMessage: string): string {
  return lastMessage
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<@&\d+>/g, '@role')
    .replace(/<@!?\d+>/g, '@someone')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__|~~|\|\|)/g, '')
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
