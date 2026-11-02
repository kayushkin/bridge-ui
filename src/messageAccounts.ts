// The Conversations page's account picker: the operator's own chats ("Me",
// read from multichat) or what one of their bots sent and received, read
// from message-store. These are the pure rules of the bot view
// (test/messageAccounts.test.ts); BridgeMessageAccountView draws them.
import type { Account, Button, Conversation, Embed, Message } from '@kayushkin/message-store-types'

/** The URL parameter that holds the picked account's id; absent means "Me". */
export const ACCOUNT_PARAMETER = 'account'
/** The URL parameter that holds the open conversation in an account's view. */
export const ACCOUNT_CONVERSATION_PARAMETER = 'conversation'
/** The `kind` message-store gives a bot the user runs (one of its `account_kinds`). */
export const BOT_ACCOUNT_KIND: Account['kind'] = 'bot'
/** How many conversations an account's list asks for. */
export const ACCOUNT_CONVERSATIONS_LIMIT = 500
/** How many messages one page of an account's conversation holds. */
export const ACCOUNT_MESSAGES_PAGE_SIZE = 50

export const ACCOUNTS_PATH = '/accounts'

/** The conversations an account takes part in, newest activity first. */
export function accountConversationsPath(accountID: string): string {
  const query = new URLSearchParams({ account: accountID, limit: String(ACCOUNT_CONVERSATIONS_LIMIT) })
  return `/conversations?${query.toString()}`
}

/** One page of a conversation, newest first; `cursor` is the previous page's `next`. */
export function accountConversationMessagesPath(conversationID: string, cursor?: string | null): string {
  const query = new URLSearchParams({ conversation: conversationID, order: 'newest', limit: String(ACCOUNT_MESSAGES_PAGE_SIZE) })
  if (cursor) query.set('cursor', cursor)
  return `/messages?${query.toString()}`
}

/** The accounts the picker offers beside "Me": the bots, in the store's order. */
export function pickableBotAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter(account => account.kind === BOT_ACCOUNT_KIND)
}

/** The account the URL names, or null for "Me" — and for an id the store
 *  does not list as a bot, which the page reports rather than hides. */
export function pickedBotAccount(accounts: readonly Account[], accountID: string): Account | null {
  if (!accountID) return null
  return pickableBotAccounts(accounts).find(account => account.id === accountID) ?? null
}

/** A conversation's name in an account's list: a group's title, and a direct
 *  message named by whoever in it is not the account. */
export function accountConversationName(conversation: Conversation, account: Account): string {
  if (conversation.is_group) return conversation.title || conversation.id
  const others = (conversation.participants ?? []).filter(participant => participant.handle !== account.handle)
  const names = others.map(participant => participant.display_name || participant.handle)
  return names.length > 0 ? names.join(', ') : conversation.title || conversation.id
}

/** Whether the account sent the message, rather than received or read it. */
export function messageSentByAccount(message: Message, account: Account): boolean {
  return message.sender_handle === account.handle
}

/** The renderer format of a stored message's text: Discord's markdown for a
 *  Discord message, plain text otherwise. */
export function storedMessageFormat(message: Pick<Message, 'source'>): string {
  return message.source === 'discord' ? 'discord-markdown' : ''
}

/** What a message's attachments are called, for a line under its text. */
export function attachmentNamesOf(message: Message): string[] {
  return (message.attachments ?? []).map(attachment => attachment.name || attachment.mime_type || 'a file')
}

/** A web address an embed or button may link to or load: http and https only. */
export function safeWebAddress(address: string | undefined): string | null {
  if (!address) return null
  let parsed: URL
  try {
    parsed = new URL(address)
  } catch {
    return null
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
}

/** A button's chip: its words, and where a link button leads. A button that
 *  runs something on the bot has no link and is drawn but not pressable. */
export function buttonChipOf(button: Button): { text: string; link: string | null; disabled: boolean } {
  const text = [button.emoji, button.label].filter(Boolean).join(' ')
  return { text: text || '(button)', link: button.disabled ? null : safeWebAddress(button.url), disabled: !!button.disabled }
}

/** Whether an embed has anything a reader would see. */
export function embedHasContent(embed: Embed): boolean {
  return !!(embed.title || embed.description || embed.author_name || embed.footer_text || embed.image_url || embed.thumbnail_url
    || (embed.fields ?? []).length > 0)
}

/** Whether a message has nothing to draw at all: no text, file, card or button. */
export function storedMessageIsEmpty(message: Message): boolean {
  return !message.body && attachmentNamesOf(message).length === 0
    && !(message.embeds ?? []).some(embedHasContent) && (message.buttons ?? []).length === 0
}

/** The page's parameters for a picked account: `account` set (or removed for
 *  "Me"), and everything the other view kept dropped, since its rooms and
 *  people mean nothing in the other. */
export function accountPickParameters(accountID: string): URLSearchParams {
  const next = new URLSearchParams()
  if (accountID) next.set(ACCOUNT_PARAMETER, accountID)
  return next
}

/** An account's conversation list with the open one marked by the URL. */
export function accountConversationParameters(accountID: string, conversationID: string): URLSearchParams {
  const next = accountPickParameters(accountID)
  if (conversationID) next.set(ACCOUNT_CONVERSATION_PARAMETER, conversationID)
  return next
}
