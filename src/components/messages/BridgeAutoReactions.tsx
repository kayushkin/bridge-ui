import { useCallback, useEffect, useRef, useState } from 'react'
import { useBridgeConfig } from '../../context'
import {
  autoReactionEmojiLabel, autoReactionEmojiOf, autoReactionPersonLabel, memberSearchPath,
  type AutoReaction, type CreateAutoReactionBody, type DiscordSignupGuild, type DiscordSignupMember,
} from '../../autoReactions'
import type { EmojiChoice } from '../../emojiCatalog'
import { EmojiPickerPanel } from './EmojiPicker'
import styles from './Messages.module.css'

/** Requests to discord-signup-store through the host's proxy. Both throw the
 *  store's refusal in its own words, so the page can show it. */
function useDiscordSignup() {
  const { fetch: apiFetch, discordSignupBasePath } = useBridgeConfig()
  return useCallback(async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await apiFetch(`${discordSignupBasePath}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).trim()}`)
    return (res.status === 204 ? undefined : await res.json()) as T
  }, [apiFetch, discordSignupBasePath])
}

function timeLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString()
}

/** A button that opens the emoji panel and hands back the bot's form of the
 *  picked emoji. */
function EmojiChooser({ label, onChoose, disabled }: { label: string; onChoose: (emoji: string) => void; disabled?: boolean }) {
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
      <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(o => !o)}>{label}</button>
      {open && (
        <EmojiPickerPanel purpose="reaction" discordRoom={null} heading="The bot reacts with"
          onPick={(choice: EmojiChoice) => { onChoose(autoReactionEmojiOf(choice)); setOpen(false) }}
          onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

/**
 * The Event-Manager bot's auto-reactions: for each rule, the bot reacts with
 * its emoji to every message that person posts in that server, in every
 * channel and thread the bot can see. discord-signup-store keeps the rules and
 * counts each reaction made; a refusal from Discord (most often a channel that
 * denies the bot Add Reactions) shows on the rule.
 */
export function BridgeAutoReactions() {
  const call = useDiscordSignup()
  const [rules, setRules] = useState<AutoReaction[] | null>(null)
  const [guilds, setGuilds] = useState<DiscordSignupGuild[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [guildID, setGuildID] = useState('')
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<DiscordSignupMember[]>([])
  const [member, setMember] = useState<DiscordSignupMember | null>(null)
  const [emoji, setEmoji] = useState('')

  const reload = useCallback(async () => {
    try {
      const [list, guildList] = await Promise.all([
        call<{ auto_reactions: AutoReaction[] }>('GET', '/auto-reactions'),
        call<{ guilds: DiscordSignupGuild[] }>('GET', '/guilds'),
      ])
      setRules(list.auto_reactions)
      setGuilds(guildList.guilds)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [call])
  useEffect(() => { void reload() }, [reload])

  // The member search runs as someone types, a moment after they stop.
  useEffect(() => {
    const trimmed = query.trim()
    if (!guildID || trimmed === '' || member) { setMembers([]); return }
    let cancelled = false
    const timer = window.setTimeout(() => {
      call<{ members: DiscordSignupMember[] }>('GET', memberSearchPath(guildID, trimmed))
        .then(found => { if (!cancelled) setMembers(found.members) })
        .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [call, guildID, query, member])

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const add = () => act(async () => {
    if (!member) return
    const body: CreateAutoReactionBody = {
      guild_id: guildID, discord_user_id: member.user_id, member_display_name: member.display_name, emoji, enabled: true,
    }
    await call('POST', '/auto-reactions', body)
    setMember(null)
    setQuery('')
    setEmoji('')
  })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>Auto-reactions</h2>
        <span className={styles.muted}>
          The Event-Manager bot reacts with the emoji to every message the person posts in that server, in every channel and thread it can see.
        </span>
      </header>
      {error && <div className={styles.error}>{error}</div>}

      {rules === null ? <div className={styles.empty}>Loading…</div>
        : rules.length === 0 ? <div className={styles.empty}>No rules yet.</div>
          : rules.map(rule => (
            <div key={rule.id} className={styles.row} data-auto-reaction-id={rule.id}>
              <div className={styles.rowHead}>
                <span style={{ fontSize: '1.4em' }}>{autoReactionEmojiLabel(rule.emoji)}</span>
                <strong>{autoReactionPersonLabel(rule)}</strong>
                <span className={styles.muted}>in {rule.guild_name || rule.guild_id}</span>
              </div>
              <div className={styles.rowMeta}>
                <label>
                  <input type="checkbox" checked={rule.enabled} disabled={busy}
                    onChange={e => { const enabled = e.target.checked; void act(() => call('PATCH', `/auto-reactions/${rule.id}`, { enabled })) }} />
                  {' '}{rule.enabled ? 'On' : 'Off'}
                </label>
                <span className={styles.muted}>
                  {rule.reaction_count} reaction{rule.reaction_count === 1 ? '' : 's'}
                  {rule.last_reacted_at > 0 && `, last ${timeLabel(rule.last_reacted_at)}`}
                </span>
                <EmojiChooser label="Change emoji" disabled={busy}
                  onChoose={next => { void act(() => call('PATCH', `/auto-reactions/${rule.id}`, { emoji: next })) }} />
                <button type="button" disabled={busy}
                  onClick={() => { if (window.confirm(`Delete the ${autoReactionEmojiLabel(rule.emoji)} rule for ${autoReactionPersonLabel(rule)}?`)) void act(() => call('DELETE', `/auto-reactions/${rule.id}`)) }}>
                  Delete
                </button>
              </div>
              {rule.last_error && (
                <div className={styles.error}>Discord refused the last reaction ({timeLabel(rule.last_error_at)}): {rule.last_error}</div>
              )}
            </div>
          ))}

      <section className={styles.row}>
        <strong>New rule</strong>
        <div className={styles.filters}>
          <select className={styles.input} value={guildID} disabled={busy}
            onChange={e => { setGuildID(e.target.value); setMember(null); setQuery('') }}>
            <option value="">Server…</option>
            {guilds.map(g => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}
          </select>
          {member ? (
            <span>
              <strong>{member.display_name}</strong> <span className={styles.muted}>@{member.username}</span>{' '}
              <button type="button" onClick={() => { setMember(null); setQuery('') }}>Change</button>
            </span>
          ) : (
            <input className={styles.input} placeholder={guildID ? 'Person (start of their name)' : 'Pick a server first'}
              disabled={!guildID || busy} value={query} onChange={e => setQuery(e.target.value)} />
          )}
          <EmojiChooser label={emoji ? `Emoji: ${autoReactionEmojiLabel(emoji)}` : 'Pick emoji'} disabled={busy} onChoose={setEmoji} />
          <button type="button" disabled={busy || !guildID || !member || !emoji} onClick={() => { void add() }}>Add</button>
        </div>
        {!member && members.length > 0 && (
          <div className={styles.rowMeta}>
            {members.map(m => (
              <button type="button" key={m.user_id} onClick={() => { setMember(m); setMembers([]) }}>
                {m.display_name} <span className={styles.muted}>@{m.username}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
