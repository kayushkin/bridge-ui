import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DiscordBridgeStatus } from '@kayushkin/multichat-types'
import { bridgedChannelsOf, DISCORD_PLATFORM } from '../../discordLog'
import { insertAtSelection } from '../../emojiPicker'
import { discordNamesOf, NO_DISCORD_NAMES, type DiscordNames } from '../../messageBody'
import {
  conversationMessagesPath, conversationPlatforms, conversationSendPath, conversationShownName, conversationTags, filterConversations,
  conversationPreviewText, foldEdits, mergeNewestMessages, messageTimeLabel, pageMessages, prependOlderMessages, sameMessages, sendMessageBodyOf,
  reactionPostPath, reactionTakeBackPath, reactionTargetEventID, type ShownMessage,
} from '../../multichatMessages'
import { reactionChipAction, withReactionPosted, withReactionTakenBack } from '../../messageReactions'
import {
  choiceNamed, colonQueryAt, colonQueryIsReactionCommand, reactionCommandOf, reactionGroupIsEmoji, roomDiscordServerID,
  searchEmojiChoices, type EmojiChoice,
} from '../../emojiCatalog'
import type { MessageReactionGroup } from '@kayushkin/multichat-types'
import type {
  MultichatContactTagMap, MultichatConversation, MultichatMessage, MultichatMessagePage, MultichatSendAnswer,
} from '../../types-multichat'
import { errorText, useMultichat } from './useMultichat'
import { MultichatNotConfigured, TagChips } from './messagesShared'
import { MessageContent, ReactionChips } from './MessageContent'
import { EmojiFace, EmojiPickerButton, EmojiPickerPanel, EmojiSuggestionList, useEmojiChoices, type EmojiSuggestion } from './EmojiPicker'
import { useEmojiCatalog } from './useEmojiCatalog'
import styles from './Messages.module.css'

const CONVERSATIONS_POLL_MS = 30_000
const MESSAGES_POLL_MS = 5_000
/** Distance from the bottom, in pixels, still counted as reading the newest. */
const AT_BOTTOM_PX = 40
/** How many `:` suggestions show at once. */
const SUGGESTION_LIMIT = 8
/** Why a custom emoji cannot be picked into a message. */
const CUSTOM_EMOJI_IN_MESSAGE_REASON =
  'The Discord bridge cannot send a custom emoji inside a message. Start the message with +: to react with it instead.'

/**
 * Every conversation multichat's bridges carry — WhatsApp, Telegram, Signal,
 * Messenger, Discord, Slack — and one of them open to read and answer.
 * `?room=<room_id>` picks the room, so a search hit links straight to it.
 *
 * A message sent here reaches a real person on that app.
 */
export function BridgeMessageConversations() {
  const { read, configured } = useMultichat()
  const [conversations, setConversations] = useState<MultichatConversation[] | null>(null)
  const [tagMap, setTagMap] = useState<MultichatContactTagMap>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [platform, setPlatform] = useState('')
  const [text, setText] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const roomID = searchParams.get('room') ?? ''

  const reload = useCallback(async () => {
    try {
      setConversations(await read<MultichatConversation[] | null>('/conversations') ?? [])
      setLoadError(null)
    } catch (err) {
      setLoadError(errorText(err))
    }
    // Tags only label the rows, so the list still shows when they fail.
    try {
      setTagMap(await read<MultichatContactTagMap | null>('/contacts/tags/bulk') ?? {})
      setTagsError(null)
    } catch (err) {
      setTagsError(errorText(err))
    }
  }, [read])

  useEffect(() => {
    if (!configured) return
    void reload()
    const timer = window.setInterval(() => { void reload() }, CONVERSATIONS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [configured, reload])

  const platforms = useMemo(() => conversationPlatforms(conversations ?? []), [conversations])
  const shown = useMemo(() => filterConversations(conversations ?? [], { platform, text }), [conversations, platform, text])
  const picked = conversations?.find(conversation => conversation.room_id === roomID) ?? null

  const pick = (nextRoomID: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('room', nextRoomID)
    setSearchParams(next, { replace: true })
  }

  if (!configured) return <MultichatNotConfigured page="Conversations" />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>Conversations</h2>
        <p className={styles.subtitle}>
          Every room multichat&apos;s bridges carry, newest first. A message you send here reaches the person on that app.
        </p>
      </header>
      {loadError && <pre className={styles.error}>{loadError}</pre>}
      {tagsError && <pre className={styles.error}>Tags are not shown: {tagsError}</pre>}
      {!conversations ? (loadError ? null : <div className={styles.empty}>Loading…</div>) : (
        <div className={styles.columns}>
          <div className={styles.listColumn}>
            <div className={styles.filters}>
              <input className={styles.input} type="search" value={text} placeholder="Filter by name, member or last message"
                onChange={e => setText(e.target.value)} />
              <select className={styles.input} value={platform} onChange={e => setPlatform(e.target.value)}>
                <option value="">Every app ({conversations.length})</option>
                {platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {shown.length === 0 && (
              <div className={styles.empty}>{conversations.length === 0 ? 'No conversations.' : 'No conversation matches.'}</div>
            )}
            <ul className={styles.list}>
              {shown.map(conversation => (
                <li key={conversation.room_id}>
                  <button type="button" data-room-id={conversation.room_id}
                    className={`${styles.row} ${styles.rowPick} ${conversation.room_id === roomID ? styles.rowSelected : ''}`}
                    onClick={() => pick(conversation.room_id)}>
                    <span className={styles.rowHead}>
                      <span className={styles.name} title={conversation.name}>{conversationShownName(conversation)}</span>
                      {conversation.last_activity > 0 && <span className={styles.time}>{messageTimeLabel(conversation.last_activity)}</span>}
                    </span>
                    <span className={styles.rowMeta}>
                      {conversation.platform && <span className={styles.platform}>{conversation.platform}</span>}
                      {conversation.member_count > 2 && <span className={styles.muted}>{conversation.member_count} members</span>}
                      <TagChips tags={conversationTags(conversation, tagMap)} />
                    </span>
                    {conversation.last_message && <span className={styles.preview}>{conversationPreviewText(conversation.last_message)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.viewer}>
            {picked ? <ConversationThread key={picked.room_id} conversation={picked} onSent={() => { void reload() }} /> : (
              <div className={styles.empty}>
                {roomID ? `multichat lists no conversation ${roomID}.` : 'Pick a conversation to read it here.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** One room: its messages, oldest at the top, with older pages loaded on
 *  request and the newest page polled; and the box to answer in. Keyed by room,
 *  so switching rooms starts it afresh. */
function ConversationThread({ conversation, onSent }: { conversation: MultichatConversation; onSent: () => void }) {
  const { read, write } = useMultichat()
  const roomID = conversation.room_id
  const [messages, setMessages] = useState<MultichatMessage[] | null>(null)
  const [olderFrom, setOlderFrom] = useState<string | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  /** The message the reaction picker is open for, if any. */
  const [reactingTo, setReactingTo] = useState<ShownMessage | null>(null)
  const [reacting, setReacting] = useState(false)
  const [reactionError, setReactionError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const composer = useRef<HTMLTextAreaElement | null>(null)
  /** Where the cursor goes after an emoji is put in, applied once the draft redraws. */
  const pendingCursor = useRef<number | null>(null)
  const discordStatus = useDiscordStatus(conversation)
  const discordNames = useDiscordNames(conversation, messages, discordStatus)
  const roomServerID = useMemo(() => roomDiscordServerID(discordStatus, roomID), [discordStatus, roomID])
  const emoji = useEmojiChoices('reaction', roomServerID)
  const { catalog } = useEmojiCatalog()
  /** Where the cursor is in the text box, for the `:` suggestions. */
  const [cursor, setCursor] = useState(0)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  /** Where the `:query` the person shut with Escape starts; it stays shut. */
  const [dismissedColonAt, setDismissedColonAt] = useState<number | null>(null)
  /** What the next redraw of the list does to the scroll position: go to the
   *  newest message, keep the reader's distance from the bottom (an older page
   *  went in above), or nothing. */
  const pendingScroll = useRef<{ kind: 'bottom' } | { kind: 'keep'; fromBottom: number } | null>(null)
  /** The newest page. The token for older pages is taken only from the first
   *  load and from older pages, never from the poll, so polling does not reset
   *  how far back the reader has gone. */
  const newestPage = useCallback(() => read<MultichatMessagePage>(conversationMessagesPath(roomID)), [read, roomID])

  const atBottom = () => {
    const el = scroller.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX
  }

  useEffect(() => {
    let cancelled = false
    newestPage().then(page => {
      if (cancelled) return
      pendingScroll.current = { kind: 'bottom' }
      setMessages(pageMessages(page))
      setOlderFrom(page.end ?? null)
      setHasOlder(page.has_more)
      setError(null)
    }).catch(err => { if (!cancelled) setError(errorText(err)) })
    return () => { cancelled = true }
  }, [newestPage])

  const refreshNewest = useCallback(async (scrollToNewest: boolean) => {
    const page = await newestPage()
    const stickToBottom = scrollToNewest || atBottom()
    setMessages(current => {
      if (!current) return current
      const merged = mergeNewestMessages(current, pageMessages(page))
      if (sameMessages(current, merged)) return current
      if (stickToBottom) pendingScroll.current = { kind: 'bottom' }
      return merged
    })
  }, [newestPage])

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshNewest(false).then(() => setError(null)).catch(err => setError(errorText(err)))
    }, MESSAGES_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshNewest])

  useLayoutEffect(() => {
    const el = scroller.current
    const pending = pendingScroll.current
    if (!el || !pending) return
    pendingScroll.current = null
    el.scrollTop = pending.kind === 'bottom' ? el.scrollHeight : el.scrollHeight - el.clientHeight - pending.fromBottom
  }, [messages])

  const loadOlder = async () => {
    if (!olderFrom || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await read<MultichatMessagePage>(conversationMessagesPath(roomID, olderFrom))
      const el = scroller.current
      if (el) pendingScroll.current = { kind: 'keep', fromBottom: el.scrollHeight - el.clientHeight - el.scrollTop }
      setMessages(current => prependOlderMessages(current ?? [], pageMessages(page)))
      setOlderFrom(page.end ?? null)
      setHasOlder(page.has_more && !!page.end)
      setError(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingOlder(false)
    }
  }

  useLayoutEffect(() => {
    const el = composer.current
    if (!el || pendingCursor.current === null) return
    el.focus()
    el.setSelectionRange(pendingCursor.current, pendingCursor.current)
    pendingCursor.current = null
  }, [draft])

  /** Puts an emoji where the cursor is (or over the selection). It only
   *  changes the text box; sending is still the person's Enter or Send. */
  const insertEmoji = (choice: EmojiChoice) => {
    const el = composer.current
    const next = insertAtSelection(draft, el?.selectionStart ?? draft.length, el?.selectionEnd ?? draft.length, choice.key)
    pendingCursor.current = next.cursor
    setCursor(next.cursor)
    setDraft(next.text)
  }

  const colonQuery = useMemo(() => colonQueryAt(draft, cursor), [draft, cursor])
  const inReactionCommand = !!colonQuery && colonQueryIsReactionCommand(draft, colonQuery.start)
  /** The `:` suggestions: in a react command (`+:par`) any emoji the room is
   *  offered; in a message the unicode ones, with matching custom ones listed
   *  but not pickable. */
  const suggestions: EmojiSuggestion[] = useMemo(() => {
    if (!colonQuery || colonQuery.start === dismissedColonAt) return []
    if (inReactionCommand) {
      return searchEmojiChoices([...emoji.custom, ...emoji.unicode], colonQuery.query, emoji.favoriteKeys, SUGGESTION_LIMIT)
        .map(choice => ({ choice }))
    }
    return [
      ...searchEmojiChoices(emoji.unicode, colonQuery.query, emoji.favoriteKeys, SUGGESTION_LIMIT).map(choice => ({ choice })),
      ...searchEmojiChoices(emoji.custom, colonQuery.query, emoji.favoriteKeys, 3)
        .map(choice => ({ choice, disabledReason: CUSTOM_EMOJI_IN_MESSAGE_REASON })),
    ]
  }, [colonQuery, dismissedColonAt, inReactionCommand, emoji.custom, emoji.unicode, emoji.favoriteKeys])
  const activeSuggestion = Math.min(suggestionIndex, Math.max(0, suggestions.length - 1))

  /** The newest message shown, which a react command reacts to. */
  const newestMessage = (): ShownMessage | null => {
    const shown = messages ? foldEdits(messages) : []
    return shown.length > 0 ? shown[shown.length - 1] : null
  }

  const reactToNewest = async (choice: EmojiChoice) => {
    const newest = newestMessage()
    if (!newest) { setSendError('There is no message to react to.'); return }
    setDraft('')
    setCursor(0)
    setSendError(null)
    await postReaction(newest, choice)
  }

  const pickSuggestion = (suggestion: EmojiSuggestion) => {
    if (!colonQuery || suggestion.disabledReason) return
    if (inReactionCommand) { void reactToNewest(suggestion.choice); return }
    const next = insertAtSelection(draft, colonQuery.start, cursor, suggestion.choice.key)
    pendingCursor.current = next.cursor
    setCursor(next.cursor)
    setDraft(next.text)
  }

  const send = async () => {
    const command = reactionCommandOf(draft)
    if (command) {
      const choice: EmojiChoice | null = 'name' in command
        ? choiceNamed([...emoji.custom, ...emoji.unicode], command.name)
        : { kind: 'unicode', key: command.emoji, name: command.emoji }
      if (!choice) { setSendError(`No emoji here is named :${'name' in command ? command.name : ''}:.`); return }
      await reactToNewest(choice)
      return
    }
    const result = sendMessageBodyOf(draft)
    if (!result.ok) { setSendError(result.error); return }
    setSending(true)
    const sent = await write<MultichatSendAnswer>('POST', conversationSendPath(roomID), result.body)
    setSending(false)
    if (!sent.ok) { setSendError(sent.error); return }
    setSendError(null)
    setDraft('')
    onSent()
    try { await refreshNewest(true) } catch (err) { setError(errorText(err)) }
  }

  /** Puts a change to one message's reactions on the shown list at once; the
   *  next poll brings the logged copy. */
  const updateReactions = (targetEventID: string, change: (reactions: MessageReactionGroup[]) => MessageReactionGroup[]) => {
    setMessages(current => current && current.map(message =>
      message.event_id === targetEventID ? { ...message, reactions: change(message.reactions ?? []) } : message))
  }

  /** Reacts to a message as our account; the bridge passes it on to the
   *  people in the room. A custom emoji goes as its `discord-emoji:` key, and
   *  multichat answers the mxc:// key it reacted with, which is what the
   *  message's reactions carry from then on. */
  const postReaction = async (message: ShownMessage, choice: Pick<EmojiChoice, 'kind' | 'key' | 'name'>) => {
    const target = reactionTargetEventID(message)
    setReacting(true)
    const posted = await write<{ event_id: string; key: string }>('POST', reactionPostPath(roomID), { event_id: target, key: choice.key })
    setReacting(false)
    if (!posted.ok) { setReactionError(posted.error); return }
    setReactionError(null)
    const shortcode = choice.kind === 'custom' ? `:${choice.name}:` : ''
    updateReactions(target, reactions => withReactionPosted(reactions, posted.value.key || choice.key, posted.value.event_id, 'You', shortcode))
  }

  /** The favourites the quick-react bar under each message offers here. */
  const quickReactions = emoji.favorites.slice(0, catalog?.settings.quick_reaction_count ?? 0)

  /** A quick reaction adds ours, or takes back the one we posted from here. */
  const onQuickReaction = (message: ShownMessage, choice: EmojiChoice) => {
    const group = (message.reactions ?? []).find(g => reactionGroupIsEmoji(g, choice.key, catalog?.discord_custom_emoji ?? []))
    if (group?.my_reaction_event_id) { void takeBackReaction(message, group.my_reaction_event_id); return }
    void postReaction(message, choice)
  }

  const takeBackReaction = async (message: ShownMessage, reactionEventID: string) => {
    const target = reactionTargetEventID(message)
    setReacting(true)
    const taken = await write<{ redaction_event_id: string }>('DELETE', reactionTakeBackPath(roomID, reactionEventID))
    setReacting(false)
    if (!taken.ok) { setReactionError(taken.error); return }
    setReactionError(null)
    updateReactions(target, reactions => withReactionTakenBack(reactions, reactionEventID, 'You'))
  }

  const onChipClick = (message: ShownMessage, reaction: MessageReactionGroup) => {
    const action = reactionChipAction(reaction)
    if (action.kind === 'post') void postReaction(message, { kind: 'unicode', key: action.key, name: reaction.shortcode || action.key })
    if (action.kind === 'take-back') void takeBackReaction(message, action.reactionEventID)
  }

  return (
    <div className={styles.thread}>
      <div className={styles.threadBar}>
        <span className={styles.name} title={conversation.name}>{conversationShownName(conversation)}</span>
        {conversation.platform && <span className={styles.platform}>{conversation.platform}</span>}
        <MemberList conversation={conversation} />
        <code className={styles.roomID} title="Matrix room id">{roomID}</code>
      </div>
      {error && <pre className={styles.error}>{error}</pre>}
      <div className={styles.messages} ref={scroller}>
        {hasOlder && (
          <button type="button" className={styles.olderButton} disabled={loadingOlder} onClick={() => { void loadOlder() }}>
            {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
          </button>
        )}
        {!messages ? (error ? null : <div className={styles.empty}>Loading…</div>) : (
          messages.length === 0 ? <div className={styles.empty}>No messages.</div> : foldEdits(messages).map(message => (
            <div key={message.event_id} data-event-id={message.event_id}
              className={`${styles.message} ${message.is_me ? styles.messageMine : ''}`}>
              <div className={styles.messageHead}>
                <span className={styles.sender} title={message.sender}>{message.is_me ? 'You' : message.sender_name || message.sender}</span>
                <span className={styles.time}>{messageTimeLabel(message.timestamp)}</span>
                {message.edited && <span className={styles.time}>edited</span>}
              </div>
              <div className={styles.messageBody}>
                <MessageContent message={message} messageType={message.msg_type} discordNames={discordNames} />
              </div>
              <ReactionChips reactions={message.reactions} busy={reacting}
                onChipClick={reaction => onChipClick(message, reaction)} />
              <div className={styles.messageTools}>
                {quickReactions.map(choice => {
                  const group = (message.reactions ?? []).find(g => reactionGroupIsEmoji(g, choice.key, catalog?.discord_custom_emoji ?? []))
                  const madeInTheApp = !!group?.reacted_by_me && !group.my_reaction_event_id
                  return (
                    <button key={choice.key} type="button" disabled={reacting || madeInTheApp}
                      className={`${styles.quickReaction} ${group?.reacted_by_me ? styles.quickReactionMine : ''}`}
                      title={madeInTheApp ? `You reacted with :${choice.name}: in the app; take it back there`
                        : group?.my_reaction_event_id ? `Take back your :${choice.name}:` : `React with :${choice.name}:`}
                      aria-label={`React with ${choice.name}`} aria-pressed={!!group?.reacted_by_me}
                      onClick={() => onQuickReaction(message, choice)}>
                      <EmojiFace choice={choice} />
                    </button>
                  )
                })}
                <button type="button" className={styles.reactButton} disabled={reacting}
                  aria-expanded={reactingTo?.event_id === message.event_id}
                  title="React to this message" aria-label="React to this message"
                  onClick={() => setReactingTo(current => current?.event_id === message.event_id ? null : message)}>
                  {'\u{1F642}'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className={styles.composer}>
        {reactingTo && (
          <EmojiPickerPanel
            heading={`React to ${reactingTo.is_me ? 'your' : `${reactingTo.sender_name || reactingTo.sender}'s`} message: “${reactingTo.body.slice(0, 60)}${reactingTo.body.length > 60 ? '…' : ''}”`}
            purpose="reaction" roomDiscordServerID={roomServerID}
            onPick={choice => { const message = reactingTo; setReactingTo(null); void postReaction(message, choice) }}
            onClose={() => setReactingTo(null)} />
        )}
        {suggestions.length > 0 && (
          <EmojiSuggestionList suggestions={suggestions} activeIndex={activeSuggestion}
            onPick={pickSuggestion} onHover={setSuggestionIndex} />
        )}
        <EmojiPickerButton onPick={insertEmoji} disabled={sending} roomDiscordServerID={roomServerID} />
        <textarea ref={composer} className={styles.input} rows={2} value={draft} disabled={sending}
          placeholder={`Message ${conversation.name}${conversation.platform ? ` on ${conversation.platform}` : ''} — Enter sends, : finds an emoji, +:name: reacts to the newest message`}
          onChange={e => { setDraft(e.target.value); setCursor(e.target.selectionStart); setSuggestionIndex(0) }}
          onSelect={e => setCursor(e.currentTarget.selectionStart)}
          onKeyDown={e => {
            if (suggestions.length > 0 && !e.nativeEvent.isComposing) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setSuggestionIndex((activeSuggestion + step + suggestions.length) % suggestions.length)
                return
              }
              if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                const suggestion = suggestions[activeSuggestion]
                if (!suggestion.disabledReason) { e.preventDefault(); pickSuggestion(suggestion); return }
                if (e.key === 'Tab') return
              }
              if (e.key === 'Escape') { e.preventDefault(); setDismissedColonAt(colonQuery?.start ?? null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
          }} />
        <button type="button" className="bi-save-btn" disabled={sending || !draft.trim()} onClick={() => { void send() }}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {sendError && <pre className={styles.error}>{sendError}</pre>}
      {reactionError && <pre className={styles.error}>{reactionError}</pre>}
    </div>
  )
}

/** The room's member count, which opens to list every member but us: their
 *  display name, and their Matrix user id on hover. */
function MemberList({ conversation }: { conversation: MultichatConversation }) {
  const members = conversation.members ?? []
  const count = <>{conversation.member_count} members</>
  if (members.length === 0) return <span className={styles.muted}>{count}</span>
  return (
    <details className={styles.memberList}>
      <summary className={styles.muted}>{count}</summary>
      <ul>
        {members.map(member => (
          <li key={member.user_id} title={member.user_id}>{member.display_name || <code>{member.user_id}</code>}</li>
        ))}
      </ul>
    </details>
  )
}

/** The Discord bridge's status, read once when a Discord room opens: its
 *  channel names, and which server the room is a channel of (whose custom
 *  emoji the pickers offer). Null for other apps, and until it answers. */
function useDiscordStatus(conversation: MultichatConversation): DiscordBridgeStatus | null {
  const { read } = useMultichat()
  const isDiscord = conversation.platform === DISCORD_PLATFORM
  const [status, setStatus] = useState<DiscordBridgeStatus | null>(null)
  useEffect(() => {
    if (!isDiscord) return
    let cancelled = false
    read<DiscordBridgeStatus>('/discord/status')
      .then(answer => { if (!cancelled) setStatus(answer) })
      .catch(err => console.error('Discord channel names and custom emoji are not available:', err))
    return () => { cancelled = true }
  }, [isDiscord, read])
  return status
}

/** Names for the Discord tokens a Discord room's messages can still carry
 *  (a channel mention the bridge leaves as `<#id>`): channels from the bridge
 *  status, read once when a Discord room opens, and users from the room's own
 *  senders. Other apps get none. A failed status read only leaves channel ids
 *  unnamed, so it is logged rather than shown over the thread. */
function useDiscordNames(conversation: MultichatConversation, messages: MultichatMessage[] | null,
  status: DiscordBridgeStatus | null): DiscordNames {
  const isDiscord = conversation.platform === DISCORD_PLATFORM
  return useMemo(() => {
    if (!isDiscord) return NO_DISCORD_NAMES
    const senders = (messages ?? []).map(m => ({ sender_user_id: m.sender, sender_display_name: m.sender_name ?? '' }))
    return discordNamesOf(bridgedChannelsOf(status), senders)
  }, [isDiscord, status, messages])
}
