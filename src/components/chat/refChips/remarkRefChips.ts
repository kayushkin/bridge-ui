// The detection grammar — which tokens in message text become reference chips —
// lives in exactly one place: `@kayushkin/chat-core`'s `parseRefChips` /
// `remarkRefChips`. This file used to carry the original implementation, which
// chat-core ported and then outgrew (inline-code handling, note/workspace cues,
// the producer bracket dialect, and the resolver-classified bare-uuid kind);
// the two had drifted, so the fork is gone and this module is a re-export.
//
// What the shared plugin recognises:
//   - bare session ids (`br_…`, `herald-…`, `autoworker-…`) — chipped anywhere;
//   - a cue word (note / todo / item / card / workspace…) before a noteboard
//     uuid — chipped with the cue's kind hint;
//   - the producer's `[kind:id]` bracket dialect;
//   - a BARE uuid with no cue — kind `uuid`, which RefChip classifies through
//     the host's reference resolver (dash's `POST /api/resolve`) instead of
//     guessing from the surrounding prose. This is what makes chips
//     independent of how the model phrased the mention.
//
// It also walks `inlineCode` nodes (an id set apart in backticks resolves) and
// skips `link` and fenced `code` blocks (a linkified id keeps its address, a
// payload keeps its bytes).
export { parseRefChips, remarkRefChips } from '@kayushkin/chat-core'
export type { RefKind, RefSegment } from '@kayushkin/chat-core'
