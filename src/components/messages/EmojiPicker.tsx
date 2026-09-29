import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DiscordCustomEmoji } from '@kayushkin/multichat-types'
import { useBridgeConfig } from '../../context'
import {
  customChoice, customEmojiImageURL, customEmojiOffered, favoriteChoices, searchEmojiChoices, unicodeChoices,
  unicodeNamesOf, type EmojiChoice,
} from '../../emojiCatalog'
import { useEmojiCatalog, useEmojiGroups } from './useEmojiCatalog'
import styles from './Messages.module.css'

/** What a pick is for. A reaction can be any emoji the room is offered; a
 *  message can carry only unicode ones, because the Discord bridge cannot send
 *  a custom emoji inside a message. */
export type EmojiPurpose = 'reaction' | 'message'

/** How one emoji is drawn: its text, or a custom emoji's image. */
export function EmojiFace({ choice, className }: { choice: EmojiChoice; className?: string }) {
  if (choice.kind === 'custom') {
    return <img className={`${styles.customEmoji} ${className ?? ''}`} src={customEmojiImageURL(choice.emoji)} alt={`:${choice.name}:`} loading="lazy" />
  }
  return <span className={className}>{choice.key}</span>
}

/**
 * What a room's pickers offer: the unicode emoji in the chosen skin tone, the
 * custom emoji of the room's Discord server (and of every other bridged
 * server when the setting says so), and the favourites among those.
 */
export function useEmojiChoices(purpose: EmojiPurpose, roomDiscordServerID: string | null) {
  const { groups, error: groupsError } = useEmojiGroups()
  const { catalog, error: catalogError } = useEmojiCatalog()
  const tone = catalog?.settings.skin_tone ?? ''
  const unicode = useMemo(() => (groups ? unicodeChoices(groups, tone) : []), [groups, tone])
  const unicodeNames = useMemo(() => (groups ? unicodeNamesOf(groups) : new Map<string, string>()), [groups])
  const offered: DiscordCustomEmoji[] = useMemo(() => (catalog
    ? customEmojiOffered(catalog.discord_custom_emoji, roomDiscordServerID, catalog.settings.offer_other_servers_emoji)
    : []), [catalog, roomDiscordServerID])
  const custom = useMemo(() => offered.map(customChoice), [offered])
  const favoriteKeys = useMemo(() => catalog?.favorite_keys ?? [], [catalog])
  const favorites = useMemo(() => {
    const offeredKeys = new Set(offered.map(emoji => emoji.reaction_key))
    return favoriteChoices(favoriteKeys, catalog?.discord_custom_emoji ?? [], unicodeNames)
      .filter(choice => choice.kind === 'unicode' || (purpose === 'reaction' && offeredKeys.has(choice.key)))
  }, [favoriteKeys, catalog, unicodeNames, offered, purpose])
  return {
    groups, unicode, custom: purpose === 'reaction' ? custom : [], customNotSendable: purpose === 'message' ? custom : [],
    favorites, favoriteKeys, tone, error: groupsError ?? catalogError,
  }
}

/**
 * A button that opens the emoji panel for the composer. Picking one calls
 * `onPick` and nothing else: the composer puts it in its text box, and
 * nothing is sent until the person sends.
 */
export function EmojiPickerButton({ onPick, disabled, roomDiscordServerID }: {
  onPick: (choice: EmojiChoice) => void
  disabled?: boolean
  roomDiscordServerID: string | null
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  return (
    <div className={styles.emojiPickerWrap} ref={wrapper}>
      <button type="button" className={styles.emojiButton} disabled={disabled} aria-expanded={open}
        title="Insert an emoji (or type : and a name)" aria-label="Insert an emoji" onClick={() => setOpen(o => !o)}>
        {'\u{1F642}'}
      </button>
      {open && <EmojiPickerPanel purpose="message" roomDiscordServerID={roomDiscordServerID} onPick={onPick} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** How many results a search shows. */
const SEARCH_RESULT_LIMIT = 200

/** The searchable emoji panel: favourites, the room's custom emoji, then
 *  every unicode group; a search matches any part of a name (`:par` finds
 *  parrot and partyParrot) and Enter picks the first match. `heading`, when
 *  given, says what a pick is for. */
export function EmojiPickerPanel({ onPick, onClose, heading, purpose, roomDiscordServerID }: {
  onPick: (choice: EmojiChoice) => void
  onClose: () => void
  heading?: string
  purpose: EmojiPurpose
  roomDiscordServerID: string | null
}) {
  const { routes } = useBridgeConfig()
  const { groups, unicode, custom, favorites, favoriteKeys, tone, error } = useEmojiChoices(purpose, roomDiscordServerID)
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchEmojiChoices([...custom, ...unicode], query, favoriteKeys, SEARCH_RESULT_LIMIT),
    [custom, unicode, query, favoriteKeys])
  const customByServer = useMemo(() => {
    const byServer = new Map<string, EmojiChoice[]>()
    for (const choice of custom) {
      if (choice.kind !== 'custom') continue
      const server = choice.emoji.discord_server_name
      byServer.set(server, [...(byServer.get(server) ?? []), choice])
    }
    return [...byServer.entries()]
  }, [custom])
  const searching = query.trim() !== ''

  return (
    <div className={styles.emojiPanel} role="dialog" aria-label="Emoji"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
      {heading && (
        <div className={styles.emojiPanelHeading}>
          <span>{heading}</span>
          <button type="button" className={styles.emojiPanelClose} aria-label="Close" onClick={onClose}>✕</button>
        </div>
      )}
      <input className={styles.input} type="search" value={query} placeholder="Search by name — :par finds partyParrot" autoFocus
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && results.length > 0) { event.preventDefault(); onPick(results[0]) }
        }} />
      <div className={styles.emojiGroups}>
        {error && <pre className={styles.error}>{error}</pre>}
        {!groups && !error && <div className={styles.empty}>Loading…</div>}
        {searching ? (
          results.length === 0 ? <div className={styles.empty}>No emoji matches.</div> : (
            <EmojiSection name="Matches" choices={results} onPick={onPick} />
          )
        ) : (
          <>
            {favorites.length > 0 && <EmojiSection name="Favourites" choices={favorites} onPick={onPick} />}
            {customByServer.map(([server, choices]) => <EmojiSection key={server} name={server} choices={choices} onPick={onPick} />)}
            {groups?.map(group => (
              <EmojiSection key={group.name} name={group.name}
                choices={unicode.slice(unicodeStart(groups, group.name), unicodeStart(groups, group.name) + group.emojis.length)}
                onPick={onPick} />
            ))}
          </>
        )}
      </div>
      <div className={styles.emojiPanelFoot}>
        {tone && <span className={styles.muted}>Skin tone {tone}</span>}
        {routes.emoji && <Link to={routes.emoji} className={styles.muted}>Favourites and settings</Link>}
      </div>
    </div>
  )
}

/** Where a group's emoji begin in the flattened unicode list. */
function unicodeStart(groups: readonly { name: string; emojis: readonly unknown[] }[], name: string): number {
  let start = 0
  for (const group of groups) {
    if (group.name === name) return start
    start += group.emojis.length
  }
  return start
}

function EmojiSection({ name, choices, onPick }: { name: string; choices: readonly EmojiChoice[]; onPick: (choice: EmojiChoice) => void }) {
  return (
    <section>
      <div className={styles.emojiGroupName}>{name}</div>
      <div className={styles.emojiGrid}>
        {choices.map(choice => (
          <button key={choice.key} type="button" className={styles.emojiCell} title={`:${choice.name}:`} aria-label={choice.name}
            onClick={() => onPick(choice)}>
            <EmojiFace choice={choice} />
          </button>
        ))}
      </div>
    </section>
  )
}

/** One row of the composer's `:` suggestions. A custom emoji outside a react
 *  command is listed but cannot be picked, with the reason. */
export interface EmojiSuggestion {
  choice: EmojiChoice
  disabledReason?: string
}

/** The suggestions a `:query` in the composer opens, above the text box.
 *  The composer owns the keys: arrows move, Enter or Tab picks, Escape shuts. */
export function EmojiSuggestionList({ suggestions, activeIndex, onPick, onHover }: {
  suggestions: readonly EmojiSuggestion[]
  activeIndex: number
  onPick: (suggestion: EmojiSuggestion) => void
  onHover: (index: number) => void
}) {
  return (
    <ul className={styles.emojiSuggestions} role="listbox" aria-label="Emoji suggestions">
      {suggestions.map((suggestion, index) => (
        <li key={suggestion.choice.key} role="option" aria-selected={index === activeIndex} aria-disabled={!!suggestion.disabledReason}
          className={`${styles.emojiSuggestion} ${index === activeIndex ? styles.emojiSuggestionActive : ''} ${suggestion.disabledReason ? styles.emojiSuggestionDisabled : ''}`}
          title={suggestion.disabledReason}
          onMouseEnter={() => onHover(index)}
          // mousedown, not click, so the text box keeps its focus and cursor.
          onMouseDown={event => { event.preventDefault(); if (!suggestion.disabledReason) onPick(suggestion) }}>
          <EmojiFace choice={suggestion.choice} className={styles.emojiSuggestionFace} />
          <span>:{suggestion.choice.name}:</span>
          {suggestion.choice.kind === 'custom' && <span className={styles.muted}>{suggestion.choice.emoji.discord_server_name}</span>}
          {suggestion.disabledReason && <span className={styles.muted}>react only</span>}
        </li>
      ))}
    </ul>
  )
}
