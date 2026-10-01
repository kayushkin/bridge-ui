// The Event-Manager bot's auto-reactions: it reacts with an emoji to every
// message one person posts in one Discord server. discord-signup-store owns the
// rules (its CONTRACT.md, "/api/auto-reactions"); the host proxies the routes
// below at `discordSignupBasePath` (dash: "/api/discord-signup"). No React
// here, so the bodies are pinned by tests without a DOM.

import type { EmojiChoice } from './emojiCatalog'

/** One rule as discord-signup-store answers it. The two names are for display,
 *  read by the store from what it has seen; "" when it has not. */
export interface AutoReaction {
  id: number
  guild_id: string
  guild_name: string
  discord_user_id: string
  member_display_name: string
  emoji: string
  enabled: boolean
  reaction_count: number
  last_reacted_at: number
  last_error: string
  last_error_at: number
  created_at: number
  updated_at: number
}

/** A server the bot is in. */
export interface DiscordSignupGuild {
  id: string
  name: string
}

/** One answer from the member search. */
export interface DiscordSignupMember {
  user_id: string
  display_name: string
  username: string
  avatar_url?: string
}

/** The body of `POST /auto-reactions`. */
export interface CreateAutoReactionBody {
  guild_id: string
  discord_user_id: string
  member_display_name: string
  emoji: string
  enabled: boolean
}

/** Every route the page calls, relative to `discordSignupBasePath`; dash's
 *  `discordSignupProxiedRoutes` must carry each. */
export const AUTO_REACTION_ROUTES_CALLED = [
  'GET /auto-reactions',
  'POST /auto-reactions',
  'PATCH /auto-reactions/{id}',
  'DELETE /auto-reactions/{id}',
  'GET /guilds',
  'GET /guilds/{guildID}/members/search',
] as const

/** What the bot sends Discord for a picked emoji: the character itself, or a
 *  custom emoji as name:id, which Discord's reaction route takes. The bot can
 *  only use a custom emoji from a server it is in. */
export function autoReactionEmojiOf(choice: EmojiChoice): string {
  return choice.kind === 'unicode' ? choice.key : `${choice.emoji.name}:${choice.emoji.discord_emoji_id}`
}

/** A custom emoji rule's emoji is name:id; anything else is shown as it is. */
export function autoReactionEmojiLabel(emoji: string): string {
  const custom = /^([A-Za-z0-9_]+):\d+$/.exec(emoji)
  return custom ? `:${custom[1]}:` : emoji
}

/** Who the rule is for, as the page shows it. */
export function autoReactionPersonLabel(rule: AutoReaction): string {
  return rule.member_display_name || `Discord user ${rule.discord_user_id}`
}

export function memberSearchPath(guildID: string, query: string): string {
  return `/guilds/${encodeURIComponent(guildID)}/members/search?q=${encodeURIComponent(query)}`
}
