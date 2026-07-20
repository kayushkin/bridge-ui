import { visit, SKIP } from 'unist-util-visit'
import type { Root, Text, PhrasingContent } from 'mdast'

// A reference chip detected inside message text. `kind` selects which backend
// the RefChip component queries and how it renders; `refId` is the exact id
// string to look up.
export type RefKind = 'session' | 'todo'

// The mdast node this plugin produces for a matched reference. `data.hName` /
// `data.hProperties` instruct mdast-util-to-hast to emit a <ref-chip> hast
// element, which react-markdown then routes to the RefChip component through
// its `components` map. The id travels in `hProperties.refId` and arrives
// verbatim on the hast element's `properties`.
interface RefChipNode {
  type: 'refChip'
  data: {
    hName: 'ref-chip'
    hProperties: { kind: RefKind; refId: string }
  }
  children: Text[]
}

// Bridge session ids are unambiguous on their own, so they are linkified
// wherever they appear:
//   - br_<16-19 digit snowflake>                    (interactive/frontend)
//   - herald-<snowflake>, herald-a-b-<snowflake>    (Herald ask sessions)
//   - autoworker-<segments>-<snowflake>             (autoworker sessions)
// Noteboard item (todo) ids are plain UUIDs, which collide with harness
// session UUIDs and other unrelated uuids, so a todo is linkified ONLY when a
// cue word (todo / item / card, optionally with an _id suffix) immediately
// precedes it. The cue word itself is left as plain text; only the uuid
// becomes a chip.
const SESSION_ID = String.raw`br_\d{16,19}|(?:herald|autoworker)(?:-[a-z0-9]+)*-\d{16,19}`
const UUID = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
const TODO_CUE = String.raw`todo_id|item_id|card_id|todo|item|card`

// Group layout:
//   1 = session id (whole match is the chip)
//   2 = todo cue word    3 = separator    4 = todo uuid
const TOKEN_RE = new RegExp(
  String.raw`\b(${SESSION_ID})\b` +
    String.raw`|\b(${TODO_CUE})([\s:=#]{1,4})(${UUID})\b`,
  'gi',
)

function chip(kind: RefKind, refId: string): RefChipNode {
  return {
    type: 'refChip',
    data: { hName: 'ref-chip', hProperties: { kind, refId } },
    children: [{ type: 'text', value: refId }],
  }
}

// remarkRefChips rewrites bare session ids and cue-prefixed todo uuids inside
// text nodes into <ref-chip> elements. It leaves text inside existing links
// alone (a linkified id keeps its link) and never descends into the nodes it
// just inserted, so an id is wrapped exactly once.
export function remarkRefChips() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (index === undefined || parent === undefined) return
      if (parent.type === 'link') return

      const value = node.value
      TOKEN_RE.lastIndex = 0
      const out: PhrasingContent[] = []
      let last = 0
      let match: RegExpExecArray | null
      while ((match = TOKEN_RE.exec(value)) !== null) {
        if (match.index > last) {
          out.push({ type: 'text', value: value.slice(last, match.index) })
        }
        if (match[1]) {
          out.push(chip('session', match[1]) as unknown as PhrasingContent)
        } else {
          // Keep the cue word + separator as plain text; chip only the uuid.
          out.push({ type: 'text', value: match[2] + match[3] })
          out.push(chip('todo', match[4]) as unknown as PhrasingContent)
        }
        last = match.index + match[0].length
      }
      if (out.length === 0) return
      if (last < value.length) {
        out.push({ type: 'text', value: value.slice(last) })
      }
      parent.children.splice(index, 1, ...out)
      // Resume after the inserted nodes so their text is never re-scanned.
      return [SKIP, index + out.length]
    })
  }
}
