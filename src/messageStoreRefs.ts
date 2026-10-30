// What a message-store reference chip shows, as pure rules so they are tested
// (test/messageStoreRefs.test.ts). The chips are ConversationRefChip,
// ChatMessageRefChip and ConversationDayRefChip in
// components/chat/RefChip.tsx; their data is message-store's answer to
// GET /conversations/{id}, /messages/{id} and /conversation-days/{id}, passed
// through by the host's resolver.

import type { Conversation, ConversationDay, ConversationDayWithMessages, Message } from '@kayushkin/message-store-types'
import { calendarDayOf } from './journalRefs'

/** The glyph a conversation draws with, by the app it happened on. */
export function chatPlatformGlyph(platform: string): string {
  switch (platform) {
    case 'sms': return '📱'
    case 'discord': return '🎮'
    case 'skype': return '☁'
    case 'facebook-messenger': case 'instagram': return '💭'
    default: return '💬'
  }
}

/** Everyone in a conversation but the user, by name. */
export function otherParticipantNames(conversation: Pick<Conversation, 'participants'>): string[] {
  return (conversation.participants ?? [])
    .filter((participant) => !participant.is_self)
    .map((participant) => participant.display_name.trim() || participant.handle)
}

/** A conversation's name on a chip: its title, else who it is with. */
export function conversationChipLabel(conversation: Pick<Conversation, 'title' | 'participants' | 'platform'>): string {
  if (conversation.title.trim() !== '') return conversation.title
  const names = otherParticipantNames(conversation)
  if (names.length === 0) return conversation.platform
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
}

/** A message's name on a chip: who sent it and the day, in the reader's zone. */
export function chatMessageChipLabel(message: Pick<Message, 'sender_name' | 'sender_handle' | 'from_self' | 'sent_at'>): string {
  const sender = message.from_self ? 'me' : message.sender_name.trim() || message.sender_handle
  const day = calendarDayOf(Math.floor(message.sent_at / 1000))
  return day ? `${sender} · ${day}` : sender
}

/** A conversation day's name on a chip: the chat and the day. The resolver's
 *  answer for one carries its conversation. */
export function conversationDayChipLabel(day: Pick<ConversationDayWithMessages, 'day' | 'conversation'>): string {
  return `${conversationChipLabel(day.conversation)} · ${day.day}`
}

/** Where the host's day page shows one day, narrowed to one conversation and
 *  scrolled to one record, or '' when the host has no day page. */
export function dayPageHref(dayPagePath: string, day: string, conversationID: string, focusID: string): string {
  if (!dayPagePath || !day) return ''
  const query = conversationID ? `?conversation=${encodeURIComponent(conversationID)}` : ''
  const fragment = focusID ? `#${encodeURIComponent(focusID)}` : ''
  return `${dayPagePath}/${day}${query}${fragment}`
}

/** The day of a conversation's newest message, in the reader's zone: where its
 *  chip opens the day page. '' for a conversation with no messages. */
export function conversationLastDay(conversation: Pick<Conversation, 'last_message_at'>): string {
  return conversation.last_message_at ? calendarDayOf(Math.floor(conversation.last_message_at / 1000)) : ''
}

/** A day's span of a conversation day in words: how many messages. */
export function conversationDayCountLabel(day: Pick<ConversationDay, 'message_count'>): string {
  return `${day.message_count} message${day.message_count === 1 ? '' : 's'}`
}
