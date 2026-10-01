import { describe, expect, it } from 'vitest'
import type { DiscordCustomEmoji } from '@kayushkin/multichat-types'
import type { BridgeConfig } from '../src/context'
import { BRIDGE_PAGES } from '../src/pages'
import { autoReactionEmojiLabel, autoReactionEmojiOf, autoReactionPersonLabel, memberSearchPath, type AutoReaction } from '../src/autoReactions'

describe('autoReactionEmojiOf', () => {
  it('sends a unicode emoji as itself and a custom one as name:id', () => {
    expect(autoReactionEmojiOf({ kind: 'unicode', key: '🥛', name: 'glass_of_milk' })).toBe('🥛')
    const custom = { discord_emoji_id: '123456789012345678', name: 'milkies' } as DiscordCustomEmoji
    expect(autoReactionEmojiOf({ kind: 'custom', key: 'discord-emoji:123456789012345678', name: 'milkies', emoji: custom })).toBe('milkies:123456789012345678')
  })
})

describe('labels', () => {
  it('shows a custom emoji by name and a unicode one as it is', () => {
    expect(autoReactionEmojiLabel('milkies:123456789012345678')).toBe(':milkies:')
    expect(autoReactionEmojiLabel('🥛')).toBe('🥛')
  })
  it('names the person, or says it has only their id', () => {
    const rule = { discord_user_id: '198680080069689344', member_display_name: '' } as AutoReaction
    expect(autoReactionPersonLabel(rule)).toBe('Discord user 198680080069689344')
    expect(autoReactionPersonLabel({ ...rule, member_display_name: 'Loukic' })).toBe('Loukic')
  })
  it('escapes the search path', () => {
    expect(memberSearchPath('1451516687173156926', 'lou k')).toBe('/guilds/1451516687173156926/members/search?q=lou%20k')
  })
})

describe('the Auto-reactions page', () => {
  it('shows only when the host proxies discord-signup-store and multichat', () => {
    const page = BRIDGE_PAGES.find(p => p.route === 'autoReactions')
    expect(page?.group).toBe('messages')
    const available = (c: Partial<BridgeConfig>) => page?.available?.(c as BridgeConfig, {} as never)
    expect(available({ discordSignupBasePath: '', multichatBasePath: '/api/multichat' })).toBe(false)
    expect(available({ discordSignupBasePath: '/api/discord-signup', multichatBasePath: '' })).toBe(false)
    expect(available({ discordSignupBasePath: '/api/discord-signup', multichatBasePath: '/api/multichat' })).toBe(true)
  })
})
