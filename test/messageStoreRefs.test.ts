import { describe, expect, it } from 'vitest'
import {
  chatMessageChipLabel, chatPlatformGlyph, conversationChipLabel, conversationDayChipLabel, dayPageHref, otherParticipantNames,
} from '../src/messageStoreRefs'

const participant = (display_name: string, is_self = false) => ({ handle: `h-${display_name}`, display_name, person_id: '', is_self })

describe('message-store chips', () => {
  it('names a conversation by its title, else who it is with', () => {
    expect(conversationChipLabel({ title: 'Reno house', participants: [], platform: 'discord' })).toBe('Reno house')
    expect(conversationChipLabel({ title: '', participants: [participant('me', true), participant('Kat')], platform: 'sms' })).toBe('Kat')
    const many = ['A', 'B', 'C', 'D', 'E'].map(n => participant(n))
    expect(conversationChipLabel({ title: '', participants: many, platform: 'sms' })).toBe('A, B, C and 2 more')
    expect(conversationChipLabel({ title: '', participants: [participant('me', true)], platform: 'sms' })).toBe('sms')
  })
  it('leaves the user out of who a conversation is with, and uses the handle when there is no name', () => {
    expect(otherParticipantNames({ participants: [participant('me', true), { handle: '+15550001', display_name: ' ', person_id: '', is_self: false }] })).toEqual(['+15550001'])
  })
  it('names a message by its sender, the user as me', () => {
    expect(chatMessageChipLabel({ sender_name: 'Kat', sender_handle: 'k', from_self: false, sent_at: 1300000000000 })).toMatch(/^Kat · 2011-03-1[23]$/)
    expect(chatMessageChipLabel({ sender_name: 'Slava', sender_handle: 's', from_self: true, sent_at: 1300000000000 })).toMatch(/^me · /)
  })
  it('names a conversation day by its chat and day', () => {
    expect(conversationDayChipLabel({ day: '2020-01-02', conversation: { title: 'Kat', participants: [], platform: 'sms' } as never })).toBe('Kat · 2020-01-02')
  })
  it('links to the host day page, or nowhere', () => {
    expect(dayPageHref('/day', '2020-01-02', 'conversation_000001', 'chat_message_000009')).toBe('/day/2020-01-02?conversation=conversation_000001#chat_message_000009')
    expect(dayPageHref('/day', '2020-01-02', '', '')).toBe('/day/2020-01-02')
    expect(dayPageHref('', '2020-01-02', 'c', 'm')).toBe('')
    expect(dayPageHref('/day', '', 'c', 'm')).toBe('')
  })
  it('draws a glyph per app', () => {
    expect(chatPlatformGlyph('sms')).toBe('📱')
    expect(chatPlatformGlyph('something-new')).toBe('💬')
  })
})
