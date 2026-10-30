import { describe, expect, it } from 'vitest'
import type { ConversationLink } from '@kayushkin/multichat-types'
import {
  addToPersonChatsBody, chatLabel, conversationListRowOf, conversationListRows, defaultSendRoom, mergedHorizon, mergedMessages,
  peopleInRoom, personOtherChats, roomOwners, roomsToPageBack, type LoadedRoom, type MergedMessage,
} from '../src/conversationPeople'
import type { MultichatConversation, MultichatMessage, MultichatUnifiedContact } from '../src/types-multichat'

const room = (room_id: string, last_activity: number, extra: Partial<MultichatConversation> = {}): MultichatConversation =>
  ({ room_id, name: room_id, member_count: 2, last_activity, visibility: 'auto', hidden: false, ...extra }) as MultichatConversation
const identity = (user_id: string, platform: string) => ({ user_id, platform, display_name: user_id })
const sam: MultichatUnifiedContact = {
  person_id: 'person_000001', display_name: 'Sam',
  identities: [identity('@discord_1:x', 'discord'), identity('@gmessages_1:x', 'gmessages'), identity('@web_1:x', 'gmessagesweb')],
} as MultichatUnifiedContact
const kim: MultichatUnifiedContact = { display_name: 'Kim', identities: [identity('@whatsapp_2:x', 'whatsapp')] } as MultichatUnifiedContact
const member = (user_id: string) => ({ user_id, display_name: user_id })

const samDiscord = room('!dm-discord', 300, { platform: 'discord', direct_message_partner_user_id: '@discord_1:x', members: [member('@discord_1:x')] })
const samSMS = room('!dm-sms', 100, { platform: 'gmessages', direct_message_partner_user_id: '@gmessages_1:x', members: [member('@gmessages_1:x')] })
// The web bridge does not mark one-to-one rooms; this one is joined by a link.
const samWeb = room('!web', 250, { platform: 'gmessagesweb', members: [member('@web_1:x')] })
const group = room('!group', 400, { platform: 'gmessages', member_count: 4, members: [member('@gmessages_1:x'), member('@whatsapp_2:x')] })
const kimDM = room('!kim', 200, { platform: 'whatsapp', direct_message_partner_user_id: '@whatsapp_2:x', members: [member('@whatsapp_2:x')] })
const stranger = room('!stranger', 50, { platform: 'whatsapp', direct_message_partner_user_id: '@whatsapp_9:x' })
const all = [samDiscord, samSMS, samWeb, group, kimDM, stranger]
const links: ConversationLink[] = [{ id: 1, room_ids: ['!dm-discord', '!web'] }] as ConversationLink[]
const contacts = [sam, kim]

describe('who a room belongs to', () => {
  it('gives a one-to-one room to its partner, and a linked room to the same person', () => {
    const owners = roomOwners(all, links, contacts)
    expect(owners.get('!dm-discord')).toBe(sam)
    expect(owners.get('!dm-sms')).toBe(sam)
    expect(owners.get('!web')).toBe(sam)
    expect(owners.get('!kim')).toBe(kim)
    expect(owners.has('!group')).toBe(false)
    expect(owners.has('!stranger')).toBe(false)
  })
})

describe('the list', () => {
  it('has one row per person holding all their chats, rooms apart, newest first', () => {
    const rows = conversationListRows(all, all, links, contacts)
    expect(rows.map(row => row.key)).toEqual(['room:!group', 'person:person_000001', 'person:@whatsapp_2:x', 'room:!stranger'])
    expect(rows[1].chats.map(chat => chat.room_id)).toEqual(['!dm-discord', '!web', '!dm-sms'])
  })

  it('shows a person when any one of their chats matches, with every chat', () => {
    const rows = conversationListRows(all, [samSMS], links, contacts)
    expect(rows).toHaveLength(1)
    expect(rows[0].chats).toHaveLength(3)
  })

  it('finds a person by name when no chat of theirs is named for them', () => {
    const rows = conversationListRows(all, [], links, contacts, { text: 'sam', matchingAllButText: all })
    expect(rows.map(row => row.key)).toEqual(['person:person_000001'])
    expect(conversationListRows(all, [], links, contacts, { text: 'sam', matchingAllButText: [group] })).toEqual([])
  })

  it('finds the row a room is in', () => {
    const rows = conversationListRows(all, all, links, contacts)
    expect(conversationListRowOf(rows, '!web')?.key).toBe('person:person_000001')
    expect(conversationListRowOf(rows, '!nowhere')).toBeNull()
  })
})

describe('a person\'s other chats', () => {
  it('lists every other room any of their accounts is in', () => {
    expect(personOtherChats(sam, [samDiscord, samWeb, samSMS], all).map(chat => chat.room_id)).toEqual(['!group'])
  })

  it('names the people in a room', () => {
    expect(peopleInRoom(group, contacts)).toEqual([sam, kim])
  })

  it('links a room to the chat already in a link, else to the newest', () => {
    expect(addToPersonChatsBody('!group', [samSMS, samDiscord], links)).toEqual({ room_ids: ['!dm-discord', '!group'] })
    expect(addToPersonChatsBody('!group', [samSMS, kimDM], [])).toEqual({ room_ids: ['!kim', '!group'] })
    expect(addToPersonChatsBody('!group', [], [])).toBeNull()
  })

  it('labels a chat by app, with its name when two share an app', () => {
    expect(chatLabel([samDiscord, samSMS], samDiscord)).toBe('discord')
    expect(chatLabel([samSMS, group], samSMS)).toBe('gmessages · !dm-sms')
  })
})

const message = (event_id: string, timestamp: number, extra: Partial<MultichatMessage> = {}): MultichatMessage =>
  ({ event_id, sender: '@x', body: event_id, msg_type: 'm.text', timestamp, ...extra })

describe('the merged thread', () => {
  const busy: LoadedRoom = { roomID: '!a', messages: [message('a1', 500), message('a2', 600)], hasOlder: true }
  const quiet: LoadedRoom = { roomID: '!b', messages: [message('b1', 100), message('b2', 550)], hasOlder: false }

  it('starts where a room with older pages stops, so no room shows a gap', () => {
    expect(mergedHorizon([busy, quiet])).toBe(500)
    expect(mergedMessages([busy, quiet]).map(m => `${m.roomID}:${m.event_id}`)).toEqual(['!a:a1', '!b:b2', '!a:a2'])
  })

  it('shows everything once every room is loaded to its start', () => {
    expect(mergedHorizon([{ ...busy, hasOlder: false }, quiet])).toBe(0)
    expect(mergedMessages([{ ...busy, hasOlder: false }, quiet])).toHaveLength(4)
  })

  it('pages back the rooms that set the horizon', () => {
    expect(roomsToPageBack([busy, quiet])).toEqual(['!a'])
    expect(roomsToPageBack([{ ...busy, hasOlder: false }, quiet])).toEqual([])
  })

  it('folds edits per room', () => {
    const edited: LoadedRoom = { roomID: '!c', hasOlder: false, messages: [message('c1', 10), message('c2', 20, { replaces_event_id: 'c1', body: 'fixed' })] }
    expect(mergedMessages([edited]).map(m => [m.body, m.edited])).toEqual([['fixed', true]])
  })

  it('sends to the room the other person last wrote in, else the newest chat', () => {
    const merged = (roomID: string, is_me: boolean, timestamp: number) => ({ ...message('m', timestamp, { is_me }), edited: false, roomID }) as MergedMessage
    expect(defaultSendRoom([samDiscord, samSMS], [merged('!dm-sms', false, 1), merged('!dm-discord', true, 2)])).toBe('!dm-sms')
    expect(defaultSendRoom([samSMS, samDiscord], [])).toBe('!dm-discord')
  })
})
