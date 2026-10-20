import { describe, expect, it } from 'vitest'
import type { ConversationLink } from '@kayushkin/multichat-types'
import {
  conversationAddress, messagesAddressOf, roomShortNames, shortNameRenameBodyOf, shortNameResolvePath, shortNamesPageIsLast,
  shortNamesPagePath, shortNameStoreRefusal, SHORT_NAME_PAGE_SIZE,
} from '../src/messageShortNames'
import type { ShortName } from '../src/types-short-name-store'

const name = (entity_id: string, path: string, overrides: Partial<ShortName> = {}): ShortName => ({
  id: `short_name_${path}`, namespace: 'messages', path, entity_type: 'multichat_room', entity_id,
  created_by: 'multichat-short-namer', reason: 'test', created_at: 1, superseded_at: 0, superseded_by: '', ...overrides,
})

describe('messagesAddressOf', () => {
  it.each([
    ['', { kind: 'none' }],
    ['/', { kind: 'none' }],
    ['kat', { kind: 'path', path: 'kat' }],
    ['kat/', { kind: 'path', path: 'kat' }],
    ['20s30s/general', { kind: 'path', path: '20s30s/general' }],
    ['a/b/c', { kind: 'path', path: 'a/b/c' }],
    // Kept as typed: the store judges spelling, and its answer is shown.
    ['Kat', { kind: 'path', path: 'Kat' }],
    ['a/b/c/d', { kind: 'too-long', path: 'a/b/c/d' }],
  ])('%j reads as %j', (splat, want) => {
    expect(messagesAddressOf(splat)).toEqual(want)
  })
})

describe('the requests', () => {
  it('lists current room names in namespace messages a full page at a time', () => {
    expect(shortNamesPagePath(0)).toBe('/short-names?namespace=messages&entity_type=multichat_room&limit=1000&offset=0')
    expect(shortNamesPagePath(2000)).toContain('offset=2000')
    expect(shortNamesPageIsLast(new Array(SHORT_NAME_PAGE_SIZE).fill(name('!a', 'a')))).toBe(false)
    expect(shortNamesPageIsLast([])).toBe(true)
  })

  it('escapes the slash of a nested path in the resolve query', () => {
    expect(shortNameResolvePath('20s30s/general')).toBe('/short-names/resolve?namespace=messages&path=20s30s%2Fgeneral')
  })
})

describe('roomShortNames', () => {
  it('gives each room its own current name', () => {
    const names = roomShortNames([name('!kat:x', 'kat'), name('!nyc:x', 'nyc')], [])
    expect(names.get('!kat:x')).toEqual({ path: 'kat', namedRoomID: '!kat:x' })
    expect(names.get('!nyc:x')).toEqual({ path: 'nyc', namedRoomID: '!nyc:x' })
    expect(names.has('!other:x')).toBe(false)
  })

  it('leaves out superseded names, other namespaces and other kinds of record', () => {
    const names = roomShortNames([
      name('!old:x', 'kat-old', { superseded_at: 5, superseded_by: 'short_name_kat' }),
      name('!person', 'kat', { entity_type: 'person' }),
      name('!elsewhere', 'kat', { namespace: 'people' }),
    ], [])
    expect(names.size).toBe(0)
  })

  it('lets a linked room with no name show the name of the room in its link that has one', () => {
    const links: ConversationLink[] = [{ id: 7, room_ids: ['!kat-signal:x', '!kat-whatsapp:x', '!kat-discord:x'] }]
    const names = roomShortNames([name('!kat-whatsapp:x', 'kat')], links)
    for (const roomID of links[0].room_ids) expect(names.get(roomID)).toEqual({ path: 'kat', namedRoomID: '!kat-whatsapp:x' })
  })

  it('keeps a linked room\'s own name, and lends the first named room\'s to the rest', () => {
    const links: ConversationLink[] = [{ id: 7, room_ids: ['!a:x', '!b:x', '!c:x'] }]
    const names = roomShortNames([name('!c:x', 'kat-discord'), name('!b:x', 'kat')], links)
    expect(names.get('!a:x')).toEqual({ path: 'kat', namedRoomID: '!b:x' })
    expect(names.get('!b:x')).toEqual({ path: 'kat', namedRoomID: '!b:x' })
    expect(names.get('!c:x')).toEqual({ path: 'kat-discord', namedRoomID: '!c:x' })
  })

  it('names no room of a link where no room has a name', () => {
    expect(roomShortNames([name('!z:x', 'z')], [{ id: 1, room_ids: ['!a:x', '!b:x'] }]).has('!a:x')).toBe(false)
  })
})

describe('conversationAddress', () => {
  const links: ConversationLink[] = [{ id: 7, room_ids: ['!a:x', '!b:x'] }]
  const names = roomShortNames([name('!b:x', '20s30s/general'), name('!kat:x', 'kat')], links)

  it('opens a named room at its name', () => {
    expect(conversationAddress('/messages', '!kat:x', names)).toBe('/messages/kat')
    expect(conversationAddress('/messages', '!b:x', names)).toBe('/messages/20s30s/general')
  })

  it('opens a room with a borrowed name at that name, with ?room= for the tab', () => {
    expect(conversationAddress('/messages', '!a:x', names)).toBe('/messages/20s30s/general?room=%21a%3Ax')
  })

  it('opens a room with no name at ?room=', () => {
    expect(conversationAddress('/messages', '!none:x', names)).toBe('/messages?room=%21none%3Ax')
  })

  it('keeps the page\'s other parameters and drops an old room', () => {
    expect(conversationAddress('/messages', '!kat:x', names, new URLSearchParams('room=%21old&q=hi'))).toBe('/messages/kat?q=hi')
  })
})

describe('shortNameRenameBodyOf', () => {
  it('posts the typed path for the room, leaving created_by to the host', () => {
    const result = shortNameRenameBodyOf('!kat:x', '  kat-moreno ')
    expect(result).toEqual({ ok: true, body: {
      namespace: 'messages', path: 'kat-moreno', entity_type: 'multichat_room', entity_id: '!kat:x', reason: 'renamed by the operator in dash',
    } })
    expect(result.ok && 'created_by' in result.body).toBe(false)
  })

  it('takes the messages/ the header shows', () => {
    const result = shortNameRenameBodyOf('!r', 'messages/20s30s/general')
    expect(result.ok && result.body.path).toBe('20s30s/general')
    const slashed = shortNameRenameBodyOf('!r', '/messages/kat')
    expect(slashed.ok && slashed.body.path).toBe('kat')
  })

  it('refuses an empty name before asking the store', () => {
    expect(shortNameRenameBodyOf('!r', '  ').ok).toBe(false)
    expect(shortNameRenameBodyOf('!r', 'messages/').ok).toBe(false)
  })
})

describe('shortNameStoreRefusal', () => {
  it('shows the store\'s error as it gave it', () => {
    expect(shortNameStoreRefusal(409, '{"error":"messages/kat belongs to another record"}')).toBe('409: messages/kat belongs to another record')
  })
  it('shows a body that is not the store\'s shape whole', () => {
    expect(shortNameStoreRefusal(502, 'short-name-store unavailable\n')).toBe('502: short-name-store unavailable')
    expect(shortNameStoreRefusal(400, '{"message":"x"}')).toBe('400: {"message":"x"}')
  })
})
