// Reactions under a message: how multichat's grouped reactions are found for
// a row, and what each chip shows. The reaction record is multichat's
// (`reactions` on `GET /message-log` and on each conversation message).
import { discordEmojiURL, mediaPathOfMxc } from './messageBody'
import type { MessageReactionGroup } from '@kayushkin/multichat-types'

/** The prefix multichat puts on a custom Discord emoji's reaction key. */
const DISCORD_EMOJI_KEY_PREFIX = 'discord-emoji:'
/** The prefix of an archive row's key in the message log's `reactions` map. */
const DISCORD_MESSAGE_KEY_PREFIX = 'discord:'

/** The key a message-log row's reactions are filed under: the Matrix event id
 *  for a live row, `discord:<discord_message_id>` for an archive row (whose
 *  `event_id` is empty). */
export function reactionMapKeyOf(message: { event_id: string; discord_message_id?: string }): string {
  return message.event_id || (message.discord_message_id ? `${DISCORD_MESSAGE_KEY_PREFIX}${message.discord_message_id}` : '')
}

/** A row's reactions from the page's map, grouped. */
export function reactionsOfLoggedMessage(
  message: { event_id: string; discord_message_id?: string },
  reactions: Readonly<Record<string, readonly MessageReactionGroup[] | null>> | undefined,
): MessageReactionGroup[] {
  const key = reactionMapKeyOf(message)
  return key ? groupReactions(reactions?.[key] ?? []) : []
}

/** One chip per key, in the order each key first appears: counts added and
 *  the reactors' names joined without repeats. multichat already groups, so
 *  on its answer this changes nothing; it keeps two pages' worth of the same
 *  message from drawing a key twice. */
export function groupReactions(reactions: readonly MessageReactionGroup[]): MessageReactionGroup[] {
  const byKey = new Map<string, MessageReactionGroup>()
  for (const reaction of reactions) {
    const seen = byKey.get(reaction.key)
    if (!seen) {
      byKey.set(reaction.key, { ...reaction, sender_display_names: [...(reaction.sender_display_names ?? [])] })
      continue
    }
    seen.count += reaction.count
    if (!seen.shortcode) seen.shortcode = reaction.shortcode
    for (const name of reaction.sender_display_names ?? []) {
      if (!seen.sender_display_names!.includes(name)) seen.sender_display_names!.push(name)
    }
  }
  return [...byKey.values()]
}

/** What a chip draws for its emoji: the unicode text, or an image for a
 *  custom emoji (an `mxc://` key through multichat's media route, a Discord
 *  one from Discord's CDN). A custom key that is not a valid address is drawn
 *  as its shortcode, and failing that as the key itself. */
export type ReactionFace = { kind: 'text'; text: string } | { kind: 'image'; src: string; alt: string }

export function reactionFace(reaction: MessageReactionGroup, multichatBasePath: string): ReactionFace {
  const { key, shortcode } = reaction
  if (key.startsWith('mxc://')) {
    const src = mediaPathOfMxc(multichatBasePath, key)
    return src ? { kind: 'image', src, alt: shortcode || key } : { kind: 'text', text: shortcode || key }
  }
  if (key.startsWith(DISCORD_EMOJI_KEY_PREFIX)) {
    const id = key.slice(DISCORD_EMOJI_KEY_PREFIX.length)
    return /^\d{1,25}$/.test(id) ? { kind: 'image', src: discordEmojiURL(id, false), alt: shortcode || key } : { kind: 'text', text: shortcode || key }
  }
  return { kind: 'text', text: key }
}

/** The chip's tooltip: who reacted when multichat knows, else how many. */
export function reactionTooltip(reaction: MessageReactionGroup): string {
  const emoji = reaction.shortcode || (reaction.key.includes(':') && !reaction.key.startsWith(':') ? 'a custom emoji' : reaction.key)
  const names = reaction.sender_display_names ?? []
  if (names.length > 0) return `${names.join(', ')} reacted with ${emoji}`
  return `${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'} with ${emoji}`
}
