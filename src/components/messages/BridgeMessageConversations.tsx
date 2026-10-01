import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DiscordBridgeStatus } from '@kayushkin/multichat-types'
import { bridgedChannelsOf, DISCORD_PLATFORM } from '../../discordLog'
import { insertAtSelection } from '../../emojiPicker'
import { discordNamesOf, NO_DISCORD_NAMES, type DiscordNames } from '../../messageBody'
import {
  conversationMessagesPath, conversationOwnTags, conversationPartnerTags, conversationPlatforms, conversationSendFilePath, conversationSendPath, conversationShownName,
  conversationTagAssignBody, conversationTagRemovePath, conversationTags, filterConversations, type ConversationTagMaps,
  conversationEntries, conversationEntryOf, conversationLinkBody, conversationLinkCandidates, conversationTabLabel, conversationUnlinkBody, type ConversationEntry,
  conversationPreviewText, foldEdits, mergeNewestMessages, messageTimeLabel, pageMessages, prependOlderMessages, sameMessages, sendMessageBodyOf,
  reactionPostPath, reactionTakeBackPath, reactionTargetEventID, type ShownMessage,
} from '../../multichatMessages'
import { reactionChipAction, withReactionPosted, withReactionTakenBack } from '../../messageReactions'
import {
  allCustomEmoji, choiceNamed, colonQueryAt, colonQueryIsReactionCommand, reactionCommandOf, reactionGroupIsEmoji, roomDiscordServerID, type DiscordRoom,
  searchEmojiIndex, type EmojiChoice,
} from '../../emojiCatalog'
import type { ConversationLink, MessageReactionGroup } from '@kayushkin/multichat-types'
import type {
  MultichatContactTagMap, MultichatConversation, MultichatConversationTagMap, MultichatMessage, MultichatMessagePage,
  MultichatSendAnswer, MultichatSendFileAnswer, MultichatTag,
} from '../../types-multichat'
import { errorText, useMultichat } from './useMultichat'
import { MultichatNotConfigured, TagChip, TagChips } from './messagesShared'
import { MessageContent, ReactionChips } from './MessageContent'
import { EmojiFace, EmojiPickerButton, EmojiPickerPanel, EmojiSuggestionList, useEmojiChoices, type EmojiSuggestion } from './EmojiPicker'
import { useEmojiCatalog, useDailyNitroCheck } from './useEmojiCatalog'
import { captionsForFiles, humanFileSize, pendingAttachment, type PendingAttachment } from '../../messageAttachments'
import { filesFromPaste } from '../../sessionFileAttachments'
import styles from './Messages.module.css'
import { ConversationPerson } from './PersonLinks'

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
  useDailyNitroCheck()
  const { read, write, configured } = useMultichat()
  const [conversations, setConversations] = useState<MultichatConversation[] | null>(null)
  const [tags, setTags] = useState<MultichatTag[]>([])
  const [tagMaps, setTagMaps] = useState<ConversationTagMaps>({ contactTagMap: {}, conversationTagMap: {} })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [links, setLinks] = useState<ConversationLink[]>([])
  const [linksError, setLinksError] = useState<string | null>(null)
  const [platform, setPlatform] = useState('')
  const [text, setText] = useState('')
  const [tagID, setTagID] = useState<number | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const roomID = searchParams.get('room') ?? ''

  const reloadTags = useCallback(async () => {
    const [nextTags, contactTagMap, conversationTagMap] = await Promise.all([
      read<MultichatTag[] | null>('/tags'),
      read<MultichatContactTagMap | null>('/contacts/tags/bulk'),
      read<MultichatConversationTagMap | null>('/conversations/tags/bulk'),
    ])
    setTags(nextTags ?? [])
    setTagMaps({ contactTagMap: contactTagMap ?? {}, conversationTagMap: conversationTagMap ?? {} })
  }, [read])

  const reload = useCallback(async () => {
    try {
      setConversations(await read<MultichatConversation[] | null>('/conversations') ?? [])
      setLoadError(null)
    } catch (err) {
      setLoadError(errorText(err))
    }
    // Links only group the rows, so the list still shows, one row per room, when they fail.
    try {
      setLinks(await read<ConversationLink[] | null>('/conversations/links') ?? [])
      setLinksError(null)
    } catch (err) {
      setLinksError(errorText(err))
    }
    // Tags only label and filter the rows, so the list still shows when they fail.
    try {
      await reloadTags()
      setTagsError(null)
    } catch (err) {
      setTagsError(errorText(err))
    }
  }, [read, reloadTags])

  /** A link write, then the links read back from multichat; the refusal, or null. */
  const writeLinks = useCallback(async (path: string, body: unknown): Promise<string | null> => {
    const result = await write('POST', path, body)
    if (!result.ok) return result.error
    try {
      setLinks(await read<ConversationLink[] | null>('/conversations/links') ?? [])
      return null
    } catch (err) {
      return errorText(err)
    }
  }, [write, read])

  /** A tag write, then the tags read back from multichat; the refusal, or null. */
  const writeTags = useCallback(async (method: string, path: string, body?: unknown): Promise<string | null> => {
    const result = await write(method, path, body)
    if (!result.ok) return result.error
    try {
      await reloadTags()
      return null
    } catch (err) {
      return errorText(err)
    }
  }, [write, reloadTags])

  useEffect(() => {
    if (!configured) return
    void reload()
    const timer = window.setInterval(() => { void reload() }, CONVERSATIONS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [configured, reload])

  const platforms = useMemo(() => conversationPlatforms(conversations ?? []), [conversations])
  const shown = useMemo(
    () => filterConversations(conversations ?? [], tagMaps, { platform, text, tagID }),
    [conversations, tagMaps, platform, text, tagID],
  )
  const shownEntries = useMemo(() => conversationEntries(conversations ?? [], shown, links), [conversations, shown, links])
  const pickedEntry = useMemo(
    () => conversationEntryOf(conversationEntries(conversations ?? [], conversations ?? [], links), roomID),
    [conversations, links, roomID],
  )
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
      {linksError && <pre className={styles.error}>Linked conversations are listed apart: {linksError}</pre>}
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
              <select className={styles.input} value={tagID ?? ''} title="A room's tags are its own, plus the other person's in a DM"
                onChange={e => setTagID(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Any tag or none</option>
                {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </div>
            {shown.length === 0 && (
              <div className={styles.empty}>{conversations.length === 0 ? 'No conversations.' : 'No conversation matches.'}</div>
            )}
            <ul className={styles.list}>
              {shownEntries.map(entry => {
                const newest = entry.conversations[0]
                const selected = entry.conversations.some(conversation => conversation.room_id === roomID)
                const entryTags = [...new Map(entry.conversations.flatMap(conversation => conversationTags(conversation, tagMaps)).map(tag => [tag.id, tag])).values()]
                return (
                  <li key={newest.room_id}>
                    <button type="button" data-room-id={newest.room_id} data-link-id={entry.linkID ?? undefined}
                      className={`${styles.row} ${styles.rowPick} ${selected ? styles.rowSelected : ''}`}
                      onClick={() => pick(selected ? roomID : newest.room_id)}>
                      <span className={styles.rowHead}>
                        <span className={styles.name} title={newest.name}>{conversationShownName(newest)}</span>
                        {newest.last_activity > 0 && <span className={styles.time}>{messageTimeLabel(newest.last_activity)}</span>}
                      </span>
                      <span className={styles.rowMeta}>
                        {entry.conversations.map(conversation => conversation.platform && (
                          <span key={conversation.room_id} className={styles.platform}>{conversation.platform}</span>
                        ))}
                        {newest.member_count > 2 && <span className={styles.muted}>{newest.member_count} members</span>}
                        <TagChips tags={entryTags} />
                      </span>
                      {newest.last_message && <span className={styles.preview}>{conversationPreviewText(newest.last_message)}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className={styles.viewer}>
            {picked && pickedEntry && pickedEntry.conversations.length > 1 && (
              <ConversationTabs entry={pickedEntry} roomID={roomID} onPick={pick} />
            )}
            {picked ? (
              <ConversationThread key={picked.room_id} conversation={picked} onSent={() => { void reload() }}
                tagEditor={<>
                  <ConversationTagEditor conversation={picked} tags={tags} tagMaps={tagMaps} write={writeTags} />
                  {pickedEntry && <ConversationLinkEditor key={picked.room_id} conversation={picked} entry={pickedEntry} conversations={conversations} write={writeLinks} />}
                  {picked.direct_message_partner_user_id && <ConversationPerson key={picked.direct_message_partner_user_id} partnerUserID={picked.direct_message_partner_user_id} />}
                </>} />
            ) : (
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
function ConversationThread({ conversation, onSent, tagEditor }: {
  conversation: MultichatConversation
  onSent: () => void
  /** Drawn under the room's name. */
  tagEditor: ReactNode
}) {
  const { read, write, writeForm } = useMultichat()
  /** Files waiting in the composer, sent with the next Send. */
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  /** Which file of how many is going now, while files send. */
  const [fileProgress, setFileProgress] = useState<{ done: number; total: number } | null>(null)
  /** A drag carrying files is over the thread. */
  const [dragging, setDragging] = useState(false)
  const filePicker = useRef<HTMLInputElement | null>(null)
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
  // A Discord room: a server's channel, or a DM, which has no server.
  const discordRoom: DiscordRoom | null = useMemo(() => (conversation.platform === DISCORD_PLATFORM
    ? { serverID: roomDiscordServerID(discordStatus, roomID) } : null), [conversation.platform, discordStatus, roomID])
  const emoji = useEmojiChoices('reaction', discordRoom)
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
      return searchEmojiIndex(emoji.pickableIndex, colonQuery.query, emoji.favoriteKeys, SUGGESTION_LIMIT)
        .map(choice => ({ choice }))
    }
    return [
      ...searchEmojiIndex(emoji.unicodeIndex, colonQuery.query, emoji.favoriteKeys, SUGGESTION_LIMIT).map(choice => ({ choice })),
      ...searchEmojiIndex(emoji.customIndex, colonQuery.query, emoji.favoriteKeys, 3)
        .map(choice => ({ choice, disabledReason: CUSTOM_EMOJI_IN_MESSAGE_REASON })),
    ]
  }, [colonQuery, dismissedColonAt, inReactionCommand, emoji.pickableIndex, emoji.unicodeIndex, emoji.customIndex, emoji.favoriteKeys])
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

  const addFiles = (files: readonly File[], pasted: boolean) => {
    if (files.length === 0) return
    const now = new Date()
    setAttachments(current => [...current, ...files.map(file => pendingAttachment(file, pasted, now))])
    setSendError(null)
    composer.current?.focus()
  }

  /** Sends the waiting files one by one, the typed text as the first one's
   *  caption. A file that fails stops the rest; it and those after it stay in
   *  the composer, and the text stays unless it already went. */
  const sendFiles = async () => {
    const captions = captionsForFiles(draft, attachments.length)
    setSending(true)
    for (let index = 0; index < attachments.length; index++) {
      const attachment = attachments[index]
      setFileProgress({ done: index + 1, total: attachments.length })
      const form = new FormData()
      form.append('file', attachment.file, attachment.name)
      if (captions[index]) form.append('caption', captions[index])
      const sent = await writeForm<MultichatSendFileAnswer>(conversationSendFilePath(roomID), form)
      if (!sent.ok) {
        setSendError(`${attachment.name} was not sent: ${sent.error}`)
        setAttachments(current => current.filter(pending => attachments.slice(index).some(a => a.id === pending.id)))
        break
      }
      if (index === 0) setDraft('')
      if (index === attachments.length - 1) {
        setSendError(null)
        setAttachments([])
      }
    }
    setFileProgress(null)
    setSending(false)
    onSent()
    try { await refreshNewest(true) } catch (err) { setError(errorText(err)) }
  }

  const send = async () => {
    if (attachments.length > 0) { await sendFiles(); return }
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
    const group = (message.reactions ?? []).find(g => reactionGroupIsEmoji(g, choice.key, allCustomEmoji(catalog)))
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
    <div className={`${styles.thread} ${dragging ? styles.threadDragging : ''}`}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(false)
        addFiles(Array.from(event.dataTransfer.files), false)
      }}>
      {dragging && <div className={styles.dropHint}>Drop to attach — nothing is sent until you press Send</div>}
      <div className={styles.threadBar}>
        <span className={styles.name} title={conversation.name}>{conversationShownName(conversation)}</span>
        {conversation.platform && <span className={styles.platform}>{conversation.platform}</span>}
        <MemberList conversation={conversation} />
        <code className={styles.roomID} title="Matrix room id">{roomID}</code>
      </div>
      {tagEditor}
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
                  const group = (message.reactions ?? []).find(g => reactionGroupIsEmoji(g, choice.key, allCustomEmoji(catalog)))
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
      {attachments.length > 0 && (
        <ul className={styles.attachmentTray} aria-label="Files to send">
          {attachments.map(attachment => (
            <li key={attachment.id} className={styles.attachment}>
              <AttachmentPreview attachment={attachment} />
              <span className={styles.attachmentName} title={attachment.name}>{attachment.name}</span>
              <span className={styles.muted}>{humanFileSize(attachment.file.size)}</span>
              <button type="button" className={styles.emojiPanelClose} disabled={sending} aria-label={`Remove ${attachment.name}`}
                onClick={() => setAttachments(current => current.filter(pending => pending.id !== attachment.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.composer}>
        {reactingTo && (
          <EmojiPickerPanel
            heading={`React to ${reactingTo.is_me ? 'your' : `${reactingTo.sender_name || reactingTo.sender}'s`} message: “${reactingTo.body.slice(0, 60)}${reactingTo.body.length > 60 ? '…' : ''}”`}
            purpose="reaction" discordRoom={discordRoom}
            onPick={choice => { const message = reactingTo; setReactingTo(null); void postReaction(message, choice) }}
            onClose={() => setReactingTo(null)} />
        )}
        {suggestions.length > 0 && (
          <EmojiSuggestionList suggestions={suggestions} activeIndex={activeSuggestion}
            onPick={pickSuggestion} onHover={setSuggestionIndex} />
        )}
        <input ref={filePicker} type="file" multiple hidden
          onChange={event => { addFiles(Array.from(event.target.files ?? []), false); event.target.value = '' }} />
        <button type="button" className={styles.emojiButton} disabled={sending} title="Attach images or files (or paste or drop them here)"
          aria-label="Attach files" onClick={() => filePicker.current?.click()}>📎</button>
        <EmojiPickerButton onPick={insertEmoji} disabled={sending} discordRoom={discordRoom} />
        <textarea ref={composer} className={styles.input} rows={2} value={draft} disabled={sending}
          placeholder={`Message ${conversation.name}${conversation.platform ? ` on ${conversation.platform}` : ''} — Enter sends, : finds an emoji, +:name: reacts to the newest message`}
          onChange={e => { setDraft(e.target.value); setCursor(e.target.selectionStart); setSuggestionIndex(0) }}
          onSelect={e => setCursor(e.currentTarget.selectionStart)}
          onPaste={e => {
            const { files, keepText } = filesFromPaste({ files: e.clipboardData.files, types: Array.from(e.clipboardData.types) })
            if (files.length === 0) return
            if (!keepText) e.preventDefault()
            addFiles(files, true)
          }}
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
        <button type="button" className="bi-save-btn" disabled={sending || (!draft.trim() && attachments.length === 0)} onClick={() => { void send() }}>
          {fileProgress ? `Sending ${fileProgress.done} of ${fileProgress.total}…` : sending ? 'Sending…' : 'Send'}
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

/** The open room's tags. Its own come off with ×, and the list adds one. In a
 *  DM the other person's tags show too, dashed; they belong to the contact and
 *  change on the Contacts page. */
function ConversationTagEditor({ conversation, tags, tagMaps, write }: {
  conversation: MultichatConversation
  tags: MultichatTag[]
  tagMaps: ConversationTagMaps
  write: (method: string, path: string, body?: unknown) => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const roomID = conversation.room_id
  const own = conversationOwnTags(conversation, tagMaps.conversationTagMap)
  const fromPartner = conversationPartnerTags(conversation, tagMaps.contactTagMap)
  const addable = tags.filter(tag => !own.some(on => on.id === tag.id))
  const run = async (method: string, path: string, body?: unknown) => {
    setBusy(true)
    setError(await write(method, path, body))
    setBusy(false)
  }
  return (
    <div className={styles.threadTags} data-room-tags={roomID}>
      <span className={styles.muted}>Tags</span>
      {own.map(tag => (
        <TagChip key={tag.id} tag={tag} disabled={busy}
          onRemove={() => { void run('DELETE', conversationTagRemovePath(roomID, tag.id)) }} />
      ))}
      {fromPartner.map(tag => (
        <span key={`contact-${tag.id}`} className={styles.tagFromContact} title="On the contact; change it on the Contacts page">
          <TagChip tag={tag} />
        </span>
      ))}
      {tags.length === 0 ? <span className={styles.muted}>No tags exist yet; add one on the Contacts page.</span> : addable.length > 0 && (
        <select className={styles.tagSelect} value="" disabled={busy}
          onChange={e => { if (e.target.value) void run('POST', '/conversations/tags', conversationTagAssignBody(roomID, Number(e.target.value))) }}>
          <option value="">+ Tag this conversation</option>
          {addable.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
      )}
      {error && <pre className={styles.error}>{error}</pre>}
    </div>
  )
}

/** One tab per room of a link: the chats on different apps that are one
 *  conversation. Each tab opens its own room to read and answer in. */
function ConversationTabs({ entry, roomID, onPick }: {
  entry: ConversationEntry
  roomID: string
  onPick: (roomID: string) => void
}) {
  return (
    <nav className={styles.tabs} data-link-id={entry.linkID ?? undefined}>
      {entry.conversations.map(conversation => (
        <button key={conversation.room_id} type="button" title={conversationShownName(conversation)}
          className={`${styles.tab} ${conversation.room_id === roomID ? styles.tabActive : ''}`}
          onClick={() => onPick(conversation.room_id)}>
          {conversationTabLabel(entry, conversation)}
        </button>
      ))}
    </nav>
  )
}

/** Link this room with a chat on another app that is the same conversation,
 *  or take it out of its link. */
function ConversationLinkEditor({ conversation, entry, conversations, write }: {
  conversation: MultichatConversation
  entry: ConversationEntry
  conversations: readonly MultichatConversation[]
  write: (path: string, body: unknown) => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const roomID = conversation.room_id
  const candidates = useMemo(() => conversationLinkCandidates(conversations, entry), [conversations, entry])
  const run = async (path: string, body: unknown) => {
    setBusy(true)
    setError(await write(path, body))
    setBusy(false)
  }
  return (
    <div className={styles.threadTags} data-room-link={roomID}>
      <span className={styles.muted}>Same conversation</span>
      {candidates.length > 0 && (
        <select className={styles.tagSelect} value="" disabled={busy}
          onChange={e => { if (e.target.value) void run('/conversations/links', conversationLinkBody(roomID, e.target.value)) }}>
          <option value="">+ Link with a chat on another app</option>
          {candidates.map(candidate => (
            <option key={candidate.room_id} value={candidate.room_id}>
              {conversationShownName(candidate)}{candidate.platform ? ` (${candidate.platform})` : ''}
            </option>
          ))}
        </select>
      )}
      {entry.linkID !== null && (
        <button type="button" className={styles.tagSelect} disabled={busy}
          onClick={() => { void run('/conversations/links/remove', conversationUnlinkBody(roomID)) }}>
          Unlink this chat
        </button>
      )}
      {error && <pre className={styles.error}>{error}</pre>}
    </div>
  )
}

/** A waiting file's thumbnail: the image itself, or what kind of file it is. */
function AttachmentPreview({ attachment }: { attachment: PendingAttachment }) {
  const [url, setURL] = useState<string | null>(null)
  useEffect(() => {
    if (attachment.kind !== 'image') return
    const objectURL = URL.createObjectURL(attachment.file)
    setURL(objectURL)
    return () => URL.revokeObjectURL(objectURL)
  }, [attachment])
  if (attachment.kind === 'image' && url) return <img className={styles.attachmentThumbnail} src={url} alt="" />
  const icon = attachment.kind === 'video' ? '🎬' : attachment.kind === 'audio' ? '🎵' : attachment.kind === 'image' ? '🖼️' : '📄'
  return <span className={styles.attachmentIcon} aria-hidden="true">{icon}</span>
}
