import { createElement, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useBridgeConfig } from '../../context'
import { remarkDiscordInline } from '../../discordMarkdown'
import {
  MESSAGE_IMAGE_THUMBNAIL, isImageMedia, mediaPathOfMxc, messageBodyKind, sanitizeMatrixHtml,
  type DiscordNames, type SafeNode,
} from '../../messageBody'
import { attachmentKind, mediaCaption, mediaFileName } from '../../messageAttachments'
import { groupReactions, reactionChipAction, reactionFace, reactionTooltip } from '../../messageReactions'
import type { MessageReactionGroup } from '@kayushkin/multichat-types'
import styles from './Messages.module.css'

/** The fields of a message the renderer reads. Both multichat records carry
 *  them: a conversation message calls its type `msg_type`, a log row
 *  `message_type`, so the caller passes it. */
export interface MessageContentFields {
  body: string
  format?: string
  formatted_body?: string
  media_url?: string
  media_mimetype?: string
  /** A media message's file name when the sender set one; then body is its caption. */
  file_name?: string
}

/**
 * One message's content, the same on Conversations and the Discord page:
 * Matrix HTML sanitized (see `sanitizeMatrixHtml`), Discord markdown for an
 * archive row, plain text otherwise; an image as a thumbnail that opens large
 * in the page, a video or audio file as a player, any other file as a link,
 * each with the caption sent with it.
 */
export function MessageContent({ message, messageType, discordNames }: {
  message: MessageContentFields
  messageType: string
  discordNames: DiscordNames
}) {
  const { multichatBasePath } = useBridgeConfig()
  if (message.media_url) return <MessageMedia message={message} messageType={messageType} multichatBasePath={multichatBasePath} />
  switch (messageBodyKind(message)) {
    case 'matrix-html':
      return <MatrixHtml html={message.formatted_body ?? ''} multichatBasePath={multichatBasePath} discordNames={discordNames} />
    case 'discord-markdown':
      return <DiscordMarkdown text={message.body} discordNames={discordNames} />
    case 'plain':
      return <div className={styles.plainText}>{message.body}</div>
  }
}

function MessageMedia({ message, messageType, multichatBasePath }: {
  message: MessageContentFields
  messageType: string
  multichatBasePath: string
}) {
  const [viewing, setViewing] = useState(false)
  const full = mediaPathOfMxc(multichatBasePath, message.media_url ?? '')
  const caption = mediaCaption(message)
  const fileName = mediaFileName(message)
  if (!full) return <div className={styles.plainText}>{message.body} <span className={styles.muted}>(no valid media address)</span></div>
  const kind = attachmentKind(message.media_mimetype ?? '')
  let media: ReactNode
  if (isImageMedia(message)) {
    const thumbnail = mediaPathOfMxc(multichatBasePath, message.media_url ?? '', MESSAGE_IMAGE_THUMBNAIL)!
    media = (
      <>
        <button type="button" className={styles.imageLink} title={`${fileName} — view larger`} onClick={() => setViewing(true)}>
          <img className={styles.messageImage} src={thumbnail} alt={caption || fileName} loading="lazy" />
        </button>
        {viewing && <ImageViewer src={full} alt={caption || fileName} onClose={() => setViewing(false)} />}
      </>
    )
  } else if (kind === 'video') {
    media = <video className={styles.messageVideo} src={full} controls preload="metadata" title={fileName} />
  } else if (kind === 'audio') {
    media = <audio src={full} controls preload="metadata" title={fileName} />
  } else {
    media = (
      <div className={styles.plainText}>
        <span className={styles.muted}>{messageType.replace(/^m\./, '')} </span>
        <a href={full} target="_blank" rel="noopener noreferrer">{fileName || 'open'}</a>
      </div>
    )
  }
  return (
    <div className={styles.mediaMessage}>
      {media}
      {caption && <div className={styles.plainText}>{caption}</div>}
    </div>
  )
}

/** An image shown large over the page; a click outside it or Escape closes it. */
function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return (
    <div className={styles.imageViewer} role="dialog" aria-label={alt} onClick={onClose}>
      <img src={src} alt={alt} onClick={event => event.stopPropagation()} />
      <div className={styles.imageViewerBar} onClick={event => event.stopPropagation()}>
        <a href={src} target="_blank" rel="noopener noreferrer">Open the original</a>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function MatrixHtml({ html, multichatBasePath, discordNames }: { html: string; multichatBasePath: string; discordNames: DiscordNames }) {
  const nodes = useMemo(() => {
    // DOMParser builds an inert document: no script runs and nothing loads.
    const document = new DOMParser().parseFromString(html, 'text/html')
    return sanitizeMatrixHtml(document.body, { multichatBasePath, discordNames })
  }, [html, multichatBasePath, discordNames])
  return <div className={styles.richText}>{renderSafeNodes(nodes)}</div>
}

const VOID_TAGS = new Set(['br', 'hr'])

function renderSafeNodes(nodes: readonly SafeNode[]): ReactNode[] {
  return nodes.map((node, index) => renderSafeNode(node, index))
}

function renderSafeNode(node: SafeNode, key: number): ReactNode {
  switch (node.kind) {
    case 'text':
      return node.text
    case 'mention':
      return <span key={key} className={styles.mention} title={node.title}>{node.label}</span>
    case 'image':
      return node.emoticon
        ? <img key={key} className={styles.inlineEmoji} src={node.src} alt={node.alt} title={node.title} />
        : <img key={key} className={styles.inlineImage} src={node.src} alt={node.alt} title={node.title} width={node.width} height={node.height} loading="lazy" />
    case 'element': {
      const props: Record<string, unknown> = { key }
      for (const [name, value] of Object.entries(node.attributes)) {
        if (name === 'class') props.className = value
        else if (name === 'start') props.start = Number(value)
        else if (name === 'data-mx-spoiler') { props.className = styles.spoiler; props.title = 'Spoiler' }
        else props[name] = value
      }
      return VOID_TAGS.has(node.tag) ? createElement(node.tag, props) : createElement(node.tag, props, ...renderSafeNodes(node.children))
    }
  }
}

type MarkdownComponents = ComponentProps<typeof ReactMarkdown>['components']
type MarkdownPlugins = ComponentProps<typeof ReactMarkdown>['remarkPlugins']

/** Links leave for a new tab; raw HTML is dropped (react-markdown's default),
 *  and so are `javascript:` links. */
const DISCORD_MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

function DiscordMarkdown({ text, discordNames }: { text: string; discordNames: DiscordNames }) {
  const plugins = useMemo(() => [
    remarkGfm,
    [remarkDiscordInline, { names: discordNames, emojiClassName: styles.inlineEmoji, mentionClassName: styles.mention }],
  ] as unknown as MarkdownPlugins, [discordNames])
  return (
    <div className={styles.richText}>
      <ReactMarkdown remarkPlugins={plugins} components={DISCORD_MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
    </div>
  )
}

/** The reactions under a message, one chip per emoji with its count. With
 *  `onChipClick` a chip is a button: it adds our reaction with that emoji, or
 *  takes back the one we posted (see `reactionChipAction`); ours is marked. */
export function ReactionChips({ reactions, onChipClick, busy }: {
  reactions: readonly MessageReactionGroup[] | null | undefined
  onChipClick?: (reaction: MessageReactionGroup) => void
  busy?: boolean
}) {
  const { multichatBasePath } = useBridgeConfig()
  const grouped = useMemo(() => groupReactions(reactions ?? []), [reactions])
  if (grouped.length === 0) return null
  return (
    <div className={styles.reactions}>
      {grouped.map(reaction => {
        const face = reactionFace(reaction, multichatBasePath)
        const drawn = (
          <>
            {face.kind === 'image'
              ? <img className={styles.reactionImage} src={face.src} alt={face.alt} />
              : <span className={styles.reactionText}>{face.text}</span>}
            <span className={styles.reactionCount}>{reaction.count}</span>
          </>
        )
        const className = `${styles.reactionChip} ${reaction.reacted_by_me ? styles.reactionChipMine : ''}`
        if (!onChipClick) {
          return (
            <span key={reaction.key} className={className} title={reactionTooltip(reaction)} data-reaction-key={reaction.key}>
              {drawn}
            </span>
          )
        }
        const action = reactionChipAction(reaction)
        const hint = action.kind === 'post' ? 'Click to add yours.'
          : action.kind === 'take-back' ? 'Click to take yours back.'
          : 'You reacted in the app; take it back there.'
        return (
          <button key={reaction.key} type="button" className={className} data-reaction-key={reaction.key}
            title={`${reactionTooltip(reaction)}\n${hint}`} aria-pressed={reaction.reacted_by_me}
            disabled={busy || action.kind === 'made-in-the-app'} onClick={() => onChipClick(reaction)}>
            {drawn}
          </button>
        )
      })}
    </div>
  )
}
