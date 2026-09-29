import { useMemo, useState } from 'react'
import type { EmojiSettings } from '@kayushkin/multichat-types'
import {
  customChoice, favoriteChoices, SKIN_TONES, searchEmojiChoices, unicodeChoices, unicodeNamesOf, withFavoriteMoved,
  withFavoriteToggled, withSkinTone, type EmojiChoice,
} from '../../emojiCatalog'
import { messageTimeLabel } from '../../multichatMessages'
import { EmojiFace } from './EmojiPicker'
import { MultichatNotConfigured } from './messagesShared'
import { useEmojiCatalog, useEmojiGroups } from './useEmojiCatalog'
import { useMultichat } from './useMultichat'
import styles from './Messages.module.css'

/**
 * The emoji pickers' settings, stored by multichat (`GET /emoji`,
 * `PUT /emoji/favorites`, `PUT /emoji/settings`): the favourites, which the
 * quick-react bar under each message offers first; the skin tone; and which
 * servers' custom emoji a Discord room is offered. Below them, every bridged
 * server's custom emoji and every unicode emoji, each a click away from being
 * a favourite, and the refresh that lists the custom ones again from Discord.
 */
export function BridgeEmoji() {
  const { configured } = useMultichat()
  const { catalog, error, saveFavorites, saveSettings, refreshFromDiscord } = useEmojiCatalog()
  const { groups, error: groupsError } = useEmojiGroups()
  const [query, setQuery] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const tone = catalog?.settings.skin_tone ?? ''
  const favoriteKeys = useMemo(() => catalog?.favorite_keys ?? [], [catalog])
  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys])
  const unicode = useMemo(() => (groups ? unicodeChoices(groups, tone) : []), [groups, tone])
  const custom = useMemo(() => (catalog?.discord_custom_emoji ?? []).map(customChoice), [catalog])
  const favorites = useMemo(() => favoriteChoices(favoriteKeys, catalog?.discord_custom_emoji ?? [],
    groups ? unicodeNamesOf(groups) : new Map()), [favoriteKeys, catalog, groups])
  const results = useMemo(() => searchEmojiChoices([...custom, ...unicode], query, favoriteKeys), [custom, unicode, query, favoriteKeys])
  const customByServer = useMemo(() => {
    const byServer = new Map<string, EmojiChoice[]>()
    for (const choice of custom) {
      if (choice.kind !== 'custom') continue
      byServer.set(choice.emoji.discord_server_name, [...(byServer.get(choice.emoji.discord_server_name) ?? []), choice])
    }
    return [...byServer.entries()]
  }, [custom])

  if (!configured) return <MultichatNotConfigured page="Emoji" />

  const writeFavorites = async (keys: string[]) => setWriteError(await saveFavorites(keys))
  const writeSettings = async (settings: EmojiSettings) => setWriteError(await saveSettings(settings))
  const refresh = async () => {
    setRefreshing(true)
    setWriteError(await refreshFromDiscord())
    setRefreshing(false)
  }
  const toggle = (choice: EmojiChoice) => { void writeFavorites(withFavoriteToggled(favoriteKeys, choice.key)) }

  const cell = (choice: EmojiChoice) => {
    const favorite = favoriteSet.has(choice.key)
    const notTaught = choice.kind === 'custom' && !choice.emoji.bridge_mxc
    return (
      <button key={choice.key} type="button" aria-pressed={favorite}
        className={`${styles.emojiCell} ${favorite ? styles.emojiCellFavorite : ''}`}
        title={`:${choice.name}:${choice.kind === 'custom' ? ` — ${choice.emoji.discord_server_name}` : ''}${notTaught ? '\nThe bridge learns this one the first time you react with it.' : ''}\n${favorite ? 'Click to take it out of your favourites' : 'Click to make it a favourite'}`}
        onClick={() => toggle(choice)}>
        <EmojiFace choice={choice} />
      </button>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>Emoji</h2>
        <p className={styles.subtitle}>
          Your favourites come first in every picker, and the first few sit beside each message as one-click reactions.
          In a message, type <code>:</code> and part of a name; start with <code>+:</code> to react to the newest message instead.
        </p>
      </header>
      {error && <pre className={styles.error}>{error}</pre>}
      {groupsError && <pre className={styles.error}>The unicode emoji did not load: {groupsError}</pre>}
      {writeError && <pre className={styles.error}>{writeError}</pre>}
      {!catalog ? (error ? null : <div className={styles.empty}>Loading…</div>) : (
        <>
          <section className={styles.emojiPageSection}>
            <h3 className={styles.emojiPageHeading}>Settings</h3>
            <div className={styles.emojiSetting}>
              <span>Skin tone</span>
              <div className={styles.emojiToneRow} role="radiogroup" aria-label="Skin tone">
                {SKIN_TONES.map(({ tone: option, label }) => (
                  <button key={label} type="button" role="radio" aria-checked={tone === option} title={label}
                    className={`${styles.emojiCell} ${tone === option ? styles.emojiCellFavorite : ''}`}
                    onClick={() => { void writeSettings({ ...catalog.settings, skin_tone: option }) }}>
                    {withSkinTone('\u{1F44B}', true, option)}
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.emojiSetting}>
              <span>Quick reactions beside each message</span>
              <input className={styles.input} type="number" min={0} value={catalog.settings.quick_reaction_count}
                onChange={event => {
                  const count = Number(event.target.value)
                  if (Number.isInteger(count)) void writeSettings({ ...catalog.settings, quick_reaction_count: count })
                }} />
            </label>
            <label className={styles.emojiSetting}>
              <input type="checkbox" checked={catalog.settings.offer_other_servers_emoji}
                onChange={event => { void writeSettings({ ...catalog.settings, offer_other_servers_emoji: event.target.checked }) }} />
              <span>Offer every bridged server&apos;s custom emoji in a Discord room, not only that server&apos;s own
                <span className={styles.muted}> — Discord refuses another server&apos;s emoji unless the account has Nitro</span></span>
            </label>
          </section>

          <section className={styles.emojiPageSection}>
            <h3 className={styles.emojiPageHeading}>Favourites</h3>
            {favorites.length === 0 ? <div className={styles.empty}>No favourites yet. Click any emoji below to add it.</div> : (
              <ol className={styles.emojiFavoriteList}>
                {favorites.map((choice, index) => (
                  <li key={choice.key} className={styles.emojiFavorite}>
                    <EmojiFace choice={choice} className={styles.emojiSuggestionFace} />
                    <span>:{choice.name}:</span>
                    {index < catalog.settings.quick_reaction_count && <span className={styles.muted}>quick reaction</span>}
                    <span className={styles.emojiFavoriteButtons}>
                      <button type="button" className={styles.emojiPanelClose} disabled={index === 0} aria-label={`Move ${choice.name} earlier`}
                        onClick={() => { void writeFavorites(withFavoriteMoved(favoriteKeys, choice.key, -1)) }}>↑</button>
                      <button type="button" className={styles.emojiPanelClose} disabled={index === favorites.length - 1} aria-label={`Move ${choice.name} later`}
                        onClick={() => { void writeFavorites(withFavoriteMoved(favoriteKeys, choice.key, 1)) }}>↓</button>
                      <button type="button" className={styles.emojiPanelClose} aria-label={`Remove ${choice.name}`}
                        onClick={() => toggle(choice)}>✕</button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.emojiPageSection}>
            <div className={styles.emojiPageHeadingRow}>
              <h3 className={styles.emojiPageHeading}>All emoji</h3>
              <input className={styles.input} type="search" value={query} placeholder="Search by name — :par finds partyParrot"
                onChange={event => setQuery(event.target.value)} />
            </div>
            {query.trim() ? (
              results.length === 0 ? <div className={styles.empty}>No emoji matches.</div> : (
                <div className={styles.emojiGrid}>{results.map(cell)}</div>
              )
            ) : (
              <>
                <div className={styles.emojiPageHeadingRow}>
                  <span className={styles.muted}>
                    Custom emoji of the bridged Discord servers
                    {catalog.discord_refreshes.map(r => ` · ${r.discord_server_name} listed ${messageTimeLabel(Date.parse(r.refreshed_at))}`).join('')}
                  </span>
                  <button type="button" className="bi-save-btn" disabled={refreshing} onClick={() => { void refresh() }}>
                    {refreshing ? 'Asking Discord…' : 'Refresh from Discord'}
                  </button>
                </div>
                {customByServer.length === 0 && (
                  <div className={styles.empty}>No custom emoji yet. Refresh from Discord to list each server&apos;s.</div>
                )}
                {customByServer.map(([server, choices]) => (
                  <div key={server}>
                    <div className={styles.emojiGroupName}>{server} ({choices.length})</div>
                    <div className={styles.emojiGrid}>{choices.map(cell)}</div>
                  </div>
                ))}
                {groups?.map(group => {
                  const start = groups.slice(0, groups.indexOf(group)).reduce((sum, g) => sum + g.emojis.length, 0)
                  return (
                    <div key={group.name}>
                      <div className={styles.emojiGroupName}>{group.name}</div>
                      <div className={styles.emojiGrid}>{unicode.slice(start, start + group.emojis.length).map(cell)}</div>
                    </div>
                  )
                })}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
