import { Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { VList, type VListHandle } from 'virtua'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTurns, remarkRefChips, useActiveSession, usePendingSession, toolIdOf, useFullEntry } from '@kayushkin/chat-core'
import { RefChip } from './RefChip'
import type { Entry, Turn } from '@kayushkin/chat-core'
import { CappedText, ShortenedPayloadBar, ToolContext, ToolItem, useToolContext } from '../tools'
import { isToolRunning, toToolEvent } from './toolEvents'

/** Shared, so the fallback below allocates nothing per row. */
const EMPTY_TOOL_IDS: ReadonlySet<string> = new Set<string>()
import type { RefChipProps } from './RefChip'
import { useBridgeHarnesses } from '../../useBridgeHarnesses'
import { UsageLine } from './UsageLine'
import { toBridgeUsage, formatHMS } from './bridgeAdapters'
import { remarkVibes } from './vibes'
import VibeLegend from './VibeLegend'
import SessionStatusLine, {
  STATUS_SPACER_CLASSNAME,
  useSessionStatus,
  type ComposerStatus,
} from './SessionStatusLine'
import styles from './Chat.module.css'

// react-markdown types `components` over intrinsic elements only; `ref-chip` is the
// custom hast element remarkRefChips emits, so we cast the map like bridge-ui does.
type MdComponents = ComponentProps<typeof ReactMarkdown>['components']
type MdPlugins = ComponentProps<typeof ReactMarkdown>['remarkPlugins']
// remark-gfm is listed first to match bridge-ui's TurnsView, but the LIST ORDER is not
// what matters and a reader should not infer that it is: gfm registers micromark/mdast
// PARSER extensions and returns no transformer, so it takes effect while the markdown is
// being parsed, whatever position it holds. remarkRefChips is a transformer and therefore
// always sees a tree gfm has already shaped.
//
// gfm's PRESENCE, though, is load-bearing for the chips. remarkRefChips skips `link`
// subtrees so a linkified id keeps its link, and only gfm's autolink-literal extension
// makes a bare pasted URL a `link` node — without it, a session id in a URL's query
// string is cut out of the middle of the text into a chip and the address is left in
// pieces. `e2e/chat-markdown-gfm.spec.ts` holds both halves.
//
// remarkVibes is LAST, and unlike the pair above that position is load-bearing. It wraps
// each top-level node in a `div[data-vibe]`, so a transformer added after it would walk
// a root whose children are wrappers rather than the paragraphs and fences it expects.
// It reads the source through `node.position`, which `remark-gfm` has already shaped, and
// it never descends into a block, so `remarkRefChips` sees exactly the tree it saw before
// — its chips are built inside the nodes this one wraps.
const REMARK_PLUGINS = [remarkGfm, remarkRefChips, remarkVibes] as unknown as MdPlugins

/** How long the provisional-narration guess may stand after the transcript last
 *  changed — the PROMOTE half of "assume narration, promote at the end".
 *
 *  ⚠️ This is the fix for a turn's final answer never appearing. The guess in
 *  `buildTurnItems` demotes the last open message's prose into the narration
 *  dropdown, and it was withdrawn only by `streaming` going false on some later
 *  render. `streaming` cannot be relied on to fall: `Chat.tsx` ORs the session
 *  summary with the live activity, and `activity` returns to idle ONLY on a
 *  terminal signal (result / turn_complete / close / TURN_IDLE_TIMEOUT /
 *  PROCESS_DIED / a settled session_state). A turn that emits its answer and then
 *  nothing at all — measured 110 sessions in 7 days ending on an assistant block
 *  against 1838 ending on a result — produces no such signal, so the flag latched
 *  on and the answer stayed collapsed for as long as the session stayed selected.
 *  Switching away and back fixed it, which is what made it read as "the reply
 *  never came" rather than "the reply is in the wrong place".
 *
 *  Five seconds because the window only has to cover the gap in which a tool call
 *  could still arrive and reclassify the message as narration: that call was
 *  measured landing ~750ms after its text, while the answer's own `result` is the
 *  immediately next event. A long answer keeps the window open on its own — every
 *  delta is a new `entries` identity and rearms the timer — so this bounds the
 *  SILENCE after the text, not the length of the answer.
 *
 *  Deliberately not a fix to `streaming` itself: that flag also drives the live
 *  indicator, where a false "busy" is cheap and a false "idle" hides a running
 *  tool call that legitimately emits nothing for minutes. Hiding the user's answer
 *  needs more confidence than drawing a spinner does, so only this use is bounded. */
const PROVISIONAL_NARRATION_MS = 5000

interface TurnListProps {
  sessionId: string | null
  view: 'turns' | 'raw'
  /** Render assistant/user prose through ReactMarkdown (default) or as plain text. */
  markdown: boolean
  /** The session is actively producing output — show a live streaming indicator on
   *  the trailing assistant turn. Derived from the session state by the parent. */
  streaming: boolean
  /** A compaction this page asked for is in flight. Resolved by the parent's single
   *  `useSessionControls` — see the status slot's own note below for why it cannot be
   *  read here. */
  compacting: boolean
  /** The status slice of the parent's single `useComposer` instance (paused/stopped/
   *  error), rendered in the pane's status slot. Hook-local state, same one-instance
   *  rule as `compacting`. */
  composerStatus: ComposerStatus
  /** The pane's share of the split row, as `flex: <grow> 1 0`. Owned by the parent,
   *  which is the only place that knows what the other pane was given. Passed even when
   *  this pane is alone, because a sole flex child fills the row whatever its grow
   *  number is — see the note at the call site. */
  style?: React.CSSProperties
}

/** Renders the active session's turns, virtualized with virtua, in bridge-ui's turns
 *  DOM (bc-turns-pane / bc-turns-body / bc-turns-item / bc-turns-meta / bc-turns-text
 *  / bc-turns-aside / bc-turns-marker) so it inherits the shared stylesheet. Supports
 *  the collapsed 'turns' view (dupes hidden, sources badge per message) and the 'raw'
 *  view (every entry incl. duplicates, with source + eventId — chat-only audit
 *  affordances). Consumes chat-core's pre-materialized turns/entries — no transcript
 *  re-derivation here. */
export default function TurnList({
  sessionId,
  view,
  markdown,
  streaming,
  compacting,
  composerStatus,
  style,
}: TurnListProps) {
  const { turns, entries, sourceGroups, visibleEntryIds, sourcesFor, loading, more, loadOlder } = useTurns(
    sessionId,
    view,
  )
  const { select, summary } = useActiveSession()

  // THE status slot's content, decided here (not inside the slot component) so this
  // pane can also manage the empty spacer that stands in for the slot after it
  // empties. The transcript sits flush against the slot, so the slot vanishing at
  // end of turn used to shift every line the user was reading — instead the space
  // stays reserved until they scroll (wheel/touch below), or a new status fills it.
  const status = useSessionStatus(sessionId, streaming, compacting, composerStatus)
  const statusVisible = status !== null
  const [lingerSpacer, setLingerSpacer] = useState(false)
  // The kind on screen last render. Only a departing RUNNING kind (live/compacting)
  // arms the spacer: those are the ones whose exit yanks a transcript the user is
  // mid-reading. The "connecting…" flash every page load ends in, or a stopped
  // notice cleared by a resume, may collapse normally — reserving space after them
  // would pin 30px of nothing to every freshly opened idle session.
  const lastStatusKind = useRef<string | null>(null)
  const statusKind = status?.kind ?? null
  useEffect(() => {
    if (statusKind) {
      setLingerSpacer(false)
    } else if (lastStatusKind.current === 'live' || lastStatusKind.current === 'compacting') {
      setLingerSpacer(true)
    }
    lastStatusKind.current = statusKind
  }, [statusKind])
  // A fresh session must not inherit the previous one's reserved space.
  useEffect(() => {
    lastStatusKind.current = null
    setLingerSpacer(false)
  }, [sessionId])
  // Wheel/touch rather than the VList's onScroll: the list autoscrolls itself when
  // the final answer lands — exactly the moment the linger exists to survive — and
  // onScroll cannot tell that programmatic settle from the user reaching for the
  // wheel. Wheel and touch are user-only by construction.
  const clearLingerSpacer = useCallback(() => setLingerSpacer(false), [])

  // The promote step of "assume narration, promote at the end" — see
  // PROVISIONAL_NARRATION_MS. Open while the transcript is still moving, closed
  // once it has been still for that long, and rearmed by every change.
  //
  // `entries` is the right thing to watch and the only one: it comes straight off
  // chat-core's stored model (`useTurns` returns `model.entries`, or the shared
  // EMPTY_ENTRIES constant), so its identity changes when and only when the
  // transcript does. Watching a render-built value instead would rearm the timer
  // on every paint and the window would never close.
  //
  // The state records WHICH transcript the window was closed for, rather than a
  // bare boolean, so re-opening on a change is DERIVED and needs no write. A
  // boolean would have to be set back to true synchronously inside the effect on
  // every fold — a render-cascade the lint rule names, and one this pane pays for
  // per streamed token.
  const [closedForEntries, setClosedForEntries] = useState<Record<string, Entry> | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setClosedForEntries(entries), PROVISIONAL_NARRATION_MS)
    return () => clearTimeout(timer)
  }, [entries, sessionId])
  const provisionalWindowOpen = closedForEntries !== entries

  const pending = usePendingSession()

  // Applied to EVERY `bc-turns-pane` root below, of which there are four — the main
  // render and three early returns. One object rather than four copies of two
  // attributes, because the resizer resolves its pair with
  // `querySelector('[data-pane="turns"]')`: a `data-pane` added to the main root only
  // would give a boundary that drags perfectly once the transcript has loaded and is
  // silently a no-op while the pane says "Loading…" or "No messages yet" — dead
  // exactly when the page is slowest and the user is most likely to be adjusting it.
  const rootProps = { className: 'bc-turns-pane', style, 'data-pane': 'turns' }

  // The assistant's actor label is the agent/harness display name (matching
  // bridge-ui's `agent` prop), NOT the literal role "assistant". Resolve it from the
  // server-registered harness metadata — the same single source of truth SessionHeader
  // reads — falling through to the raw harness id, then a generic "assistant" only when
  // the session reports no harness at all.
  const { harnessMap } = useBridgeHarnesses()
  const agentName =
    (summary?.harness ? harnessMap.get(summary.harness)?.label : undefined) ||
    summary?.harness ||
    'assistant'

  // SOURCES BADGE (Turns view). Raw asks chat-core's `sourcesFor` per entry, which
  // re-annotates the whole model on every call — affordable there because Raw is the
  // audit surface, not affordable in the default view, where it would run once per
  // rendered item on every streamed event. The annotations are already on the stored
  // entries (the reducer writes duplicate/primary/groupId, and the Turns view's own
  // dedup selector already trusts them), so one O(entries) pass per model change gives
  // every group its distinct source names. Read the dedup group, never the entry alone:
  // the hidden copy is where the second source name lives.
  const sourceNamesByGroupId = useMemo(() => {
    const byGroup = new Map<string, string[]>()
    // Seed from log-store's own record first. A projected page carries ONE copy of a
    // dual-emitted prompt and deletes the other, so the entries alone can never say
    // "2 sources" for it; `sourceGroups` was computed over every stored entry before
    // that deletion and is the only place the pairing survives. The entries loop
    // below then adds whatever the live tail knows (its `otelgrp_` pairs).
    for (const [groupId, names] of Object.entries(sourceGroups ?? {})) byGroup.set(groupId, [...names])
    for (const entry of Object.values(entries)) {
      if (!entry.groupId) continue
      let names = byGroup.get(entry.groupId)
      if (!names) {
        names = []
        byGroup.set(entry.groupId, names)
      }
      if (!names.includes(entry.source)) names.push(entry.source)
    }
    return byGroup
  }, [entries, sourceGroups])

  // Distinct sources that reported the content of one rendered Turns item, across every
  // entry that fed it. An ungrouped entry contributes only its own source, so a
  // single-source item returns one name and draws no badge.
  const sourceNamesForEntries = useCallback(
    (entryIds: string[]) => {
      const names: string[] = []
      for (const entryId of entryIds) {
        const entry = entries[entryId]
        if (!entry) continue
        const groupNames = entry.groupId ? sourceNamesByGroupId.get(entry.groupId) : undefined
        for (const name of groupNames ?? [entry.source]) {
          if (!names.includes(name)) names.push(name)
        }
      }
      return names
    },
    [entries, sourceNamesByGroupId],
  )

  // Which tool ids already have a result somewhere in the loaded model.
  //
  // A cold-loaded model keeps a call and its result as two separate rows, so a
  // `tool_call` entry's OWN fields say nothing about whether it finished — only the
  // presence of a sibling result does. Without this set every tool in a reloaded
  // transcript renders as still running, i.e. a page full of spinners for work that
  // finished days ago. The live tail merges the two, which is why this was invisible
  // until someone reloaded.
  const resultedToolIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of Object.values(entries)) {
      if (entry.kind !== 'tool_result') continue
      const id = toolIdOf(entry)
      if (id) ids.add(id)
    }
    return ids
  }, [entries])

  // Memoized: a fresh object here would re-render every mounted tool card on every
  // folded event, and the cards are the most expensive rows in the pane.
  const toolContextValue = useMemo(() => ({ sessionId: sessionId ?? '' }), [sessionId])

  const listRef = useRef<VListHandle>(null)
  const [atBottom, setAtBottom] = useState(true)


  // Linkify bare session ids and cue-prefixed noteboard uuids: a `ref-chip` mdast
  // node (from remarkRefChips) renders via RefChip.
  //
  // Only session chips call this. RefChip invokes `onActivate` for kinds that have
  // somewhere to go, and a noteboard item has none — dash's /notes page takes no
  // item deep-link — so note and todo chips open their detail panel instead. This
  // used to be a `kind === 'session'` guard on a handler wired to EVERY chip, which
  // gave todo chips `role="button"` and a click that did nothing.
  //
  // Held through a ref so its identity never changes. `select` is rebuilt on every
  // change to the session list, which churns on every poll; handed down directly it
  // changed every `ProseBody`'s props on every poll, so each one re-parsed its markdown
  // and remounted its reference chips. Timeline.tsx does the same, for the same reason.
  const selectRef = useRef(select)
  selectRef.current = select
  const onActivateSessionRef = useCallback(
    (_kind: string, refId: string) => selectRef.current(refId),
    [],
  )

  // Recomputed when the model (turns/entries), the view or the markdown/streaming
  // flags change.
  //
  // ⚠️ This comment used to claim the row memos are "skipped" so that streaming
  // re-renders only the changed turn. That was false and worth correcting rather
  // than deleting, because it is the kind of claim that stops someone measuring.
  // `entries` is replaced wholesale on every folded event and `visibleEntryIdsFor`
  // returns a fresh sorted array per call, so any memo handed either prop misses
  // every time. What actually bounds the work is virtua's windowing — only the
  // mounted rows render — which is precisely why the flattening below matters:
  // it makes the window a window of ROWS instead of whole turns.
  const items = useMemo(
    () => {
      // RAW keeps one child per TURN, and that is deliberate: it draws a per-turn
      // header with its entries beneath, so the turn IS the row there. It is also
      // the audit surface, opened on purpose and briefly, over a window the
      // server already pages.
      if (view === 'raw') {
        return turns.map((turn, idx) => (
          <TurnItem
            key={turn.id}
            turn={turn}
            entries={entries}
            entryIds={visibleEntryIds(turn.id)}
            view={view}
            markdown={markdown}
            agentName={agentName}
            sourcesFor={sourcesFor}
            sourceNamesForEntries={sourceNamesForEntries}
            onActivateSessionRef={onActivateSessionRef}
            resultedToolIds={resultedToolIds}
            streaming={streaming && idx === turns.length - 1}
          />
        ))
      }

      // TURNS is FLATTENED: one list child per ROW, never one per turn.
      //
      // A turn used to be a single child holding all of its rows, and virtua
      // sizes a child it has not mounted by estimate and corrects on measure.
      // Timeline hit exactly this and recorded the numbers when it fixed it:
      // scrollHeight swinging 78,860 → 92,388 → 84,919 → 55,713 during ONE
      // scroll, a scroll target moving backwards mid-sequence, and rows drawn
      // over each other because the children are absolutely positioned.
      //
      // This pane got away with it only because a turn collapses to about two
      // near-uniform items today. It stops being true the moment tool calls are
      // admitted here: measured across six live sessions that is 12.6x the rows,
      // and 40x on a subagent session whose entire 170-event transcript is one
      // turn — i.e. one absolutely-positioned child ~40 rows tall, sized by
      // guess. Flattening first is what makes that change safe to make at all.
      const out: React.ReactNode[] = []
      const lastTurnIdx = turns.length - 1

      // SPAN assembly. A turn opened by a HIDDEN task-notification (or by no user
      // message at all — a wire fragment) CONTINUES the previous span: the model
      // yielded, a background task finished, the harness re-prompted it. The
      // whole span renders as ONE message row (owner: "they are still 5 separate
      // messages" — they must not be): one header, every pre-final segment
      // demoted into ONE collapsible of progress reports (prose visible inside,
      // narration collapsed), each notification surfaced as a formatted
      // auto-collapsed chip at the seam it explains, and the final segment's
      // answer at full prose weight. A real user message always ends the span.
      let span: SpanSegment[] = []
      let spanStreaming = false
      const flushSpan = () => {
        if (span.length === 0) return
        out.push(
          <SpanRow
            key={`span:${span[0]!.turnId}`}
            segments={span}
            agentName={agentName}
            streaming={spanStreaming}
            markdown={markdown}
            sourceNamesForEntries={sourceNamesForEntries}
            onActivateSessionRef={onActivateSessionRef}
          />,
        )
        span = []
        spanStreaming = false
      }

      for (let t = 0; t < turns.length; t++) {
        const turn = turns[t]
        const ids = visibleEntryIds(turn.id)
        const built = buildTurnItems(
          entries,
          ids,
          streaming && provisionalWindowOpen && t === lastTurnIdx,
        )
        let lastAssistantItem: RenderItem | null = null
        for (let i = built.length - 1; i >= 0; i--) {
          if (built[i]!.kind === 'assistant') { lastAssistantItem = built[i]!; break }
        }

        // Does this turn CONTINUE the span? Opened by a notification, or by
        // nothing at all. A real user opener breaks it below, item by item.
        const opener = built.find((it) => it.kind === 'user' || it.kind === 'notification')
        if (t === 0 || (opener && opener.kind === 'user')) flushSpan()

        let seg: SpanSegment | null = null
        for (const it of built) {
          if (it.kind === 'user') {
            flushSpan()
            seg = null
            out.push(
              <UserTurnRow key={it.key} item={it} sourceNames={sourceNamesForEntries(it.entryIds)} />,
            )
            continue
          }
          if (it.kind === 'notification') {
            seg = { turnId: turn.id, notification: it.text, ts: it.ts, items: [] }
            span.push(seg)
            continue
          }
          if (!seg) {
            seg = { turnId: turn.id, notification: null, ts: it.ts, items: [] }
            span.push(seg)
          }
          seg.items.push(it)
          if (it.kind === 'assistant' && streaming && t === lastTurnIdx && it === lastAssistantItem) {
            spanStreaming = true
          }
        }
      }
      flushSpan()
      return out
    },
    [
      turns,
      entries,
      view,
      markdown,
      agentName,
      visibleEntryIds,
      sourcesFor,
      sourceNamesForEntries,
      onActivateSessionRef,
      streaming,
      // Load-bearing: the provisional-narration window closing is what PROMOTES a
      // finished answer out of the narration dropdown. Omit it and the timer fires
      // into a memo that never recomputes, which is the bug this fixes.
      provisionalWindowOpen,
    ],
  )

  const onScroll = useCallback(() => {
    const h = listRef.current
    if (!h) return
    // Within ~120px of the end counts as "at bottom" so the jump button hides.
    const distanceFromEnd = h.scrollSize - (h.scrollOffset + h.viewportSize)
    setAtBottom(distanceFromEnd < 120)
  }, [])

  // virtua indexes the VList's direct children: an optional "Load older" button is
  // prepended before the turn items, so the last turn's child index is offset by it.
  const lastChildIndex = (more ? 1 : 0) + items.length - 1

  const jumpToLatest = useCallback(() => {
    const h = listRef.current
    if (h && lastChildIndex >= 0) h.scrollToIndex(lastChildIndex, { align: 'end' })
  }, [lastChildIndex])

  // Open at the latest message, and stay pinned to the bottom while new/streaming
  // content arrives IF the user is already there — mirroring bridge-ui's
  // useStickyBottomScroll. virtua doesn't stick on its own, so we drive scrollToIndex:
  //  - a session switch (settledSession changes) always jumps to the last turn once its
  //    turns have materialized, so a chat never opens scrolled to the top;
  //  - afterwards we only re-pin when `atBottom`, so scrolling up to read isn't yanked
  //    back down. `entries` changes on every folded event, so an in-place streaming
  //    growth of the trailing turn (which leaves `turns` length unchanged) still sticks.
  const settledSession = useRef<string | null>(null)
  useEffect(() => {
    if (!sessionId) return
    const h = listRef.current
    if (!h || items.length === 0 || lastChildIndex < 0) return
    if (settledSession.current !== sessionId) {
      settledSession.current = sessionId
      h.scrollToIndex(lastChildIndex, { align: 'end' })
      return
    }
    if (atBottom) h.scrollToIndex(lastChildIndex, { align: 'end' })
  }, [sessionId, lastChildIndex, entries, atBottom])

  if (!sessionId) {
    // Two different situations arrive here as `sessionId === null`: nothing is selected,
    // and a new chat is open but unsent. Only the store's pending record separates them,
    // and drawing the second as "select a session" is what made a fresh / load
    // look like a dead end.
    return (
      <div {...rootProps}>
        <div className="bc-turns-body">
          <div className="bc-turns-empty">
            {pending
              ? 'New chat — type a message below to start it.'
              : 'Select a session, or start a new one.'}
          </div>
        </div>
      </div>
    )
  }

  // Both empty branches below carry the status slot, and the branch above does NOT.
  //
  // The line they used to share said "nothing can be running, compacting or stopping in
  // a pane with no turns to stand under". That is false, and it cost the user the one
  // thing this slot exists for: a session stopped before it produced any output, a send
  // that failed on a fresh session, a paused session nobody has written to — each is a
  // pane with no turns and something urgent to say. On those the composer offered
  // Resume while NOTHING on the page explained why, which is the hung-session-with-no-
  // visible-cause this slot was built to prevent. Seven e2e cases were red on it.
  //
  // `!sessionId` above still omits it, and that is not the same omission: there is no
  // session there to be stopped, paused or disconnected. A slot with nothing to report.
  //
  // No linger spacer here either. The spacer holds a TRANSCRIPT still when the slot
  // empties under it, and these branches have no transcript to hold.
  const emptyStateStatus = statusVisible ? (
    <SessionStatusLine status={status} onOpenSession={select} />
  ) : null

  if (loading && turns.length === 0) {
    return (
      <div {...rootProps}>
        <div className="bc-turns-body">
          <div className="bc-turns-empty">Loading…</div>
        </div>
        {emptyStateStatus}
      </div>
    )
  }

  if (turns.length === 0) {
    return (
      <div {...rootProps}>
        <div className="bc-turns-body">
          <div className="bc-turns-empty">No messages yet</div>
        </div>
        {emptyStateStatus}
      </div>
    )
  }

  return (
    <div
      {...rootProps}
      // User-initiated scroll intent clears the status slot's linger spacer. Attached
      // only while the spacer is up, so the pane carries no live wheel handler the
      // rest of the time.
      onWheel={lingerSpacer ? clearLingerSpacer : undefined}
      onTouchMove={lingerSpacer ? clearLingerSpacer : undefined}
    >
      {/* The key to the rails and gutter glyphs the prose carries. A pane-level sibling
          for the same reason the compacting strip below is one, and drawn only in this
          branch: the three early returns above have no prose to explain.

          Gated on `markdown`, and on nothing else. TXT renders the source verbatim and
          draws no rails, so a legend there would explain something not on screen. It is
          NOT additionally gated on the Turns view: Raw renders the same prose through the
          same `ProseBody`, so it carries the same rails and needs the same key. */}
      {markdown && <VibeLegend />}
      {/* The session the tool renderers fetch snapshots for.
          `EditRenderer` and `BashRenderer` read `GET /sessions/{id}/tools/{tool_id}/snapshots`
          to draw a real before/after diff, and they take the session id from this context
          rather than from props so the components between (here, the turn, the entry) do
          not each have to carry it. Without the provider they read the default `''`, ask
          for `/sessions//tools/...` and quietly draw a card with no diff — which looks
          exactly like a tool that changed nothing. */}
      <ToolContext.Provider value={toolContextValue}>
      <VList ref={listRef} className="bc-turns-body" onScroll={onScroll}>
        {more ? (
          <button key="__older__" className={styles.loadOlder} onClick={loadOlder}>
            ↑ Load older messages
          </button>
        ) : null}
        {items}
      </VList>
      </ToolContext.Provider>
      {/* "Compacting context…" — the only thing on screen that says a compaction is
          running. The POST only ACKs; the work happens server-side and produces no turn,
          no state change and no error, so without this the pane simply sits there.

          Two deliberate divergences from bridge-ui's `TurnsView.tsx:522-527`:

          1. It is a SIBLING of the scroll body, not its last child. `bc-turns-body` is a
             virtua `VList` here, whose children are virtualized items — the strip would
             become row n+1, shift `lastChildIndex` and the sticky-bottom scroll that
             depends on it, and disappear whenever it was windowed out. As a pane-level
             sibling it is also visible while the user is scrolled up reading, which is
             the moment they are most likely to be wondering why nothing is happening.
          2. COMPACTING specifically cannot arise in the two empty branches above: Compact
             is gated on a live session with turns (`useSessionSettings`'s
             `hasLiveSession`), and chat-core drops the flag when the active session
             changes, so there is no path to a compacting empty pane. That reasoning was
             once used to keep the whole SLOT out of those branches, which was wrong —
             the slot also carries stopped, paused, disconnected and a failed send, and
             every one of those reaches an empty pane. They render it now.

          The class is bridge-ui's and the stylesheet chat already loads carries the
          rule (`styles.css:794-806`), animation included — no CSS ships with this. */}
      {/* The pane's ONE status slot — live activity (todo · current call · started-at
          · elapsed · subagents popover), compacting, paused, stopped, disconnected and
          action errors all render here, fixed-height, one at a time. A pane-level
          sibling of the scroll body: a VList child would be virtualized away and would
          shift `lastChildIndex` and the sticky-bottom scroll. The two EMPTY branches
          above now render the slot too — see the note beside them; only `!sessionId`
          omits it, because there is no session there to report on.

          When the slot empties (turn finished), an equal-height spacer stays behind so
          the transcript the user is reading does not shift down; it leaves on the
          user's own wheel/touch scroll (handlers on the pane root above) or when the
          next status fills the slot. */}
      {statusVisible ? (
        <SessionStatusLine status={status} onOpenSession={select} />
      ) : lingerSpacer ? (
        <div className={STATUS_SPACER_CLASSNAME} aria-hidden />
      ) : null}
      {!atBottom && (
        <button className="bc-jump-latest" onClick={jumpToLatest} title="Jump to latest">
          ↓ New messages
        </button>
      )}
    </div>
  )
}

interface TurnItemProps {
  turn: Turn
  entries: Record<string, Entry>
  entryIds: string[]
  view: 'turns' | 'raw'
  markdown: boolean
  /** The agent/harness display name — the assistant's actor label in the Turns view. */
  agentName: string
  streaming: boolean
  sourcesFor: (entryId: string) => Entry[]
  /** Distinct source names across the dedup groups of the given entries — the Turns
   *  view's sources badge. Raw uses `sourcesFor` instead, which returns the copies. */
  sourceNamesForEntries: (entryIds: string[]) => string[]
  onActivateSessionRef: (kind: string, refId: string) => void
  /** Tool ids that already have a result in the loaded model. Raw's tool cards read it
   *  to decide whether a call is still running — a cold-loaded model keeps call and
   *  result as two rows, so the call alone cannot answer. */
  resultedToolIds: ReadonlySet<string>
}

/** Harness-injected notification, surfaced through the history-replay path as a
 *  user_message whose entire body is one `<task-notification>…</task-notification>`
 *  block. It is not something the user typed, so it must not render as a user turn.
 *  Anchored start+end (matching bridge-ui's isHarnessNotification) so a real prompt that
 *  merely quotes a notification still renders. */
function isHarnessNotification(text: string): boolean {
  const t = text.trim()
  return t.startsWith('<task-notification>') && t.endsWith('</task-notification>')
}

/** One rendered row derived from a turn's CONTENT (not from turn.role). A chat-core turn
 *  is opened by the user prompt (turn.role === 'user') but carries the assistant's whole
 *  reply, so a single turn yields a user item, a separate assistant item, and any compact
 *  markers — exactly like bridge-ui's rowsToTurns emits a `user` item for the prompt and a
 *  distinct `assistant` item for the turn's assistant content. */
type RenderItem =
  | { kind: 'user'; key: string; ts: string; text: string; entryIds: string[] }
  | { kind: 'marker'; key: string; ts: string }
  /** A HIDDEN harness task-notification that opened this turn. Not a user row —
   *  the reader never wrote it — but the span renderer surfaces it as a
   *  formatted, auto-collapsed chip at the seam it explains. */
  | { kind: 'notification'; key: string; ts: string; text: string }
  | {
      kind: 'assistant'
      key: string
      ts: string
      prose: string
      narration: string
      thinking: string
      errors: Entry[]
      usage?: Entry['usage']
      /** How many narration MESSAGES fed the narration dropdown — its "N steps"
       *  label. Presentation metadata only; the classification stays per message. */
      narrationCount?: number
      /** Every entry that fed this item, so the sources badge can state which
       *  sources reported the content actually on screen. */
      entryIds: string[]
    }

/** Split one turn's visible entries into content-derived render items. The unit is the
 *  MESSAGE (dash docs/chat-turns-per-message.md):
 *   - a user_message (role user text) → its OWN `user` item (dropping task-notifications);
 *   - a `compact_boundary` system entry → a `marker` item;
 *   - every other conversation entry (text / result / thinking / error / tool_call)
 *     joins its MESSAGE's assistant item, keyed `msg:<messageId>` — stable from birth,
 *     so React never remounts a row because the turn grew, and text never relocates
 *     between rows. A message with only tool calls yields nothing here (Raw/Timeline
 *     show it); tool_result, hook/permission and other system/meta events are dropped
 *     the same as before.
 *
 * CLASSIFICATION is a fact on the wire, decided per message and never revisited:
 *   - text on a message that ALSO carries a tool call → narration (the commentary
 *     written before acting; the result never repeats it);
 *   - text on a message with NO tool call → the answer (prose). The terminating
 *     `result` shares that message's id (measured: all 40 sampled turns), so the
 *     result folds into the answer's own row rather than duplicating it;
 *   - thinking attaches to its own message's row.
 *
 * This replaced a per-TURN pool that decided prose-vs-narration from turn-wide state
 * (`hasTool` over the whole turn, last-text-wins) and re-decided it as the turn grew —
 * which is what made text render as prose and then jump into a dropdown, and what a
 * position-based key (`a_<ts>_<index>`) turned into full row remounts. Classify on
 * `kind`, never on role: the live reducer gives tool_call role 'tool' and log-store
 * gives it 'assistant', so a role-switching classifier disagrees with itself across
 * the reconcile boundary.
 *
 * An entry with NO messageId (legacy history, bookkeeping) falls back to its own entry
 * id — one row per entry, nothing invented. */
function buildTurnItems(
  entries: Record<string, Entry>,
  entryIds: string[],
  /** Presentation hint: this turn is still producing. Decides only how the LAST,
   *  still-open message's bare text is shown while its classification is genuinely
   *  unknown — see the provisional-narration pass below. Never reclassifies
   *  anything already resolved. */
  turnStreaming = false,
): RenderItem[] {
  const out: RenderItem[] = []
  type AssistantItem = Extract<RenderItem, { kind: 'assistant' }>
  interface MessageGroup {
    item: AssistantItem
    texts: string[]
    results: string[]
    thinkings: string[]
    hasTool: boolean
  }
  const groups = new Map<string, MessageGroup>()

  // Items are pushed at first sight of their message, so `out` keeps min-eventId
  // order (entryIds arrive sorted by eventId); the group objects are finalized
  // after the loop, before anything renders them.
  const groupFor = (e: Entry): MessageGroup => {
    const key = `msg:${e.messageId || e.id}`
    let g = groups.get(key)
    if (!g) {
      const item: AssistantItem = {
        kind: 'assistant',
        key,
        ts: e.ts,
        prose: '',
        narration: '',
        thinking: '',
        errors: [],
        entryIds: [],
      }
      g = { item, texts: [], results: [], thinkings: [], hasTool: false }
      groups.set(key, g)
      out.push(item)
    }
    return g
  }

  for (const id of entryIds) {
    const e = entries[id]
    if (!e) continue
    if (e.kind === 'system' && e.subtype === 'compact_boundary') {
      out.push({ kind: 'marker', key: id, ts: e.ts })
      continue
    }
    if (e.role === 'user' && (e.kind === 'text' || e.kind === 'result') && e.text) {
      if (isHarnessNotification(e.text)) {
        out.push({ kind: 'notification', key: id, ts: e.ts, text: e.text })
        continue
      }
      out.push({ kind: 'user', key: id, ts: e.ts, text: e.text, entryIds: [id] })
      continue
    }
    // Assistant conversation content — everything else (tool_result, meta, non-compact
    // system) is dropped from the Turns view.
    if (
      e.kind === 'text' ||
      e.kind === 'result' ||
      e.kind === 'thinking' ||
      e.kind === 'error' ||
      e.kind === 'tool_call'
    ) {
      const g = groupFor(e)
      if (e.usage) g.item.usage = e.usage
      switch (e.kind) {
        case 'text':
          if (e.text) g.texts.push(e.text)
          g.item.entryIds.push(e.id)
          break
        case 'result':
          if (e.text) g.results.push(e.text)
          g.item.entryIds.push(e.id)
          break
        case 'thinking':
          if (e.text) g.thinkings.push(e.text)
          g.item.entryIds.push(e.id)
          break
        case 'error':
          g.item.errors.push(e)
          g.item.entryIds.push(e.id)
          break
        case 'tool_call':
          // A tool call is not rendered in Turns and is not a dual-emitted class,
          // so it contributes no source to the badge — but it is what classifies
          // its message's text as narration.
          g.hasTool = true
          break
      }
    }
  }

  for (const g of groups.values()) {
    const text = g.texts.join('\n\n')
    const resultText = g.results.join('\n\n')
    if (g.hasTool) {
      // Narration, from birth. A result on a tooled message does not occur on the
      // measured wire (the result rides the ANSWER message), but if one arrives it
      // is still the authoritative prose.
      g.item.narration = text
      g.item.prose = resultText
    } else {
      // The answer. On the live path this is the streamed text; on a cold load the
      // answer block stays superseded and the result's own text is the prose.
      g.item.prose = text || resultText
    }
    g.item.thinking = g.thinkings.join('\n\n')
  }

  // The still-OPEN last message of a streaming turn: text has arrived, but neither
  // the tool call that would make it narration nor the result that would crown it
  // the answer. The truth is "unknown", and the view must pick a side for a moment.
  // Narration is the right provisional side, twice over: measured, 30 of 31
  // text-bearing messages ARE narration, and the gap it papers over is asymmetric —
  // a narration message's tool call lands ~750ms after its text (measured live,
  // br_1787617143776318105: prose visible at +3.30s, relocated at +4.05s), while
  // the answer's result is the immediately NEXT event. This is the
  // assume-narration-promote-at-the-end rule the owner asked for, scoped to the
  // one message whose classification is genuinely still open.
  if (turnStreaming) {
    for (let i = out.length - 1; i >= 0; i--) {
      const it = out[i]!
      if (it.kind !== 'assistant') break // user/marker after it: nothing open
      const g = groups.get(it.key)
      if (!g) break
      if (!g.hasTool && g.results.length === 0 && g.texts.length > 0) {
        it.narration = it.prose
        it.prose = ''
      }
      break // only the LAST assistant message can be open
    }
  }

  // A message with only tool calls (63 of the measured turn's 96) renders nothing here.
  const perMessage = out.filter(
    (it) =>
      it.kind !== 'assistant' || it.prose || it.narration || it.thinking || it.errors.length > 0,
  )

  // PRESENTATION pass: consecutive assistant messages merge into ONE block item —
  // one header, one narration dropdown holding every step's text in order, the
  // answer as prose beneath it. Per-message rows were measured correct and REPORTED
  // as worse: what reads as one agent message arrived as many rows, and the level-2
  // "N steps" summary expanded into one dropdown per step. The block is the visual
  // unit; the MESSAGE stays the unit of classification, so nothing here relocates
  // text — narration only ever appends to the dropdown, the answer only ever lands
  // as prose, and the block's key is its FIRST message's key, which appending never
  // changes (so an open dropdown survives the turn growing).
  const merged: RenderItem[] = []
  let block: Extract<RenderItem, { kind: 'assistant' }> | null = null
  for (const it of perMessage) {
    if (it.kind !== 'assistant') {
      block = null
      merged.push(it)
      continue
    }
    if (!block) {
      block = { ...it, narrationCount: it.narration ? 1 : 0 }
      merged.push(block)
      continue
    }
    if (it.narration) {
      block.narration = block.narration ? `${block.narration}\n\n${it.narration}` : it.narration
      block.narrationCount = (block.narrationCount ?? 0) + 1
    }
    if (it.prose) block.prose = block.prose ? `${block.prose}\n\n${it.prose}` : it.prose
    if (it.thinking)
      block.thinking = block.thinking ? `${block.thinking}\n\n${it.thinking}` : it.thinking
    if (it.errors.length > 0) block.errors = [...block.errors, ...it.errors]
    if (it.usage) block.usage = it.usage
    block.entryIds = [...block.entryIds, ...it.entryIds]
  }
  return merged
}

const TurnItem = memo(function TurnItem({
  turn,
  entries,
  entryIds,
  view,
  markdown,
  streaming,
  sourcesFor,
  onActivateSessionRef,
  resultedToolIds,
}: TurnItemProps) {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())

  const roleClass =
    turn.role === 'user'
      ? 'bc-turns-user'
      : turn.role === 'system'
        ? 'bc-turns-system'
        : 'bc-turns-assistant'

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Does this turn carry a streamed `text` entry? If so, `text` is the authoritative
  // prose and a `result` entry is redundant metadata (its text duplicates the streamed
  // answer — bridge-ui prefers result over the streaming row per message, we prefer the
  // streaming row and drop result). If NOT (e.g. a subagent/agent session whose whole
  // transcript is `result` envelopes), the result's own text is the only prose there is,
  // so we render it. Either way, envelope JSON never shows in Turns.
  const turnHasText = entryIds.some((id) => entries[id]?.kind === 'text' && !!entries[id]?.text)

  // TURNS VIEW — the turn is split by CONTENT into its user prompt(s), its assistant
  // reply, and any compact markers, matching bridge-ui's bc-turns-item DOM. Each item
  // carries its own actor: "You" for the prompt, the agent name for the reply. Tool
  // calls/results, hook/permission (`tool_decision`) and every other system/meta event
  // are NOT rendered here — the real chat shows those only in the Timeline/Raw views.
  // TurnItem renders ONLY the raw audit view. The turns view stopped mounting it
  // when flattening landed, and its stale turns branch was deleted when the span
  // renderer replaced AssistantTurn — dead code that still compiled was a place
  // for the two paths to drift apart silently.
  // RAW VIEW — every entry with source + eventId meta and JSON (the audit surface).
  return (
    <div className={`bc-turns-item ${roleClass} ${streaming ? 'bc-turns-streaming' : ''} ${styles.vrow}`}>
      <div className="bc-turns-meta">
        <span className="bc-turns-actor">{turn.role === 'user' ? 'You' : turn.role}</span>
        <span className="bc-turns-ts">{formatHMS(turn.ts)}</span>
        {streaming && <span className="bc-turns-streaming-tag">streaming…</span>}
      </div>
      {entryIds.map((id) => {
        const entry = entries[id]
        if (!entry) return null
        // compact_boundary is a horizontal marker, not a bubble.
        if (entry.kind === 'system' && entry.subtype === 'compact_boundary') {
          return <CompactBoundary key={id} ts={entry.ts} />
        }
        // Raw is the full audit surface: every entry, its source+eventId meta, its usage,
        // and (for multi-source entries) a reveal of each source copy.
        const sources = sourcesFor(id)
        const isRevealed = revealed.has(id)
        return (
          <div key={id} className={styles.entry}>
            <div className={styles.rawMeta}>
              #{entry.eventId} · {entry.source} · {entry.kind} · {entry.role}
              {entry.duplicate && <span className={styles.rawDupTag}>duplicate</span>}
              {entry.primary && <span className={styles.sourcePrimary}> primary</span>}
            </div>
            <EntryBody entry={entry} view="raw" turnHasText={turnHasText} markdown={markdown} onActivateSessionRef={onActivateSessionRef} resultedToolIds={resultedToolIds} />
            {entry.usage && <UsageLine usage={toBridgeUsage(entry.usage)} />}
            {sources.length > 1 && (
              <>
                <button className={styles.sourcesBadge} onClick={() => toggleReveal(id)}>
                  {sources.length} sources: {sourceLabel(sources)} {isRevealed ? '▲' : '▼'}
                </button>
                {isRevealed && (
                  <div className={styles.sourcesReveal}>
                    {sources.map((copy) => (
                      <div key={copy.id + ':' + copy.eventId} className={styles.sourceCopy}>
                        <div className={styles.sourceMeta}>
                          #{copy.eventId} · {copy.source}
                          {copy.primary && <span className={styles.sourcePrimary}> · primary</span>}
                          {copy.duplicate && <span className={styles.sourceDup}> · duplicate</span>}
                        </div>
                        <EntryBody entry={copy} view={view} turnHasText={turnHasText} markdown={markdown} onActivateSessionRef={onActivateSessionRef} resultedToolIds={resultedToolIds} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
})

/** The Turns-view sources badge: which sources reported the content on screen, when
 *  more than one did. Deliberately a label and not a control — the Turns view hides the
 *  duplicate copies, and the per-copy audit (event ids, primary/duplicate, each copy's
 *  body) stays in Raw, which is the one place that shows every entry. Renders nothing
 *  for single-source content, which is the ordinary case. */
function SourcesTag({ names }: { names: string[] }) {
  if (names.length < 2) return null
  return (
    <span
      className={styles.turnsSourcesBadge}
      data-testid="turns-sources-badge"
      title={`Reported by ${names.length} sources: ${names.join(', ')}. Per-copy detail is in the Raw view.`}
    >
      {names.length} sources: {names.join(' + ')}
    </span>
  )
}

/** Distinct source labels for the badge, e.g. "harness + otel". */
function sourceLabel(sources: Entry[]): string {
  const seen: string[] = []
  for (const s of sources) if (!seen.includes(s.source)) seen.push(s.source)
  return seen.join(' + ')
}

/** A context-compaction marker — the harness dropped older context. Mirrors
 *  bridge-ui's bc-turns-marker (compact variant). */
function CompactBoundary({ ts }: { ts: string }) {
  return (
    <div className="bc-turns-marker bc-turns-marker-compact" role="separator">
      <span className="bc-turns-marker-line" aria-hidden />
      <span className="bc-turns-marker-text">Context compacted</span>
      <span className="bc-turns-marker-ts">{formatHMS(ts)}</span>
      <span className="bc-turns-marker-line" aria-hidden />
    </div>
  )
}

/** Codes that terminate a turn (contract): styled as a hard/red chip. Everything
 *  else is informational — retryable → amber, otherwise red. */
const TERMINAL_ERROR_CODES = new Set(['TURN_IDLE_TIMEOUT', 'PROCESS_DIED'])

/** A reasoning/narration aside, in bridge-ui's bc-turns-aside DOM. Thinking and narration
 *  are secondary to the answer: once the turn is done they render as a COLLAPSED <details>
 *  disclosure; while the turn is still streaming (`live`) they render open with a live
 *  "…" affordance, mirroring bridge-ui's TurnsAside so the reader sees reasoning/narration
 *  as it arrives and it folds away when the answer lands. */
/**
 * A collapsed reasoning or narration box.
 *
 * ⚠️ ONE element type, always `<details>`. This used to render a `<div>` while live and
 * a `<details>` once settled, and swapping the element is what made an opened box snap
 * shut: React cannot re-render a `<div>` into a `<details>`, so it unmounts one and
 * mounts the other, and `open` is DOM state that dies with the node. Every flip of
 * `live` therefore threw away the user's choice — which is the reported
 * "I open the reasoning section and it resets when new things stream in".
 *
 * `open` is set imperatively rather than passed as a prop, and that is the difference
 * between a hint and a cage. Passing `open={live}` would make React own it: the box
 * would spring back open on the next streamed token no matter how many times the user
 * closed it, and slam shut the moment the turn ended. Setting it once on the transition
 * INTO live opens it when reasoning starts and then leaves it alone — the user closes it
 * and it stays closed, the turn ends and it stays as they left it.
 */
function Aside({
  variant,
  text,
  live = false,
  count,
}: {
  variant: 'reasoning' | 'narration'
  text: string
  live?: boolean
  /** For narration: how many messages fed this dropdown. Two or more earns the
   *  "· N steps" suffix; one step is just narration and says nothing extra. */
  count?: number
}) {
  const icon = variant === 'reasoning' ? '💭' : '💬'
  const label =
    variant === 'reasoning'
      ? 'Reasoning'
      : count && count >= 2
        ? `Narration · ${count} steps`
        : 'Narration'
  const cls = `bc-turns-aside bc-turns-aside-${variant}${live ? ' bc-turns-aside-live' : ''}`
  const ref = useRef<HTMLDetailsElement>(null)
  const wasLive = useRef(false)
  // Whether the user has taken control of this box. Once they have, it is theirs: no
  // stream event, and no end of turn, moves it again. Before they do, it follows the
  // turn — open while there is something being said, shut once the answer is there.
  const userDecided = useRef(false)
  // ⚠️ Set while THIS component changes `open`, because assigning `el.open` fires a
  // `toggle` event exactly like a click does — the HTML spec makes no distinction. Without
  // this the first auto-open would mark the box as user-decided and the auto-collapse
  // below would never run again. The comment here previously claimed a programmatic
  // change fires nothing; it does.
  const changingOurselves = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || userDecided.current) return
    // EDGES only, never every render. Re-asserting `open` on each streamed token is the
    // cage the prop version would have been — the box would spring back open however
    // many times it was closed.
    const next = live && !wasLive.current ? true : !live && wasLive.current ? false : null
    wasLive.current = live
    if (next === null || el.open === next) return
    changingOurselves.current = true
    el.open = next
  }, [live])

  return (
    <details
      ref={ref}
      className={cls}
      onToggle={() => {
        // Ours or theirs? Both arrive here identically, so the flag is the only way to
        // tell — and getting it wrong means the box either never auto-collapses or never
        // respects a click.
        if (changingOurselves.current) {
          changingOurselves.current = false
          return
        }
        userDecided.current = true
      }}
    >
      <summary>
        <span className="bc-turns-aside-icon" aria-hidden>{icon}</span>
        <span>{label}</span>
        {live && <span className="bc-turns-aside-dots" aria-hidden>…</span>}
      </summary>
      <div className="bc-turns-aside-text">{text}</div>
    </details>
  )
}

/** One user prompt row.
 *
 *  Its own component so the flattened list has a memo boundary per row rather
 *  than per turn. Props are the row itself plus resolved source names — no
 *  entries dict, whose identity is replaced on every folded event and would
 *  defeat the memo it is passed to.
 *
 *  ⚠️ User prompts render as PLAIN text, never markdown. bridge-ui parity, and
 *  it is the safer direction: what the user typed is shown as typed. */
const UserTurnRow = memo(function UserTurnRow({
  item,
  sourceNames,
}: {
  item: Extract<RenderItem, { kind: 'user' }>
  sourceNames: string[]
}) {
  return (
    <div className={`bc-turns-item bc-turns-user ${styles.vrow}`}
      data-entry-ids={item.entryIds.join(' ')}>
      <div className="bc-turns-meta">
        <span className="bc-turns-actor">You</span>
        <span className="bc-turns-ts">{formatHMS(item.ts)}</span>
        <SourcesTag names={sourceNames} />
      </div>
      <div className="bc-turns-text">{item.text}</div>
    </div>
  )
})

/** One TURN's worth of a span: the hidden notification that opened it (when one
 *  did), and its assistant/marker items in order. */
interface SpanSegment {
  turnId: string
  notification: string | null
  ts: string
  items: RenderItem[]
}

/** The salvageable meaning of a `<task-notification>` blob: the human summary
 *  when the harness provided one, else the text stripped of its tags. */
function taskNotificationLabel(text: string): string {
  const summary = text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim()
  if (summary) return summary
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped.length > 140 ? `${stripped.slice(0, 140)}…` : stripped || 'background notification'
}

/** A hidden harness notification, surfaced: a formatted, auto-collapsed chip at
 *  the seam it explains. The reader never wrote it, so it is not a user row —
 *  but hiding it entirely is why a span used to read as unexplained separate
 *  answers. Expands to the raw text for audit. */
function NotificationChip({ text, ts }: { text: string; ts: string }) {
  return (
    <details className={`bc-turns-notification ${styles.notificationChip}`}>
      <summary className={styles.notificationChipSummary}>
        <span aria-hidden>⏱</span>
        <span className={styles.notificationChipLabel}>{taskNotificationLabel(text)}</span>
        <span className="bc-turns-ts">{formatHMS(ts)}</span>
      </summary>
      <CappedText className={styles.entryPre} text={text} />
    </details>
  )
}

/** One segment's content: its notification chip, then per item — reasoning and
 *  narration as collapsed asides, prose through ProseBody, errors as chips.
 *  `live` opens the LAST item's asides (only the final segment of a streaming
 *  span passes true). `demoted` renders inside the progress collapsible: prose
 *  stays fully visible there — the collapsible itself is the demotion. */
function SegmentContent({
  segment,
  live,
  markdown,
  onActivateSessionRef,
}: {
  segment: SpanSegment
  live: boolean
  markdown: boolean
  onActivateSessionRef: (kind: string, refId: string) => void
}) {
  const lastAssistant = [...segment.items].reverse().find((it) => it.kind === 'assistant')
  return (
    <>
      {segment.notification && <NotificationChip text={segment.notification} ts={segment.ts} />}
      {segment.items.map((it) => {
        if (it.kind === 'marker') return <CompactBoundary key={it.key} ts={it.ts} />
        if (it.kind !== 'assistant') return null
        const itemLive = live && it === lastAssistant && !!(it.thinking || it.narration)
        return (
          <Fragment key={it.key}>
            {it.thinking && <Aside variant="reasoning" text={it.thinking} live={itemLive} />}
            {it.narration && (
              <Aside
                variant="narration"
                text={it.narration}
                live={itemLive}
                count={it.narrationCount}
              />
            )}
            {it.prose && (
              <ProseBody
                text={it.prose}
                markdown={markdown}
                onActivateSessionRef={onActivateSessionRef}
              />
            )}
            {it.errors.map((e) => (
              <EntryBody
                key={e.id}
                entry={e}
                view="turns"
                turnHasText={true}
                markdown={markdown}
                onActivateSessionRef={onActivateSessionRef}
              />
            ))}
          </Fragment>
        )
      })}
    </>
  )
}

/** ONE message row for a whole response span (owner-designed, 2026-08-25): one
 *  header; every pre-final segment demoted into ONE collapsible of progress
 *  reports — prose visible inside it, narration collapsed, each seam's
 *  notification chip above its segment; the final segment's notification chip
 *  and content at top level, its answer at full prose weight. Keyed by the
 *  span's FIRST turn id, which growing never changes. */
function SpanRow({
  segments,
  agentName,
  streaming,
  markdown,
  sourceNamesForEntries,
  onActivateSessionRef,
}: {
  segments: SpanSegment[]
  agentName: string
  streaming: boolean
  markdown: boolean
  sourceNamesForEntries: (entryIds: string[]) => string[]
  onActivateSessionRef: (kind: string, refId: string) => void
}) {
  const final = segments[segments.length - 1]!
  const intermediate = segments.slice(0, -1)
  const finalLast = [...final.items].reverse().find((it) => it.kind === 'assistant')
  const lastAssistant = finalLast && finalLast.kind === 'assistant' ? finalLast : null
  const asideLive = streaming && !!(lastAssistant?.thinking || lastAssistant?.narration)
  const isError = segments.some((seg) =>
    seg.items.some((it) => it.kind === 'assistant' && it.errors.length > 0),
  )
  const headerTs = segments[0]!.ts

  return (
    <div
      className={`bc-turns-item bc-turns-assistant${isError ? ' bc-turns-error' : ''}${streaming ? ' bc-turns-streaming' : ''} ${styles.vrow}`}
      data-entry-ids={segments.flatMap((seg) => seg.items.flatMap((it) => (it.kind === 'assistant' || it.kind === 'user' ? it.entryIds : []))).join(' ')}
    >
      <div className="bc-turns-meta">
        <span className="bc-turns-actor">{agentName}</span>
        <span className="bc-turns-ts">{formatHMS(headerTs)}</span>
        {lastAssistant?.usage && <UsageLine usage={toBridgeUsage(lastAssistant.usage)} />}
        <SourcesTag names={sourceNamesForEntries(lastAssistant?.entryIds ?? [])} />
        {asideLive && lastAssistant?.thinking && (
          <span className="bc-turns-aside-tag bc-turns-aside-reasoning">reasoning…</span>
        )}
        {asideLive && lastAssistant?.narration && (
          <span className="bc-turns-aside-tag bc-turns-aside-narration">narration…</span>
        )}
        {streaming && !asideLive && <span className="bc-turns-streaming-tag">streaming…</span>}
      </div>
      {intermediate.length > 0 && (
        <details className={`bc-turns-progress ${styles.progressGroup}`}>
          <summary className={styles.progressGroupSummary}>
            <span aria-hidden>▍</span>
            <span>
              {intermediate.length} progress report{intermediate.length === 1 ? '' : 's'}
            </span>
          </summary>
          <div className={styles.progressGroupBody}>
            {intermediate.map((seg, i) => (
              <SegmentContent
                key={`${seg.turnId}:${i}`}
                segment={seg}
                live={false}
                markdown={markdown}
                onActivateSessionRef={onActivateSessionRef}
              />
            ))}
          </div>
        </details>
      )}
      <SegmentContent
        segment={final}
        live={streaming}
        markdown={markdown}
        onActivateSessionRef={onActivateSessionRef}
      />
    </div>
  )
}

/** Assistant/user prose, rendered as markdown (with ref-chip linkification) or as plain
 *  text when the markdown toggle is off. Shared by the `text` and sole-source `result`
 *  cases so an all-`result` agent transcript renders with the same markdown treatment as
 *  a streamed one (headings, lists, links) rather than a flat block. */
//
// Memoized, and its markdown `components` map is built once per activation handler.
// Parsing is the cost here (gfm, ref chips and vibes over the whole text), and it used
// to run for every mounted row on every render of the list — every streamed event and
// every session-list poll — for text that had not changed. The inline `components`
// object was also a new `ref-chip` component TYPE each render, so React unmounted and
// remounted every reference chip, closing any chip panel that was open.
const ProseBody = memo(function ProseBody({
  text,
  markdown,
  onActivateSessionRef,
}: {
  text: string
  markdown: boolean
  onActivateSessionRef: (kind: string, refId: string) => void
}) {
  const components = useMemo(
    () =>
      ({
        'ref-chip': (props: RefChipProps) => (
          <RefChip {...props} className={styles.refChip} onActivate={onActivateSessionRef} />
        ),
      }) as unknown as MdComponents,
    [onActivateSessionRef],
  )
  // The plain-text toggle wins, and it takes the vibes with it: TXT is the "show me
  // exactly what the model sent" mode, and a rail drawn beside unparsed source would be
  // claiming a structure the user just asked not to have interpreted.
  if (!markdown) return <div className="bc-turns-text">{text}</div>
  return (
    <div className={`bc-turns-text bc-turns-md ${styles.vibeProse}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

/** Renders one entry by kind, respecting the view. Assistant/user prose as markdown (or
 *  plain text when the markdown toggle is off); thinking/narration as collapsed asides;
 *  tool blocks with their command input + output; errors as a styled chip. In the Turns
 *  view, envelope kinds (`result`/`meta`) never emit raw JSON — a sole-source `result`
 *  renders its prose, everything else renders nothing. The Raw view keeps the raw JSON as
 *  the audit surface. */
function EntryBody({
  entry,
  view,
  turnHasText,
  markdown,
  onActivateSessionRef,
  resultedToolIds,
}: {
  entry: Entry
  view: 'turns' | 'raw'
  turnHasText: boolean
  markdown: boolean
  onActivateSessionRef: (kind: string, refId: string) => void
  /** Tool ids with a result in the loaded model. Optional, and safely so: the only
   *  branch that reads it is the tool one, which is reachable from Raw alone — the
   *  Turns view drops tool entries before they get here and its one call site passes
   *  `error` entries. Absent therefore cannot mean "every tool looks finished" on a
   *  surface that draws tools. */
  resultedToolIds?: ReadonlySet<string>
}) {
  switch (entry.kind) {
    case 'text':
      return (
        <>
          <ProseBody text={entry.text ?? ''} markdown={markdown} onActivateSessionRef={onActivateSessionRef} />
          {entry.recovered && (
            <span className={styles.recoveredMarker}>↻ recovered after stream interruption</span>
          )}
        </>
      )
    case 'error': {
      const isTerminal = entry.code ? TERMINAL_ERROR_CODES.has(entry.code) : false
      const chipClass =
        entry.retryable && !isTerminal ? styles.errorChipRetryable : styles.errorChipTerminal
      return (
        <div className={`${styles.errorChip} ${chipClass}`}>
          <span aria-hidden>⚠</span>
          {entry.code && <span className={styles.errorChipCode}>{entry.code}</span>}
          <span>{entry.text ?? 'error'}</span>
          {entry.statusCode ? (
            <span className={styles.errorChipStatus}>· {entry.statusCode}</span>
          ) : null}
          {entry.retryable ? <span className={styles.errorChipStatus}>· retryable</span> : null}
        </div>
      )
    }
    case 'thinking':
      return <Aside variant="reasoning" text={entry.text ?? ''} />
    case 'tool_call':
      // bridge-ui's own tool renderers — Bash, Grep, Web, File and
      // Edit/Write/MultiEdit/NotebookEdit — reached through `toToolEvent`, which had
      // been written and left wired to nothing.
      //
      // What this replaces: the tool's name over one or two `JSON.stringify` blocks. It
      // was honest and nearly unreadable — an Edit call rendered as its `old_string` and
      // `new_string` escaped into a single line, which is the exact payload a diff
      // exists to make legible. `EditRenderer` and `BashRenderer` additionally fetch
      // `/sessions/{id}/tools/{tool_id}/snapshots` and draw a real before/after diff,
      // which no amount of pretty-printing here could have produced.
      //
      // `ToolItem` rather than `ToolsSection`: the section groups a whole turn's tools
      // behind one collapsible header, which is Thread's shape because Thread's row IS
      // the turn. Raw's row is the ENTRY, so the unit here is one card. Each starts
      // collapsed, which also keeps this from making Raw's per-turn virtualized children
      // much taller than they already are.
      return <EntryToolCall entry={entry} resultedToolIds={resultedToolIds ?? EMPTY_TOOL_IDS} />
    case 'tool_result':
      // ⚠️ A result is NOT a second tool card, and making it one was a real fault before
      // it was a failing test. A cold-loaded model keeps the call and the result as two
      // rows; rendering both through `ToolItem` drew the same Edit twice, and the second
      // card had no `input` at all — so `EditRenderer` took its FETCH path (no fast-path
      // payload to diff), asked the server for snapshots a second time, and drew a
      // header over nothing. Two cards for one tool call, one of them empty, plus a
      // wasted round trip per tool on every cold load.
      //
      // The row stays, because Raw is the audit surface and one row per event is its
      // whole contract. It just renders as what it is: the output.
      return <EntryToolResult entry={entry} />
    case 'result':
      // Collapsed Turns view: a sole-source result (an all-`result` agent transcript)
      // renders its prose; every other result is redundant metadata and shows nothing —
      // never its raw JSON envelope. The Raw audit view shows the envelope.
      if (view === 'turns') {
        return !turnHasText && entry.text ? (
          <ProseBody text={entry.text} markdown={markdown} onActivateSessionRef={onActivateSessionRef} />
        ) : null
      }
      return (
        <>
          {entry.text ? (
            <ProseBody text={entry.text} markdown={markdown} onActivateSessionRef={onActivateSessionRef} />
          ) : null}
          {entry.raw !== undefined && <CappedText className={styles.entryPre} text={stringify(entry.raw)} />}
        </>
      )
    case 'system':
      // A narration system entry renders as a collapsed aside; any other subtype is
      // informational text. Never raw JSON.
      if (entry.subtype && entry.subtype.includes('narration')) {
        return <Aside variant="narration" text={entry.text ?? ''} />
      }
      if (entry.text) return <div className="bc-turns-text">{entry.text}</div>
      return null
    default:
      // `meta` + any unknown envelope kind. Turns is conversation-only (the gate already
      // dropped these); the Raw audit view shows the text or the raw JSON.
      if (view !== 'raw') return null
      if (entry.text) return <div className="bc-turns-text">{entry.text}</div>
      if (entry.raw !== undefined) return <CappedText className={styles.entryPre} text={stringify(entry.raw)} />
      return null
  }
}

/** A tool call in the Raw view. A reading page carries its input shortened; the card
 *  shows the preview and loads the whole entry when asked. */
function EntryToolCall({ entry, resultedToolIds }: { entry: Entry; resultedToolIds: ReadonlySet<string> }) {
  const { sessionId } = useToolContext()
  const full = useFullEntry(sessionId || null, entry)
  return (
    <>
      <ToolItem tool={toToolEvent(full.entry)} running={isToolRunning(full.entry, resultedToolIds)} />
      <ShortenedPayloadBar
        entry={entry}
        shortened={full.shortened}
        loading={full.loading}
        error={full.error}
        loadFull={full.loadFull}
      />
    </>
  )
}

/** A tool result in the Raw view. The row stays one row per event — see the
 *  `tool_result` case above — and its output is drawn capped, with the server's
 *  shortening loadable. */
function EntryToolResult({ entry }: { entry: Entry }) {
  const { sessionId } = useToolContext()
  const full = useFullEntry(sessionId || null, entry)
  const result = full.entry.toolResult
  return (
    <div className={styles.entryTool}>
      <span className={styles.entryToolName}>{entry.toolName ?? 'result'}</span>
      {result !== undefined && (
        // A string passes through as text. `stringify` would wrap it in quotes and
        // turn its newlines into `\n`, which is what made a Bash result unreadable —
        // and tool output is mostly strings that are already meant to be read.
        <CappedText
          className={styles.entryPre}
          text={typeof result === 'string' ? result : stringify(result)}
        />
      )}
      <ShortenedPayloadBar
        entry={entry}
        shortened={full.shortened}
        loading={full.loading}
        error={full.error}
        loadFull={full.loadFull}
      />
    </div>
  )
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
