/** The closed set. Ordered by severity, loudest first — `VIBE_RANK` derives from this
 *  order rather than repeating it, so the two can never disagree. */
export declare const VIBES: readonly ["danger", "warning", "question", "action", "info", "descriptive"];
export type Vibe = (typeof VIBES)[number];
/** One glyph per vibe, for the gutter column. Kept beside the taxonomy rather than in
 *  the stylesheet so the set cannot grow a member with no glyph. */
export declare const VIBE_GLYPH: Record<Vibe, string>;
/** What the legend calls each vibe, and what a screen reader reads in place of the
 *  glyph (the stylesheet uses CSS alt text: `content: "⚠️" / "warning"`). */
export declare const VIBE_LABEL: Record<Vibe, string>;
/** A one-line gloss per vibe for the legend panel. */
export declare const VIBE_MEANING: Record<Vibe, string>;
/** The mdast node types this module classifies, reduced to what the rules actually ask
 *  about. Anything else is `other` and falls to the prose rules. */
export type BlockType = 'code' | 'table' | 'blockquote' | 'heading' | 'other';
export interface Block {
    type: BlockType;
    /** The block's own markdown source, verbatim, offsets included. */
    source: string;
}
/** One block's vibe, from the rules table alone — no section context. Exported for the
 *  legend's examples and for anything that needs a single block's verdict.
 *
 *  ⚠️ ONE DELIBERATE DIVERGENCE from the todo's rule list, and it is flagged rather
 *  than smuggled. The todo writes "leading `⚠`/`Error`/`Failed`/`Broken` → danger",
 *  which puts `⚠` in the danger row. Implemented that way, a model that writes
 *  "⚠️ the binary on :8155 is stale" gets a block rendered with 🚨 in red — the taxonomy
 *  in the same document assigns ⚠️ to `warning`, so the classifier would be REPLACING
 *  the author's own glyph with a louder one. The two halves of the spec contradict each
 *  other and this resolves toward the self-consistent reading: `⚠` opens a `warning`.
 *  Everything else in that sentence is implemented as written. Flipping it back is
 *  moving one alternative between the `danger-opener` and `warning-opener` rows. */
export declare function classifyBlock(block: Block): Vibe;
/** Every block's vibe, WITH the heading rule applied.
 *
 *  Blocks are cut at top-level markdown boundaries (the todo's option A) rather than on
 *  blank lines, which would shred a fenced block, a table or a multi-paragraph list
 *  item. On top of that, a heading absorbs the blocks beneath it into ONE vibe group, so
 *  an answer that has headings reads like the section-level chunking of option B and one
 *  that has none still reads block by block.
 *
 *  What a section absorbs is limited to `ATTENTION_VIBES`. A section containing a
 *  warning IS a warning section — that is the point of the rule — but a section whose
 *  only non-descriptive block is a code fence is not an "info section": `info` marks
 *  reference material, and propagating it would tint half of every technical answer for
 *  saying nothing. So the fence keeps `info`, its prose stays `descriptive`, and the
 *  group only forms when something actually asked for attention.
 *
 *  Blocks BEFORE the first heading are not part of any section and keep their own
 *  verdicts — there is no heading over them to have absorbed them. */
export declare function assignVibes(blocks: readonly Block[]): Vibe[];
/** Where a block sits in its run — a maximal span of adjacent blocks sharing one vibe.
 *
 *  `solo` is a run of one. The stylesheet uses these to paint a run as a single stripe:
 *  `start` and `solo` carry the glyph and round the top, `mid` and `end` bridge the
 *  margin above them, `end` and `solo` round the bottom. */
export type RunPosition = 'solo' | 'start' | 'mid' | 'end';
/** Each block's position in its run, from a list of vibes in document order.
 *
 *  Runs are computed from the FINAL vibes — after `assignVibes` has applied the heading
 *  rule — because that rule is what creates most runs worth merging. Two adjacent sections
 *  promoted to the same vibe deliberately form ONE run across the second heading: they
 *  agree, and drawing a seam between them would claim a distinction the taxonomy does not
 *  make. */
export declare function runPositions(vibes: readonly Vibe[]): RunPosition[];
interface MdastNode {
    type: string;
    position?: {
        start: {
            offset?: number;
        };
        end: {
            offset?: number;
        };
    };
    data?: Record<string, unknown>;
    children?: MdastNode[];
}
interface MdastRoot extends MdastNode {
    children: MdastNode[];
}
/** Wraps every visible top-level block in `div[data-vibe="…" data-vibe-run="…"]`.
 *
 *  The wrapper is an unknown mdast node carrying `data.hName`/`hProperties`:
 *  mdast-util-to-hast's unknown handler builds a `div` from any node that has children
 *  and then applies that data, so this needs no rehype pass and no custom component. The
 *  wrapped node itself is untouched, which is what keeps the rendered markdown identical
 *  to what it was — the div is the only new element in the tree.
 *
 *  This is the ONLY consumer of the taxonomy. It classifies the tree react-markdown is
 *  already holding, so there is no second parse and no way for two surfaces to disagree
 *  about a block — there is only one surface. An earlier version took pre-computed
 *  verdicts from a caller, because the meta-row counters and the per-turn minimap needed
 *  the same answer this plugin was producing privately; both of those are gone, and the
 *  plumbing that kept three readers in step went with them. */
export declare function remarkVibes(): (tree: MdastRoot, file: {
    value?: unknown;
}) => void;
export {};
//# sourceMappingURL=vibes.d.ts.map