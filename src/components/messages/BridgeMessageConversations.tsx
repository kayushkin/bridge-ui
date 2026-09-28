import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DiscordBridgeStatus } from '@kayushkin/multichat-types'
import { bridgedChannelsOf, DISCORD_PLATFORM } from '../../discordLog'
import { insertAtSelection } from '../../emojiPicker'
import { discordNamesOf, NO_DISCORD_NAMES, type DiscordNames } from '../../messageBody'
import {
  conversationMessagesPath, conversationPlatforms, conversationSendPath, conversationTags, filterConversations,
  conversationPreviewText, foldEdits, mergeNewestMessages, messageTimeLabel, pageMessages, prependOlderMessages, sameMessages, sendMessageBodyOf,
  reactionPostPath, reactionTakeBackPath, reactionTargetEventID, type ShownMessage,
} from '../../multichatMessages'
import { reactionChipAction, withReactionPosted, withReactionTakenBack } from '../../messageReactions'
import type { MessageReactionGroup } from '@kayushkin/multichat-types'
import type {
  MultichatContactTagMap, MultichatConversation, MultichatMessage, MultichatMessagePage, MultichatSendAnswer,
} from '../../types-multichat'
import { errorText, useMultichat } from './useMultichat'
import { MultichatNotConfigured, TagChips } from './messagesShared'
import { MessageContent, ReactionChips } from './MessageContent'
import { EmojiPickerButton, EmojiPickerPanel } from './EmojiPicker'
import styles from './Messages.module.css'

const CONVERSATIONS_POLL_MS = 30_000
const MESSAGES_POLL_MS = 5_000
/** Distance from the bottom, in pixels, still counted as reading the newest. */
const AT_BOTTOM_PX = 40

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
              <input className={styles.input} type="search" value={text} placeholder="Filter by name or last message"
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
                      <span className={styles.name}>{conversation.name}</span>
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
  const discordNames = useDiscordNames(conversation, messages)
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
  const insertEmoji = (emoji: string) => {
    const el = composer.current
    const next = insertAtSelection(draft, el?.selectionStart ?? draft.length, el?.selectionEnd ?? draft.length, emoji)
    pendingCursor.current = next.cursor
    setDraft(next.text)
  }

  const send = async () => {
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
   *  people in the room. */
  const postReaction = async (message: ShownMessage, key: string) => {
    const target = reactionTargetEventID(message)
    setReacting(true)
    const posted = await write<{ event_id: string }>('POST', reactionPostPath(roomID), { event_id: target, key })
    setReacting(false)
    if (!posted.ok) { setReactionError(posted.error); return }
    setReactionError(null)
    updateReactions(target, reactions => withReactionPosted(reactions, key, posted.value.event_id, 'You'))
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
    if (action.kind === 'post') void postReaction(message, action.key)
    if (action.kind === 'take-back') void takeBackReaction(message, action.reactionEventID)
  }

  return (
    <div className={styles.thread}>
      <div className={styles.threadBar}>
        <span className={styles.name}>{conversation.name}</span>
        {conversation.platform && <span className={styles.platform}>{conversation.platform}</span>}
        <span className={styles.muted}>{conversation.member_count} members</span>
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
              <button type="button" className={styles.reactButton} disabled={reacting}
                aria-expanded={reactingTo?.event_id === message.event_id}
                title="React to this message" aria-label="React to this message"
                onClick={() => setReactingTo(current => current?.event_id === message.event_id ? null : message)}>
                {'\u{1F642}'}
              </button>
            </div>
          ))
        )}
      </div>
      <div className={styles.composer}>
        {reactingTo && (
          <EmojiPickerPanel
            heading={`React to ${reactingTo.is_me ? 'your' : `${reactingTo.sender_name || reactingTo.sender}'s`} message: “${reactingTo.body.slice(0, 60)}${reactingTo.body.length > 60 ? '…' : ''}”`}
            onPick={emoji => { const message = reactingTo; setReactingTo(null); void postReaction(message, emoji) }}
            onClose={() => setReactingTo(null)} />
        )}
        <EmojiPickerButton onPick={insertEmoji} disabled={sending} />
        <textarea ref={composer} className={styles.input} rows={2} value={draft} disabled={sending}
          placeholder={`Message ${conversation.name}${conversation.platform ? ` on ${conversation.platform}` : ''} — Enter sends, Shift+Enter is a new line`}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
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

/** Names for the Discord tokens a Discord room's messages can still carry
 *  (a channel mention the bridge leaves as `<#id>`): channels from the bridge
 *  status, read once when a Discord room opens, and users from the room's own
 *  senders. Other apps get none. A failed status read only leaves channel ids
 *  unnamed, so it is logged rather than shown over the thread. */
function useDiscordNames(conversation: MultichatConversation, messages: MultichatMessage[] | null): DiscordNames {
  const { read } = useMultichat()
  const isDiscord = conversation.platform === DISCORD_PLATFORM
  const [status, setStatus] = useState<DiscordBridgeStatus | null>(null)
  useEffect(() => {
    if (!isDiscord) return
    let cancelled = false
    read<DiscordBridgeStatus>('/discord/status')
      .then(answer => { if (!cancelled) setStatus(answer) })
      .catch(err => console.error('Discord channel names are not available:', err))
    return () => { cancelled = true }
  }, [isDiscord, read])
  return useMemo(() => {
    if (!isDiscord) return NO_DISCORD_NAMES
    const senders = (messages ?? []).map(m => ({ sender_user_id: m.sender, sender_display_name: m.sender_name ?? '' }))
    return discordNamesOf(bridgedChannelsOf(status), senders)
  }, [isDiscord, status, messages])
}
