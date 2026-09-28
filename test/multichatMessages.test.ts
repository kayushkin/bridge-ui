import { describe, expect, it } from 'vitest'
import { DEFAULT_BRIDGE_ROUTES, type BridgeConfig } from '../src/context'
import { groupForPath, navEntriesFor } from '../src/pages'
import {
  MESSAGE_PAGE_SIZE, contactListPlatforms, contactTagAssignBody, contactTagRemovePath, contactTags, conversationMessagesPath,
  conversationPlatforms, conversationSendPath, conversationTags, filterContacts, filterConversations, highlightSegments,
  mergeNewestMessages, messageTimeLabel, orderedSearchGroups, pageMessages, prependOlderMessages, sameMessages,
  searchPath, sendMessageBodyOf, tagCreateBodyOf, tagDeletePath,
} from '../src/multichatMessages'
import type {
  MultichatContactTagMap, MultichatConversation, MultichatMessage, MultichatTag, MultichatUnifiedContact,
} from '../src/types-multichat'

const DEFAULT_CONFIG: Partial<BridgeConfig> = { fetch: async () => new Response(), basePath: '/api/bridge', routes: DEFAULT_BRIDGE_ROUTES }
const ROOM = '!yyPKASKymivfZvWbDf:chat.kayushkin.com'
const message = (event_id: string, timestamp: number, extra: Partial<MultichatMessage> = {}): MultichatMessage =>
  ({ event_id, sender: '@whatsapp_1:chat.kayushkin.com', body: event_id, msg_type: 'm.text', timestamp, ...extra })
const ids = (messages: readonly MultichatMessage[]) => messages.map(m => m.event_id)

describe('message paths and bodies', () => {
  it('encodes the room id as one path segment', () => {
    expect(conversationMessagesPath(ROOM)).toBe(`/conversations/!yyPKASKymivfZvWbDf%3Achat.kayushkin.com/messages?limit=${MESSAGE_PAGE_SIZE}`)
    expect(conversationSendPath(ROOM)).toBe('/conversations/!yyPKASKymivfZvWbDf%3Achat.kayushkin.com/send')
  })

  it('passes the end token of the page after as from', () => {
    expect(conversationMessagesPath(ROOM, 't18-9615_0_0')).toMatch(/\?limit=50&from=t18-9615_0_0$/)
    expect(conversationMessagesPath(ROOM, null)).not.toContain('from=')
  })

  it('trims a send and refuses an empty one', () => {
    expect(sendMessageBodyOf('  on my way \n')).toEqual({ ok: true, body: { body: 'on my way' } })
    expect(sendMessageBodyOf(' \n ')).toEqual({ ok: false, error: 'Nothing to send.' })
  })

  it('reads a page with no messages as empty', () => {
    expect(pageMessages({ messages: null, has_more: false })).toEqual([])
  })
})

describe('merging pages', () => {
  it('puts an older page in front and keeps a message on both sides once', () => {
    const shown = [message('c', 3), message('d', 4)]
    const older = [message('a', 1), message('b', 2), message('c', 3)]
    expect(ids(prependOlderMessages(shown, older))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps the pages loaded further back when the newest page is polled', () => {
    const shown = [message('a', 1), message('b', 2), message('c', 3)]
    const newest = [message('b', 2), message('c', 3), message('d', 4)]
    expect(ids(mergeNewestMessages(shown, newest))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('lets the newest page replace what it covers, so a deleted message goes', () => {
    const shown = [message('a', 1), message('b', 2), message('gone', 3), message('c', 4)]
    const newest = [message('b', 2), message('c', 4)]
    expect(ids(mergeNewestMessages(shown, newest))).toEqual(['a', 'b', 'c'])
  })

  it('keeps what is shown when the newest page is empty', () => {
    const shown = [message('a', 1)]
    expect(ids(mergeNewestMessages(shown, []))).toEqual(['a'])
  })

  it('tells an unchanged list from a changed one by event id and order', () => {
    expect(sameMessages([message('a', 1), message('b', 2)], [message('a', 1), message('b', 2)])).toBe(true)
    expect(sameMessages([message('a', 1), message('b', 2)], [message('b', 2), message('a', 1)])).toBe(false)
    expect(sameMessages([message('a', 1)], [message('a', 1), message('b', 2)])).toBe(false)
  })

  it('counts a changed reaction as a change, so the poll redraws it', () => {
    const thumbs = { key: '\u{1F44D}', shortcode: '', count: 1, sender_display_names: ['Ann'] }
    expect(sameMessages([message('a', 1, { reactions: [thumbs] })], [message('a', 1, { reactions: [thumbs] })])).toBe(true)
    expect(sameMessages([message('a', 1)], [message('a', 1, { reactions: [thumbs] })])).toBe(false)
    expect(sameMessages([message('a', 1, { reactions: [thumbs] })], [message('a', 1, { reactions: [{ ...thumbs, count: 2 }] })])).toBe(false)
  })
})

const conversation = (room_id: string, name: string, extra: Partial<MultichatConversation> = {}): MultichatConversation =>
  ({ room_id, name, member_count: 2, last_activity: 0, ...extra })
const tag = (id: number, name: string): MultichatTag => ({ id, name, color: '#f5d40c' })

describe('the conversation list', () => {
  const conversations = [
    conversation('!1', 'Alvaro Lopez', { platform: 'whatsapp', last_message: 'Invoice attached', member_ids: ['@whatsapp_1', '@meta_1'] }),
    conversation('!2', '#food', { platform: 'discord', last_message: 'Where is this?' }),
    conversation('!3', 'No platform yet'),
  ]

  it('lists each app once, sorted, and skips a room with none', () => {
    expect(conversationPlatforms(conversations)).toEqual(['discord', 'whatsapp'])
  })

  it('filters by app and by name or last message, in any case', () => {
    expect(filterConversations(conversations, { platform: 'discord', text: '' }).map(c => c.room_id)).toEqual(['!2'])
    expect(filterConversations(conversations, { platform: '', text: 'INVOICE' }).map(c => c.room_id)).toEqual(['!1'])
    expect(filterConversations(conversations, { platform: '', text: ' food ' }).map(c => c.room_id)).toEqual(['!2'])
    expect(filterConversations(conversations, { platform: '', text: '' })).toHaveLength(3)
  })

  it("gathers a room's tags from its members' identities, once each, by name", () => {
    const tagMap: MultichatContactTagMap = { '@whatsapp_1': [tag(2, 'Reefer'), tag(1, 'LTL')], '@meta_1': [tag(1, 'LTL')] }
    expect(conversationTags(conversations[0], tagMap).map(t => t.name)).toEqual(['LTL', 'Reefer'])
    expect(conversationTags(conversations[1], tagMap)).toEqual([])
  })
})

describe('search', () => {
  it('refuses an empty term and encodes the rest', () => {
    expect(searchPath('   ')).toBeNull()
    expect(searchPath(' rate & time ')).toBe('/search?q=rate+%26+time')
  })

  it('orders groups by their newest hit and hits newest first', () => {
    const hit = (event_id: string, timestamp: number) =>
      ({ event_id, timestamp, room_id: '', room_name: '', platform: '', sender_name: '', body: '' })
    const ordered = orderedSearchGroups({
      query: 'x', total: 3,
      groups: [
        { room_id: '!old', room_name: 'old', platform: 'signal', results: [hit('o1', 10)] },
        { room_id: '!new', room_name: 'new', platform: 'whatsapp', results: [hit('n1', 20), hit('n2', 30)] },
        { room_id: '!none', room_name: 'none', platform: 'discord', results: null },
      ],
    })
    expect(ordered.map(g => g.room_id)).toEqual(['!new', '!old', '!none'])
    expect(ordered[0].results.map(h => h.event_id)).toEqual(['n2', 'n1'])
  })

  it('reads a null group list as none', () => {
    expect(orderedSearchGroups({ query: 'x', total: 0, groups: null })).toEqual([])
  })

  it('marks every match in any case and treats the term as plain text', () => {
    expect(highlightSegments('Rate? rate. RATE', 'rate')).toEqual([
      { text: 'Rate', match: true }, { text: '? ', match: false }, { text: 'rate', match: true },
      { text: '. ', match: false }, { text: 'RATE', match: true },
    ])
    expect(highlightSegments('costs $5 (maybe)', '(maybe')).toEqual([
      { text: 'costs $5 ', match: false }, { text: '(maybe', match: true }, { text: ')', match: false },
    ])
    expect(highlightSegments('nothing here', '')).toEqual([{ text: 'nothing here', match: false }])
  })
})

describe('contacts and tags', () => {
  const alvaro: MultichatUnifiedContact = {
    display_name: 'Alvaro Lopez',
    identities: [
      { user_id: '@whatsapp_15614001607:chat.kayushkin.com', platform: 'whatsapp' },
      { user_id: '@meta_621211729:chat.kayushkin.com', platform: 'meta' },
    ],
  }
  const slava: MultichatUnifiedContact = {
    display_name: 'Slava',
    identities: [{ user_id: '@discord_110122051179687936:chat.kayushkin.com', platform: 'discord' }],
  }
  const tagMap: MultichatContactTagMap = {
    '@meta_621211729:chat.kayushkin.com': [tag(4, 'Green Card')],
    '@whatsapp_15614001607:chat.kayushkin.com': [tag(4, 'Green Card'), tag(1, 'LTL')],
  }
  const none = { text: '', platform: '', tagID: null, onSeveralApps: false }

  it("shows a contact's tags from all its identities, once each", () => {
    expect(contactTags(alvaro, tagMap).map(t => t.id)).toEqual([4, 1])
    expect(contactTags(slava, tagMap)).toEqual([])
  })

  it('filters by name or user id, app, tag and being on several apps', () => {
    const contacts = [alvaro, slava]
    expect(filterContacts(contacts, tagMap, none)).toHaveLength(2)
    expect(filterContacts(contacts, tagMap, { ...none, text: 'slav' })).toEqual([slava])
    expect(filterContacts(contacts, tagMap, { ...none, text: '15614001607' })).toEqual([alvaro])
    expect(filterContacts(contacts, tagMap, { ...none, platform: 'discord' })).toEqual([slava])
    expect(filterContacts(contacts, tagMap, { ...none, tagID: 1 })).toEqual([alvaro])
    expect(filterContacts(contacts, tagMap, { ...none, onSeveralApps: true })).toEqual([alvaro])
  })

  it('lists every app any contact is on', () => {
    expect(contactListPlatforms([alvaro, slava])).toEqual(['discord', 'meta', 'whatsapp'])
  })

  it('puts a tag on one identity by its user id and takes it off by query', () => {
    expect(contactTagAssignBody('@meta_621211729:chat.kayushkin.com', 4)).toEqual({ contact_user_id: '@meta_621211729:chat.kayushkin.com', tag_id: 4 })
    expect(contactTagRemovePath('@meta_621211729:chat.kayushkin.com', 4)).toBe('/contacts/tags?contact=%40meta_621211729%3Achat.kayushkin.com&tag=4')
    expect(tagDeletePath(7)).toBe('/tags?id=7')
  })

  it('names a new tag, and refuses an empty or taken name', () => {
    expect(tagCreateBodyOf('  Flatbed ', [tag(1, 'LTL')])).toEqual({ ok: true, body: { name: 'Flatbed' } })
    expect(tagCreateBodyOf(' ', [])).toEqual({ ok: false, error: 'A tag needs a name.' })
    expect(tagCreateBodyOf('LTL', [tag(1, 'LTL')])).toEqual({ ok: false, error: 'There is already a tag named "LTL".' })
  })
})

describe('messageTimeLabel', () => {
  it('shows the time alone for today and adds the date otherwise', () => {
    const now = new Date(2026, 8, 28, 15, 0)
    const today = messageTimeLabel(new Date(2026, 8, 28, 9, 30).getTime(), now)
    const earlier = messageTimeLabel(new Date(2026, 8, 20, 9, 30).getTime(), now)
    const lastYear = messageTimeLabel(new Date(2025, 8, 20, 9, 30).getTime(), now)
    expect(earlier.endsWith(today)).toBe(true)
    expect(earlier.length).toBeGreaterThan(today.length)
    expect(lastYear).toContain('2025')
  })
})

describe('the Messages group in the registry', () => {
  const config = (multichatBasePath: string) => ({ ...DEFAULT_CONFIG, multichatBasePath }) as BridgeConfig
  const flags = { showConformance: false, showServiceInventory: false }

  it('lists its pages only where the host proxies multichat', () => {
    const labelsOf = (base: string) => navEntriesFor(config(base), flags).filter(e => e.group === 'messages').map(e => e.label)
    expect(labelsOf('')).toEqual([])
    expect(labelsOf('/api/multichat')).toEqual(['Conversations', 'Search', 'Contacts', 'Discord'])
  })

  it('lights up Messages on every page of it, and Conversations only on its own path', () => {
    expect(groupForPath('/messages', DEFAULT_BRIDGE_ROUTES)).toBe('messages')
    expect(groupForPath('/messages/search', DEFAULT_BRIDGE_ROUTES)).toBe('messages')
    expect(groupForPath('/messages/contacts', DEFAULT_BRIDGE_ROUTES)).toBe('messages')
    const conversations = navEntriesFor(config('/api/multichat'), flags).find(e => e.label === 'Conversations')
    expect(conversations?.end).toBe(true)
  })
})
