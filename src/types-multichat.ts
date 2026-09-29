// multichat's unified contact list as the Inbound rules page reads it. The rule
// records themselves come from `@kayushkin/multichat-types`, rendered from Go;
// this one is hand-written because multichat assembles the contact answer from
// unnamed types in its router, so there is nothing for tygo to render yet.

/** One person on one app: the bridge puppet id a rule's `sender_user_id` names. */
export interface MultichatContactIdentity {
  user_id: string
  platform: string
}

/** `GET {multichatBasePath}/contacts/unified` — one row per person, with every
 *  app identity multichat merged under that display name. */
export interface MultichatUnifiedContact {
  display_name: string
  identities: MultichatContactIdentity[]
}

import type { MessageReactionGroup } from '@kayushkin/multichat-types'

// The Messages pages (Conversations, Search, Contacts) read the records below.
// They are hand-written for the same reason: the conversation, message and page
// records are structs in multichat's internal/matrix/client.go, which tygo.yaml
// does not render (it renders only internal/db/inbound.go), and the search, tag
// and tag-map answers are unnamed types built inside its router. Each comment
// names the Go source, so the day multichat renders them these copies go.

/** `GET {multichatBasePath}/conversations` — matrix.Conversation. Sorted by
 *  last activity, newest first. */
export interface MultichatConversation {
  room_id: string
  name: string
  topic?: string
  avatar_url?: string
  member_count: number
  /** Every joined member but us and the bridge bots; their user ids are the
   *  keys of the contact tag map. */
  members?: MultichatConversationMember[]
  /** The room has no name of its own, so `name` is its members' display
   *  names joined with ", ". */
  named_after_members?: boolean
  platform?: string
  /** Unix milliseconds; 0 when the room has no message yet. */
  last_activity: number
  last_message?: string
}

/** One person in a room — matrix.ConversationMember. `display_name` is the
 *  one their member event carries in that room, without the bridge's suffix;
 *  absent when it has none. */
export interface MultichatConversationMember {
  user_id: string
  display_name?: string
}

/** One message in a room — matrix.Message. `msg_type` is Matrix's `msgtype`
 *  (`m.text`, `m.image`, `m.file`…); for a file, `body` is its file name. */
export interface MultichatMessage {
  event_id: string
  /** The Matrix user id of the sender, a bridge puppet or our own account. */
  sender: string
  /** Absent when Synapse had no display name for the sender. */
  sender_name?: string
  body: string
  msg_type: string
  /** Unix milliseconds. */
  timestamp: number
  /** Sent by our own account on that app. Omitted when false. */
  is_me?: boolean
  /** `org.matrix.custom.html` when `formatted_body` is Matrix HTML, else "". */
  format?: string
  formatted_body?: string
  /** The `mxc://` URI of an image, file or video message, else "". */
  media_url?: string
  media_mimetype?: string
  reply_to_event_id?: string
  /** Set on an edit: the message it edits. The edit's body and formatting
   *  are the edited content, so `foldEdits` can put them on the original. */
  replaces_event_id?: string
  /** Reactions logged since multichat's reaction log began, grouped by key. */
  reactions?: MessageReactionGroup[] | null
}

/** `GET {multichatBasePath}/conversations/{room_id}/messages?limit=&from=` —
 *  matrix.MessagePage. `messages` is oldest first; `end` is the token to pass
 *  as `from` for the page before this one. */
export interface MultichatMessagePage {
  messages: MultichatMessage[] | null
  end?: string
  has_more: boolean
}

/** `POST {multichatBasePath}/conversations/{room_id}/send` answers this. */
export interface MultichatSendAnswer {
  event_id: string
}

/** One hit of `GET {multichatBasePath}/search?q=` (searchHandler's Result). */
export interface MultichatSearchHit {
  room_id: string
  room_name: string
  platform: string
  sender_name: string
  body: string
  timestamp: number
  event_id: string
}

/** Hits grouped by room (searchHandler's Group). Groups arrive in no order. */
export interface MultichatSearchGroup {
  room_id: string
  room_name: string
  platform: string
  results: MultichatSearchHit[] | null
}

/** `GET {multichatBasePath}/search?q=`. `query` is the term as multichat
 *  matched it: trimmed and lower-cased. The answer also carries
 *  `load_results`, left over from a freight demo, which nothing here reads. */
export interface MultichatSearchAnswer {
  query: string
  total: number
  groups: MultichatSearchGroup[] | null
}

/** `GET {multichatBasePath}/tags` — one tag (tagsHandler's Tag). */
export interface MultichatTag {
  id: number
  name: string
  color: string
}

/** `GET {multichatBasePath}/contacts/tags/bulk` — the tags on each contact
 *  identity, keyed by the Matrix user id a tag was put on. An identity with no
 *  tag is absent. */
export type MultichatContactTagMap = Record<string, MultichatTag[]>

