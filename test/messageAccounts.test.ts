import { describe, expect, it } from 'vitest'
import type { Account, Conversation, Message } from '@kayushkin/message-store-types'
import {
  accountConversationMessagesPath, accountConversationName, accountConversationParameters, accountConversationsPath, accountPickParameters,
  attachmentNamesOf, buttonChipOf, embedHasContent, messageSentByAccount, pickableBotAccounts, pickedBotAccount, safeWebAddress,
  storedMessageFormat, storedMessageIsEmpty,
} from '../src/messageAccounts'

const account = (id: string, handle: string, kind: string, display_name = handle): Account =>
  ({ id, platform: 'discord', handle, display_name, kind, created_at: 1, updated_at: 1 })
const bot = account('message_account_000002', '200', 'bot', 'Helper')
const otherBot = account('message_account_000003', '300', 'bot', 'Planner')
const user = account('message_account_000001', '100', 'user', 'Me')

const participant = (handle: string, display_name: string, is_self = false) => ({ handle, display_name, person_id: '', is_self })
const conversation = (extra: Partial<Conversation>): Conversation => ({
  id: 'conversation_000001', platform: 'discord', source: 'discord', source_ref: 'channel', title: '', is_group: false,
  participants: [], message_count: 3, first_message_at: 1, last_message_at: 2, created_at: 1, updated_at: 1, ...extra,
})
const message = (extra: Partial<Message>): Message => ({
  id: 'chat_message_000001', conversation_id: 'conversation_000001', sent_at: 1, sender_handle: '200', sender_name: 'Helper',
  sender_person_id: '', from_self: false, kind: 'text', body: '', attachments: [], embeds: [], buttons: [],
  source: 'discord', source_ref: 'm1', imported_by: 'test', ...extra,
})

describe('the account picker', () => {
  it('offers only bots, in the store order', () => {
    expect(pickableBotAccounts([user, bot, otherBot]).map(a => a.id)).toEqual([bot.id, otherBot.id])
  })
  it('finds the picked bot, and nothing for "Me", a user account or an unknown id', () => {
    expect(pickedBotAccount([user, bot], bot.id)).toBe(bot)
    expect(pickedBotAccount([user, bot], '')).toBeNull()
    expect(pickedBotAccount([user, bot], user.id)).toBeNull()
    expect(pickedBotAccount([user, bot], 'message_account_000099')).toBeNull()
  })
  it('keeps only the account and its open conversation in the URL', () => {
    expect(accountPickParameters('').toString()).toBe('')
    expect(accountPickParameters(bot.id).toString()).toBe('account=message_account_000002')
    expect(accountConversationParameters(bot.id, 'conversation_000004').toString()).toBe('account=message_account_000002&conversation=conversation_000004')
    expect(accountConversationParameters(bot.id, '').toString()).toBe('account=message_account_000002')
  })
})

describe('message-store paths', () => {
  it('asks for an account’s conversations and a conversation’s pages newest first', () => {
    expect(accountConversationsPath(bot.id)).toBe('/conversations?account=message_account_000002&limit=500')
    expect(accountConversationMessagesPath('conversation_000001')).toBe('/messages?conversation=conversation_000001&order=newest&limit=50')
    expect(accountConversationMessagesPath('conversation_000001', 'abc')).toBe('/messages?conversation=conversation_000001&order=newest&limit=50&cursor=abc')
  })
})

describe('accountConversationName', () => {
  it('names a direct message by whoever is not the bot', () => {
    const direct = conversation({ title: 'Helper', participants: [participant('100', 'Pat', true), participant('200', 'Helper')] })
    expect(accountConversationName(direct, bot)).toBe('Pat')
  })
  it('names a group by its title', () => {
    expect(accountConversationName(conversation({ is_group: true, title: 'general', participants: [participant('200', 'Helper')] }), bot)).toBe('general')
  })
  it('falls to the title, then the id, when nobody else is known', () => {
    expect(accountConversationName(conversation({ title: 'kept', participants: [participant('200', 'Helper')] }), bot)).toBe('kept')
    expect(accountConversationName(conversation({ participants: [] }), bot)).toBe('conversation_000001')
  })
})

describe('a stored message in a bot’s view', () => {
  it('is the bot’s when the bot’s handle sent it, whoever the operator is', () => {
    expect(messageSentByAccount(message({ sender_handle: '200', from_self: false }), bot)).toBe(true)
    expect(messageSentByAccount(message({ sender_handle: '100', from_self: true }), bot)).toBe(false)
  })
  it('renders Discord text as Discord markdown', () => {
    expect(storedMessageFormat({ source: 'discord' })).toBe('discord-markdown')
    expect(storedMessageFormat({ source: 'whatsapp' })).toBe('')
  })
  it('names its attachments', () => {
    expect(attachmentNamesOf(message({ attachments: [{ name: 'a.png' }, { mime_type: 'image/gif' }, {}] }))).toEqual(['a.png', 'image/gif', 'a file'])
  })
  it('is not empty when a card or a button is all it has', () => {
    expect(storedMessageIsEmpty(message({}))).toBe(true)
    expect(storedMessageIsEmpty(message({ embeds: [{}] }))).toBe(true)
    expect(storedMessageIsEmpty(message({ embeds: [{ fields: [{ name: 'When', value: 'Friday' }] }] }))).toBe(false)
    expect(storedMessageIsEmpty(message({ buttons: [{ label: 'Join' }] }))).toBe(false)
  })
  it('counts an embed with only fields as content', () => {
    expect(embedHasContent({ fields: [{ name: 'Where', value: 'Here', inline: true }] })).toBe(true)
    expect(embedHasContent({ url: 'https://example.com' })).toBe(false)
  })
})

describe('buttons and links', () => {
  it('links only http and https', () => {
    expect(safeWebAddress('https://example.com/a')).toBe('https://example.com/a')
    expect(safeWebAddress('javascript:alert(1)')).toBeNull()
    expect(safeWebAddress('not a url')).toBeNull()
    expect(safeWebAddress(undefined)).toBeNull()
  })
  it('makes a link button a link and an action button a chip', () => {
    expect(buttonChipOf({ label: 'Open', emoji: '🔗', url: 'https://example.com' })).toEqual({ text: '🔗 Open', link: 'https://example.com/', disabled: false })
    expect(buttonChipOf({ label: 'Join' })).toEqual({ text: 'Join', link: null, disabled: false })
    expect(buttonChipOf({ label: 'Closed', url: 'https://example.com', disabled: true })).toEqual({ text: 'Closed', link: null, disabled: true })
  })
})
