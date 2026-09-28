// A remark plugin for Discord's markdown, as multichat's archive rows carry it
// (`format: "discord-markdown"`): custom emoji, channel and user mentions and
// timestamps become images and labels (discordInlineSegments), and a single
// newline is a line break, as Discord draws it, rather than CommonMark's
// space. Code spans and blocks are other node types, so tokens inside them
// stay as typed, as on Discord.
import type { Break, Emphasis, Image, Parent, PhrasingContent, Root, Text } from 'mdast'
import { SKIP, visit } from 'unist-util-visit'
import { discordInlineSegments, type DiscordNames } from './messageBody'

export interface DiscordInlineOptions {
  names: DiscordNames
  /** Class names for the elements the plugin makes, so a CSS module can style them. */
  emojiClassName: string
  mentionClassName: string
}

/** The mdast nodes one text node becomes. */
export function discordPhrasing(text: string, options: DiscordInlineOptions): PhrasingContent[] {
  const out: PhrasingContent[] = []
  for (const segment of discordInlineSegments(text, options.names)) {
    if (segment.kind === 'text') {
      segment.text.split('\n').forEach((line, index) => {
        if (index > 0) out.push({ type: 'break' } satisfies Break)
        if (line) out.push({ type: 'text', value: line } satisfies Text)
      })
    } else if (segment.kind === 'emoji') {
      out.push({
        type: 'image', url: segment.src, alt: segment.alt, title: segment.alt,
        data: { hProperties: { className: [options.emojiClassName] } },
      } satisfies Image)
    } else {
      out.push({
        type: 'emphasis', children: [{ type: 'text', value: segment.label }],
        data: { hName: 'span', hProperties: { className: [options.mentionClassName], title: segment.title } },
      } satisfies Emphasis)
    }
  }
  return out
}

export function remarkDiscordInline(options: DiscordInlineOptions) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return
      const replacement = discordPhrasing(node.value, options)
      if (replacement.length === 1 && replacement[0].type === 'text') return
      parent.children.splice(index, 1, ...(replacement as Parent['children']))
      return [SKIP, index + replacement.length]
    })
  }
}
