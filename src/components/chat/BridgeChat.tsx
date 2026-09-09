import { Fragment, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChatProvider,
  useActiveSession,
  useActivity,
  useComposer,
  useSessionActions,
  useSessionControls,
} from '@kayushkin/chat-core'
import { createPortal } from 'react-dom'
import { useBridgeConfig } from '../../context'
import type { FetchFn } from '../../types'
import { readSessionDeeplink, writeSessionParam, initialSessionDeeplinkState, type SessionDeeplinkState } from '../../sessionDeeplink'
import { BridgeAttach } from '../BridgeAttach'
import { GitPanel } from '../GitPanel'
import { ChromeSheet } from '../minimal/ChromeSheet'
import { useMinimalChrome, useRegisterMinimalChrome, MOBILE_BREAKPOINT } from '../minimal/MinimalChromeContext'
import { MinimalTopBar } from '../minimal/MinimalTopBar'
import { SessionDrawer } from '../minimal/SessionDrawer'
import { LinkedKanbanPanel } from './LinkedKanbanPanel'
import { SplitDragHandle } from './SplitDragHandle'
import Sidebar from './Sidebar'
import MinimalPaneSwitch from './MinimalPaneSwitch'
import TurnList from './TurnList'
import Timeline from './Timeline'
import Composer from './Composer'
import {
  SessionSettingsInline,
  SessionSettingsPanel,
  useSessionSettings,
} from './SessionSettings'
import AwaitingYouBanner from './AwaitingYouBanner'
import SessionStatusLine, { useSessionStatus } from './SessionStatusLine'
import BudgetBanner from './BudgetBanner'
import SessionHeader from './SessionHeader'
import { useNewSessionTarget, type NewSessionTarget } from './useNewSessionTarget'
import { useGitRepos } from './useGitRepos'
import { useAttachToken } from './useAttachToken'
import { loadMarkdownPref, saveMarkdownPref } from './threadPersistence'
import { loadSidebarCollapsed, saveSidebarCollapsed } from './sidebarPersistence'
import {
  DEFAULT_MOBILE_PANE,
  loadMobilePane,
  loadPaneSizes,
  loadPanesHidden,
  saveMobilePane,
  savePaneSizes,
  savePanesHidden,
  visiblePanes,
  type PaneKey,
  type PaneSizes,
} from './panePersistence'

// Adapt the host's fetch (bridge-ui's `FetchFn`, string-only) to the full
// `typeof fetch` signature ChatProvider expects. ApiClient only ever passes string
// URLs, but URL/Request are covered too so the types are honest.
function chatFetchOver(fetchFn: FetchFn): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return fetchFn(url, init)
  }
}

/** States in which the session is busy — it drives the live streaming indicator AND
 *  the composer's Stop button, which is why it must be the server's answer rather than
 *  the client's own in-flight-POST flag. `paused` is deliberately absent: a parked
 *  session is not producing anything and there is nothing to interrupt; the composer
 *  shows it its own ⏸ marker instead. */
const STREAMING_STATES = new Set([
  'running',
  'model_generating',
  'tool_running',
  'starting',
  'compacting',
])

/** The chat: sidebar + thread + panes, on the `@kayushkin/chat-core` data layer —
 *  it renders from an in-memory store and the network only reconciles.
 *
 *  ⚠️ This mounts ONE provider, and the absence of the second is deliberate.
 *  `BridgeProvider` comes from the host's `BridgeLayout`, which this page routes
 *  under. Mounting another here would still resolve every value — but
 *  `BridgeProvider` nests a `MinimalChromeProvider` unconditionally
 *  (`provider.tsx`), so the page would hold TWO: `useRegisterMinimalChrome`
 *  below would register its phone chrome with the inner one while the tab row
 *  reads the outer, which would never learn a surface had taken over and would
 *  draw its tabs on top of that chrome at narrow widths (bridge-ui `936ec04`).
 *
 *  `ChatProvider` is chat-core's data layer and nothing above supplies it. Its
 *  paths come from the same `BridgeConfig` every other page reads, so the chat
 *  reaches noteboard and the resolver through whatever the host proxies. */
export function BridgeChat() {
  const { fetch: fetchFn, basePath, noteboardBasePath, resolveEndpoint } = useBridgeConfig()
  const chatFetch = useMemo(() => chatFetchOver(fetchFn), [fetchFn])
  return (
    <ChatProvider
      fetch={chatFetch}
      basePath={basePath}
      noteboardBasePath={noteboardBasePath}
      resolveEndpoint={resolveEndpoint}
    >
      <Workspace />
    </ChatProvider>
  )
}

/** The page inside both providers: sidebar + thread, plus the cold-load bootstrap.
 *
 *  Landing on `/` used to show an empty pane, because nothing ever opened a chat:
 *  `activeId` starts null (no session is restored across a reload) and no pending pane
 *  was opened either, so the composer typed into a draft that would be sent to whatever
 *  instance the server happened to default to. The bootstrap opens ONE pending chat,
 *  aimed at the same recorded instance the "+ New" button uses.
 *
 *  It fires once, and only after prefs and instances have both loaded — acting earlier
 *  reads an empty prefs snapshot and targets nothing. It re-checks `activeId` at fire
 *  time rather than trusting the value it was mounted with: a session clicked in the
 *  sidebar while prefs were still in flight must not be replaced by a new chat. */
function Workspace() {
  const target = useNewSessionTarget()
  const { newSession } = useSessionActions()
  const { id: activeId, summary: activeSummary, select } = useActiveSession()
  const bootstrapped = useRef(false)

  // The mobile chrome. Below 640px the library engages `minimal`, and THIS component is
  // the surface that answers it: the top bar, the pane switch, the session drawer and
  // the controls sheet all render under the flag, and `useRegisterMinimalChrome` is how
  // the page says so.
  //
  // ⚠️ Registering is not bookkeeping — it is what re-enables hiding dash's site header
  // (`DashboardLayout.module.css` keys off the `bridge-minimal-chrome` body class, and
  // the library sets that class only once a surface has registered). Until this call
  // existed, `/` engaged minimal mode and drew none of the replacement, so the
  // library deliberately left every navigation in place. See bridge-ui `936ec04`.
  const { minimal, setDrawerOpen, override, setOverride } = useMinimalChrome()
  useRegisterMinimalChrome(minimal)

  // The re-engage pill's condition, and the only thing that needs a width here. It asks
  // what `minimal` cannot: the user has forced the full layout, but is this still a
  // viewport that WOULD have gone minimal? Without it, "Show full layout" is a one-way
  // door — the override is persisted, so the page would come back full every load with
  // no control on screen to undo it.
  const [viewportWidth, setViewportWidth] = useState(
    () => typeof window === 'undefined' ? 1024 : window.innerWidth,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const showReengage = !minimal && override === 'full' && viewportWidth < MOBILE_BREAKPOINT

  // Deeplink, both directions. `?session=<bridge_id>` opens that session, and the param
  // then keeps naming whatever session is active — so a chat tab can be bookmarked,
  // shared and reloaded back into. Producers of links in this shape: BridgeKanban,
  // BridgeOrchestrator, RefChip's chatHref, and dash's own Orchestrator page — which is
  // now a thin mount of BridgeOrchestrator. All three live in bridge-ui, and all three
  // build the target from `routes` since bridge-ui's own `hrefFor` and its hardcoded
  // paths were deleted (bridge-ui `fea0521`).
  //
  // The reconciler is bridge-ui's, reused whole: the read and the write would otherwise
  // fight, because the write effect sees the PREVIOUS active id in the same commit the
  // read applies a new one, and would push the stale id straight back into the URL for
  // the read to treat as a fresh deeplink. `awaiting` holds writes until focus lands on
  // the id that was read. See sessionDeeplink.ts's header.
  //
  // Note `routes.chat` still resolves to `/` — the producers above land on the ORIGINAL
  // chat, not here. Repointing them is the daily-driver cutover's call, not this one's.
  const [searchParams, setSearchParams] = useSearchParams()
  const deeplink = useRef<SessionDeeplinkState>(initialSessionDeeplinkState)

  // Whole-sidebar collapse. It lives HERE rather than in `Sidebar` because the collapsed
  // state replaces that component with the strip — a flag the sidebar owned would be
  // unmounted along with the sidebar the moment it was set.
  //
  // Read in the `useState` initialiser, not in an effect: the first paint has to be the
  // stored answer, or every load of a collapsed page draws the full sidebar and folds it
  // away a frame later. Same rule the folder collapse and the MD/TXT preference follow.
  //
  // ⚠️ The strip REPLACES the sidebar rather than hiding it with a class. bridge-ui also
  // puts `bc-sidebar-collapsed` on its container, and that class is styled by nothing —
  // `grep bc-sidebar-collapsed styles.css` is empty, in bridge-ui and in dash. It is a
  // hook with no rule behind it, so copying it would only add a second thing to keep in
  // step with the render. What is observable is the strip, and that is what the spec
  // asserts.
  //
  // The control ships at every width down to the 640px minimal breakpoint, and no lower.
  // It used to ship at every width full stop, because bridge-ui hides its strip in the
  // minimal chrome (`styles.css:4371`) on the strength of having a `SessionDrawer` to
  // reach the list with, and chat had none — so hiding it here would have taken the
  // collapse away with nothing to replace it. chat now draws that drawer, so the reason
  // for the divergence is spent and the strip follows bridge-ui's rule again.
  //
  // Between 640px and 768px it still matters and is still drawn: the stylesheet turns it
  // into a full-width 36px bar under 768px (`styles.css:2981-2991`) and `.bc-main` stacks,
  // which is the width where giving the thread the sidebar's 40vh back is worth the most
  // and where nothing else reaches the list.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)

  // The write rides with the state change rather than sitting in an effect keyed on the
  // flag, so a value that arrived from storage is never written straight back — only a
  // choice the user actually made is recorded.
  //
  // Deliberately NOT the functional `setSidebarCollapsed(c => …)` form that bridge-ui's
  // `toggleSessionList` uses (`BridgeChat.tsx:179`): React may call an updater twice, and
  // a `localStorage` write inside one is a side effect in a function that is required to
  // be pure. `Sidebar.tsx` records the same reasoning for the folder toggle. Reading the
  // flag off the render instead costs a dep and nothing else — there are two callers and
  // both are clicks: the collapse button inside `Sidebar`, reached through the
  // `onToggleCollapse` prop passed below, and the strip button that expands it again.
  const toggleSidebar = useCallback(() => {
    const next = !sidebarCollapsed
    saveSidebarCollapsed(next)
    setSidebarCollapsed(next)
  }, [sidebarCollapsed])

  // Declared BEFORE the bootstrap effect so an inbound deeplink claims the bootstrap
  // latch first. Otherwise a cold `/?session=<id>` opens a pending "New chat"
  // over the top of the session the link asked for.
  useEffect(() => {
    const { open, state } = readSessionDeeplink(searchParams.get('session'), deeplink.current)
    deeplink.current = state
    if (!open) return
    bootstrapped.current = true
    select(open)
  }, [searchParams, select])

  useEffect(() => {
    if (bootstrapped.current || !target.ready) return
    bootstrapped.current = true
    if (activeId) return
    newSession(target.opts)
  }, [target.ready, target.opts, activeId, newSession])

  useEffect(() => {
    // What stops this from clobbering an inbound deeplink is the `awaiting` latch inside
    // writeSessionParam, not the ordering of these effects: until focus lands on the id
    // that was read, every write is held. BridgeChat additionally guards on "the URL has
    // been read at least once" because it RESTORES a last-used session, so focus can be
    // non-null before the read runs. chat has no such restore — its cold load opens a
    // pending pane and `activeId` stays null — so that guard is inert here, and carrying
    // it would only make a future effect reordering silently work instead of visibly
    // breaking. Measured: with the guard absent and this effect declared first, the whole
    // deeplink spec still passes.
    const { write, value, state } = writeSessionParam(activeId, deeplink.current)
    deeplink.current = state
    if (!write) return
    const next = new URLSearchParams(searchParams)
    if (value) next.set('session', value)
    else next.delete('session')
    // Replace, not push: browsing sessions must not fill the back stack with one entry
    // per session looked at.
    setSearchParams(next, { replace: true })
  }, [activeId, searchParams, setSearchParams])

  // One element, rendered in one of two places: in the row on a desktop, inside the
  // drawer on a phone. Not two copies — a second mounted `Sidebar` would open a second
  // session-list subscription and hold its own filter, search and folder-collapse state,
  // so the list in the drawer would answer differently from the one behind it.
  const sidebar = (
    <Sidebar
      newTarget={target}
      onToggleCollapse={toggleSidebar}
      onAfterSelect={minimal ? () => setDrawerOpen(false) : undefined}
    />
  )

  return (
    // `bc-minimal` is bridge-ui's own container class and every rule this mode needs is
    // already in the stylesheet dash loads: it collapses `bc-main` to a column, hides the
    // session list and its strip, and gives the composer a safe-area gutter. This ships
    // no CSS.
    <div className={`bc-container ${minimal ? 'bc-minimal' : ''}`}>
      {minimal && (
        <MinimalTopBar title={activeSummary?.displayName || activeSummary?.sessionId || ''} />
      )}
      <div className="bc-main">
        {/* The strip is the desktop's way back to the list; on a phone that job belongs
            to the drawer, and the stylesheet hides both the list and the strip under
            `bc-minimal` anyway. Rendering neither here keeps the DOM honest about it. */}
        {!minimal && (sidebarCollapsed ? (
          <button
            className="bc-sidebar-strip"
            onClick={toggleSidebar}
            title="Show sessions"
            aria-label="Show sessions"
          >
            <span className="bc-sidebar-strip-chevron" aria-hidden>▸</span>
            <span className="bc-sidebar-strip-label">Sessions</span>
          </button>
        ) : sidebar)}
        <div className="bc-workspaces">
          <ThreadPane newTarget={target} />
        </div>
      </div>
      {minimal && (
        <>
          {/* The drawer draws the list whatever `sidebarCollapsed` says. Collapsing is a
              desktop arrangement of a row that is not on screen here, and honouring it
              would leave the phone with no way to reach the list at all. */}
          <SessionDrawer>{sidebar}</SessionDrawer>
          <ChromeSheet />
        </>
      )}
      {showReengage && (
        <button
          type="button"
          className="bc-mc-reengage"
          onClick={() => setOverride(null)}
          aria-label="Switch to mobile layout"
        >Use mobile layout</button>
      )}
    </div>
  )
}

/** The active session's thread: header (metadata + view controls), the virtualized
 *  turn/timeline view, and the composer.
 *
 *  `newTarget` is passed down rather than re-resolved here because `useNewSessionTarget`
 *  owns a `useBridgePrefs`, and that hook holds its own local snapshot of the prefs
 *  record with no shared context behind it. A second instance would issue a second
 *  `GET /bridge-prefs` and then keep a copy that drifts from the one the Sidebar writes —
 *  and the controls bar's write-back MERGES over its snapshot, so a stale copy is how a
 *  saved spend ceiling gets resurrected after the user cleared it. One instance, passed. */
function ThreadPane({ newTarget }: { newTarget: NewSessionTarget }) {
  const { id, summary, select } = useActiveSession()

  // `controlsSlot` is the sheet's portal target, non-null exactly while `ChromeSheet` is
  // mounted. See the render below for why the portal is gated on `minimal` as well.
  const { minimal, controlsSlot } = useMinimalChrome()

  // Which single pane the mobile chrome draws. A separate record from `panesHidden`
  // below, and `panePersistence.ts` records why: one pane wide, "both" is not an
  // available answer, so the two questions cannot share a row.
  const [mobilePane, setMobilePaneState] = useState(loadMobilePane)
  const setMobilePane = useCallback((pane: PaneKey) => {
    saveMobilePane(pane)
    setMobilePaneState(pane)
  }, [])

  // Which panes are on screen. Read as a `useState` initialiser for the same reason the
  // sidebar collapse and the MD/TXT preference are: the first paint has to be the stored
  // answer, or a user who reads Turns beside Timeline gets one pane and a second one
  // sliding in a frame later, every load.
  const [panesHidden, setPanesHidden] = useState(loadPanesHidden)

  // The write rides with the state change rather than sitting in an effect keyed on the
  // record, so a value that arrived from storage is never written straight back — only a
  // choice the user actually made is recorded.
  //
  // Deliberately NOT the functional `setPanesHidden(p => …)` form: React may call an
  // updater twice, and a `localStorage` write inside one is a side effect in a function
  // that is required to be pure. `Sidebar.tsx` and `toggleSidebar` above record the same
  // reasoning. Reading the record off the render costs a dep and nothing else.
  //
  // The sizes companion this comment used to say was deliberately absent. It was, and the
  // reason it gave was sound: the record's only non-reset writer is a drag handle, and
  // until the line below there was no handle here to write it, so it would have been
  // state whose one writer always wrote the same value. That is no longer true — the
  // resizer is mounted in the split row further down (noteboard `b62e8744`).
  const togglePane = useCallback((key: PaneKey) => {
    const next = { ...panesHidden, [key]: !panesHidden[key] }
    savePanesHidden(next)
    setPanesHidden(next)
  }, [panesHidden])

  // How the two panes divide the row. Same `useState` initialiser as the record above,
  // for the same reason: a stored 3:1 that arrived a frame after paint would show the
  // user an even split and then snap.
  //
  // ⚠️ Hiding a pane deliberately does NOT reset this, and that is the one place chat
  // departs from bridge-ui, which resets a revealed pane's siblings to 1
  // (`togglePane` in `Workspace.tsx`). Its reason does not carry: with seven panes, revealing an
  // eighth into a layout somebody dragged gives it whatever share is left over, so a
  // reset is the only sane arrival. There are exactly two panes here and a drag conserves
  // their total, so the stored ratio IS the arrangement the user made — hiding Timeline
  // to read a wide transcript and bringing it back should return the widths they set,
  // not silently undo them.
  const [paneSizes, setPaneSizesState] = useState(loadPaneSizes)

  // Called once per pointer-move for the length of a drag, so unlike the toggles above
  // this writes storage at frame rate. Measured rather than assumed before leaving it
  // that way: the row is ~40 bytes and `setItem` of it costs single-digit microseconds,
  // some three orders of magnitude under a 16ms frame, so a drag cannot be what makes
  // one drop.
  //
  // The write still rides with the setter rather than moving into an effect keyed on
  // `paneSizes` — the reason `savePanesHidden`'s comment gives holds here too, and an
  // effect would additionally write back the value that was just READ from storage on
  // mount. There is no drag-end hook to defer to in any case: `SplitDragHandle` reports
  // positions, not gestures, which is what lets one implementation serve three callers.
  const setPaneSizes = useCallback((next: PaneSizes) => {
    savePaneSizes(next)
    setPaneSizesState(next)
  }, [])

  // Whether the Turns pane draws its raw audit rendering. NOT persisted, deliberately:
  // it was never persisted as part of the old exclusive switch either, and Raw is an
  // audit surface someone drops into to answer one question. Opening every future
  // session in it because of one look is not a preference anyone expressed.
  const [raw, setRaw] = useState(false)

  // Read as a `useState` initialiser, not in an effect: the first paint has to be the
  // stored answer. Rendering markdown and then swapping to plain text a frame later
  // reflows every assistant reply in the pane, and the user watching it has no way to
  // tell that from the toggle mis-firing on its own.
  const [markdown, setMarkdownState] = useState(loadMarkdownPref)

  // The write rides with the state change rather than sitting in an effect keyed on
  // `markdown`, so a value that arrived from storage is never written straight back —
  // only a choice the user actually made is recorded.
  const setMarkdown = useCallback((next: boolean) => {
    saveMarkdownPref(next)
    setMarkdownState(next)
  }, [])

  // Two independent witnesses that the session is busy, OR'd:
  //  - the summary's state — the server's word, but it rides the session-LIST
  //    stream and for a seconds-old session the record can lag the entire first
  //    turn (measured live 2026-08-25, br_1787617143776318105: the narration
  //    aside never saw live=true because this flag stayed false for the whole
  //    12.6s turn);
  //  - the live activity — derived from the transcript stream itself, so it is
  //    true the instant an event arrives and idles on result/terminal/
  //    session_state. chat-core's own useActivity doc warns against gating on
  //    the session state alone; this was exactly that trap.
  const activity = useActivity(id)
  const streaming = (!!summary && STREAMING_STATES.has(summary.state)) || activity.kind !== 'idle'

  // Observability, deliberately permanent: the streaming chain has broken twice in
  // ways only visible on a live session (a summary that lags a fresh session; two
  // event-id spaces), and each diagnosis needed exactly these four values at the
  // moment of failure. Written on every change; read from the console or by an
  // instrumented browser run.
  useEffect(() => {
    ;(window as unknown as { __chatStreaming?: object }).__chatStreaming = {
      id,
      streaming,
      activityKind: activity.kind,
      summaryState: summary?.state ?? null,
    }
  }, [id, streaming, activity, summary])

  // The repo list behind the Git pane, and the selection it reads.
  //
  // Held here rather than inside the pane for the reason `useGitRepos` states: the
  // pane takes its list as props so a second reader — the repo dropdown the original
  // chat puts in its header — can share one selection. chat has no such dropdown
  // yet; the state is in the right place for the day it does.
  //
  // The session's own state is the refetch signal, so the working tree is re-read at
  // every turn boundary. That is the moment it matters: an agent that has just
  // finished a turn is exactly the agent that has just finished editing files, and a
  // diff from before the turn is a diff of the wrong tree. `summary.state` is a
  // string here and reads as `''` with no session — `useGitRepos` fetches nothing
  // without a session id, so the empty signal never reaches the wire.
  const gitRepos = useGitRepos(id, summary?.state ?? '')

  // The terminal, for a session running in pty mode.
  //
  // `mode` is the SESSION's, not the harness's: `GET /sessions` reports `events` or
  // `pty` per session (6,069 and 23 of them respectively on this host), and only a pty
  // session has a hub to join. The harness's own `pty` boolean is a different question —
  // whether it CAN be switched — and gates the toggle rather than the pane.
  const attach = useAttachToken(id, summary?.mode ?? '')
  const isPty = summary?.mode === 'pty'

  // ⚠️ ONE `useSessionControls` for the whole pane, and that is the point of it being here
  // rather than in `SessionSettings`. Its `compacting` is hook-LOCAL `useState` (chat-core
  // `hooks.ts`), set by whichever hook instance called `compact()` — so a second call
  // of the hook inside `TurnList` would hand it an independent flag that never goes true,
  // and the strip would simply never appear. Both consumers must read the SAME instance.
  //
  // The controls object is passed down whole rather than destructured here: the settings
  // components use five of its seven members and own the reasoning about each, and
  // splitting them across a prop list would put that reasoning in two files.
  const controls = useSessionControls(id)

  // ⚠️ Same one-instance rule as `useSessionControls` above, and for the same reason:
  // `useComposer`'s `error` is hook-LOCAL state, set by whichever instance's stop()
  // or resume() threw. The Composer calls those; the turns pane's status slot renders
  // the result. Both must read the SAME instance, so it lives here and is passed down.
  const composer = useComposer(id)
  // Which failed action `composer.error` describes, for the status slot's phrasing
  // ("couldn't stop — still running: …" vs a bare message). Set by the Composer's
  // handlers — the error string alone cannot say which button it belongs to.
  const [composerFailedAction, setComposerFailedAction] = useState<'stop' | 'resume' | null>(
    null,
  )

  // Resolved ONCE here for the same reason `controls` is. The settings now render in three
  // places — the top bar, the header's details dropdown, and the mobile chrome sheet — and
  // each needs the same capability set, model list and pending-pane state. Calling the hook
  // per site would give each its own copy of the local model/effort state, so a pick made
  // in the dropdown would not show up on the bar.
  const settings = useSessionSettings(newTarget, controls)

  // What is on screen, asked once for both readings. On a desktop the panes are
  // independent flags and either, both or neither can be up. Under the minimal chrome the
  // thread is one pane wide, so the switch's answer is the whole answer — and exactly one
  // pane is always up, which is why the empty-state hint below cannot be reached there.
  //
  // The desktop answer is a LIST in draw order rather than a flag per pane, because
  // there are three of them now and the boundaries are between whichever ones survive:
  // hiding Timeline makes Turns and the kanban cards neighbours, with one handle, and a
  // per-pane flag cannot say that.
  //
  // `attach` is the one pane the stored record cannot decide alone: a session in events
  // mode has no terminal to draw whatever flag is stored for it, so drawability is passed
  // in as a fact about the session. The mobile branch answers the same question the same
  // way — a phone that had stored `attach` and then opened an events session would
  // otherwise draw an empty pane with no way back to Turns.
  const paneDrawable = useMemo(() => ({ attach: isPty }), [isPty])
  const desktopPanes = visiblePanes(panesHidden, paneDrawable)
  const panes =
    minimal
      ? mobilePane === 'attach' && !isPty
        ? [DEFAULT_MOBILE_PANE]
        : [mobilePane]
      : desktopPanes

  // Built once and shared: the Turns pane draws the status slot, and the fallback below
  // draws it when that pane is hidden. Two readers, one description of what the session
  // is doing.
  const composerStatus = useMemo(
    () => ({
      paused: composer.paused,
      resumable: composer.resumable,
      error: composer.error,
      failedAction: composerFailedAction,
    }),
    [composer.paused, composer.resumable, composer.error, composerFailedAction],
  )
  // The SAME derivation the Turns pane runs. Not local state — every input is a store
  // read or a prop — so computing it twice cannot disagree with itself, unlike the
  // compacting flag, which is hook-local and has to be threaded down from one instance.
  const sessionStatus = useSessionStatus(id, streaming, controls.compacting, composerStatus)
  // The status slot lives at the foot of the transcript (`e0753eb`: one fixed-height
  // slot whose content swaps in place, rather than four strips popping between the
  // transcript and the composer). That home is right, and it has a hole: the Turns pane
  // can be turned off, and the slot went with it — measured, `role="status"` dropped to
  // zero, so "stopped", "paused", "disconnected", a failed send and "Compacting context…"
  // all went dark on a page still showing Timeline or Cards.
  //
  // A session being stopped is not a fact about the transcript pane, so it cannot be
  // hidden by turning that pane off. Rendered here only when the pane is absent, which
  // keeps ONE slot on screen: the two mounts are exclusive by construction, not by
  // agreement.
  const turnsPaneHidden = !panes.includes('turns')

  // Scoped to the split row rather than `document`, so the lookup cannot reach a
  // `data-pane` on some other surface. dash serves bridge-ui's own chat at `/` and this
  // page at `/` — one document, and the library's panes carry the same attribute.
  const splitRowRef = useRef<HTMLDivElement>(null)

  // Passed unconditionally, and a `resizable ?` guard here was written and then deleted.
  // It could not change an answer: a lone pane is the sole flex child of the row, and a
  // sole flex child fills its container whatever its grow number is — `flex: 9 1 0` and
  // `flex: 1 1 0` lay out identically with nothing to share with. `panePersistence.ts`
  // records the same rule about its own dropped `Array.isArray` check, and the reason is
  // the same: a guard that cannot change an answer is one more thing claiming to do work
  // it does not do. `e2e/chat-pane-resizer.spec.ts` pins the CSS fact this rests on.
  const paneStyle = (key: PaneKey) => ({ flex: `${paneSizes[key]} 1 0` })

  // On a phone the whole top bar is hidden (`.bc-workspace-minimal .bc-header`), so the
  // settings that now live on it would be unreachable. They go into the chrome sheet
  // instead — BOTH clusters, because the sheet has the vertical room the bar does not and
  // there is no reason to keep the bar's one-line triage down there.
  //
  // It keeps the `bc-controls-bar` class purely so `.bc-mc-controls-slot > .bc-controls-bar`
  // still restacks it full-width inside the sheet. There is no longer any such element on
  // a desktop — that is the point of the merge.
  const settingsSheet = (
    <div className="bc-controls-bar">
      <SessionSettingsInline settings={settings} controls={controls} />
      <SessionSettingsPanel settings={settings} controls={controls} />
    </div>
  )

  return (
    // `bc-workspace-minimal` is what hides the header, whose job bridge-ui's own top bar
    // has taken over at this width.
    //
    // ⚠️ It hides the WHOLE header, and the header is now where every session setting
    // lives — so this flag decides what is reachable on a phone, not merely what it looks
    // like. The settings ride into the chrome sheet through the portal below, which is why
    // that portal is not optional chrome.
    //
    // What is still only in the header, and so still off-screen here: the permission
    // select, Tools, System Prompt, Mark done and the nav arrows. That is a placement
    // question rather than a defect — nothing is unreachable, because the sheet's "Show
    // full layout" restores the desktop layout in one tap and the re-engage pill brings
    // the user back. Recorded on noteboard `96afb01c`.
    <div className={`bc-workspace bc-workspace-focused ${minimal ? 'bc-workspace-minimal' : ''}`}>
      {minimal ? (
        // Rendered here rather than beside the top bar as bridge-ui does it, and the
        // divergence has a reason: bridge-ui's switch sits at container level because it
        // drives whichever of N workspaces has focus. chat draws exactly one, so the
        // control belongs with the panes it switches and the state stays in this
        // component. The position on screen is the same either way — it takes the slot
        // the header has just given up, directly under the top bar.
        <MinimalPaneSwitch pane={mobilePane} onPick={setMobilePane} />
      ) : null}
      <SessionHeader
        panesHidden={panesHidden}
        paneDrawable={paneDrawable}
        togglePane={togglePane}
        raw={raw}
        setRaw={setRaw}
        markdown={markdown}
        setMarkdown={setMarkdown}
        settings={settings}
        controls={controls}
      />

      {/* A flex row, so revealing the second pane puts it BESIDE the first rather than
          replacing it — which is the whole feature. `bc-chat-split` is bridge-ui's own
          class and its rule (`styles.css:652`) is already in the stylesheet dash loads;
          both pane roots are `flex: 1 1 0` with a min-width there too, so this ships no
          CSS of its own.

          The row is rendered even when one pane is hidden. Mounting it conditionally
          would remount the surviving pane on every toggle, throwing away its scroll
          position — and the pane the user did NOT touch is the one they were reading. */}
      <div className="bc-chat-split" ref={splitRowRef}>
        {/* One handle per ADJACENT pair of visible panes, so two panes draw one boundary
            and three draw two. Each handle names the pair it sits between, which is what
            lets a drag conserve that pair's total and leave every other pane's share
            untouched — the third pane must not move because its neighbours renegotiated.

            `SplitDragHandle` is bridge-ui's, exported for this (`cdb2f0f`) rather than
            copied: its props are an axis, a class name and two accessors, so it needed no
            library change to serve a host with its own split. `bc-split-resizer` is
            bridge-ui's class and its rule is already in the stylesheet dash loads, so this
            ships no CSS.

            Under the minimal chrome `panes` holds exactly one entry, so a phone draws no
            handle — and needs none, with nothing to trade width against. */}
        {panes.map((pane, index) => (
          <Fragment key={pane}>
            {index > 0 && (
              <SplitDragHandle
                axis="horizontal"
                className="bc-split-resizer"
                resolveDraggedPair={() => {
                  const row = splitRowRef.current
                  if (!row) return null
                  const before = panes[index - 1]
                  const elementBefore = row.querySelector<HTMLElement>(`[data-pane="${before}"]`)
                  const elementAfter = row.querySelector<HTMLElement>(`[data-pane="${pane}"]`)
                  // Null rather than a guess. The handle reads this as "not resizable" and
                  // does nothing, which is the honest answer if a pane is not on screen —
                  // measuring the pair from a missing element would write a ratio derived
                  // from a zero width.
                  if (!elementBefore || !elementAfter) return null
                  return {
                    elementBefore,
                    elementAfter,
                    growUnitsBefore: paneSizes[before],
                    growUnitsAfter: paneSizes[pane],
                  }
                }}
                commitGrowUnits={({ growUnitsBefore, growUnitsAfter }) =>
                  setPaneSizes({
                    ...paneSizes,
                    [panes[index - 1]]: growUnitsBefore,
                    [pane]: growUnitsAfter,
                  })
                }
              />
            )}
            {pane === 'turns' && (
              <TurnList
                sessionId={id}
                view={raw ? 'raw' : 'turns'}
                markdown={markdown}
                streaming={streaming}
                compacting={controls.compacting}
                composerStatus={composerStatus}
                style={paneStyle('turns')}
              />
            )}
            {pane === 'timeline' && <Timeline sessionId={id} style={paneStyle('timeline')} />}
            {/* bridge-ui's own pane, mounted unmodified. It self-fetches off the provider
                config, which is why the `kanbanStoreBasePath` this page was missing had to
                land first — without it the pane reads "not configured" and draws nothing,
                the same way the Orchestrator row did before `4fcdd99`.

                `onToggleCollapse` is the pane's own close control, and it hides the pane
                the same way the header toggle does, so the two agree on one record. */}
            {/* bridge-ui's own pane, mounted unmodified — the same deal as the kanban
                pane below, except that its repo list is the CALLER's. See `useGitRepos`.

                This is the one pane the original chat had that dash could not reach any
                other way: `/orchestrator` and `/kanban` are pages in their own right,
                and `GitPanel` was mounted from the chat workspace and nowhere else. */}
            {pane === 'git' && id && (
              <GitPanel
                sessionId={id}
                refetchSignal={summary?.state ?? ''}
                gitRepos={gitRepos.repos}
                selectedRepo={gitRepos.selectedRepo}
                setSelectedRepo={gitRepos.setSelectedRepo}
                gitReposLoading={gitRepos.loading}
                gitReposError={gitRepos.error}
                refreshGitRepos={gitRepos.refresh}
                onToggleCollapse={() => togglePane('git')}
                style={paneStyle('git')}
                paneKey="git"
              />
            )}
            {/* The terminal. `BridgeAttach` is bridge-ui's, mounted unmodified — it owns
                the xterm instance and the WebSocket; what dash owns is the token, and
                `useAttachToken` says why that is read from the server rather than kept
                from the mode-switch response.

                Each state is drawn rather than collapsed into "no terminal": a session
                whose pty hub has gone is told how to get one back, and a gateway that
                cannot be reached says so. The two are not the same situation and a
                single empty pane would make them look it. */}
            {pane === 'attach' && id && (
              <div
                className="bc-split-pane bc-split-pane-attach"
                style={paneStyle('attach')}
                data-pane="attach"
              >
                <div className="bc-split-pane-header">
                  <span className="bc-split-pane-title">Terminal</span>
                  <span className="bc-spacer" />
                  <button
                    type="button"
                    className="bc-split-collapse-btn"
                    aria-label="Hide terminal"
                    title="Hide terminal"
                    onClick={() => togglePane('attach')}
                  >
                    ×
                  </button>
                </div>
                {attach.state.status === 'ready' && (
                  <BridgeAttach sessionId={id} attachToken={attach.state.token} />
                )}
                {attach.state.status === 'loading' && (
                  <div className="bc-git-empty">Connecting…</div>
                )}
                {attach.state.status === 'absent' && (
                  <div className="bc-git-empty">
                    This session has no live terminal. Switch its mode to pty to start one.
                  </div>
                )}
                {attach.state.status === 'error' && (
                  <div className="bc-git-error">Terminal: {attach.state.message}</div>
                )}
              </div>
            )}
            {pane === 'kanban' && id && (
              <LinkedKanbanPanel
                sessionId={id}
                onToggleCollapse={() => togglePane('kanban')}
                style={paneStyle('kanban')}
                paneKey="kanban"
              />
            )}
          </Fragment>
        ))}
        {panes.length === 0 && (
          // Hiding everything is reachable and recoverable — the toggles are in the
          // header, which is still on screen — so it is answered with a hint rather than
          // forbidden by a control that refuses the last click. Same choice bridge-ui
          // made, and `bc-split-empty` is its class and its existing rule.
          <div className="bc-split-empty">
            <div className="bc-split-empty-hint">
              Every pane is hidden. Use the pane toggles above to bring one back.
            </div>
          </div>
        )}
      </div>

      <BudgetBanner sessionId={id} />
      {id && <AwaitingYouBanner sessionId={id} />}
      {/* Portaled into the sheet on a phone, and rendered NOWHERE else — on a desktop these
          same controls are on the top bar, which is the whole point of the merge. Rendering
          both would put two model pickers on screen.

          Gated on `minimal` AND the slot, not the slot alone. `controlsSlot` is state set
          from `ChromeSheet`'s callback ref, so on the commit where the viewport widens and
          the sheet unmounts it is briefly a detached node — portaling into that renders the
          settings nowhere for a frame. Reading `minimal` drops the portal in the same commit
          that took the sheet away, by which time the header is back. */}
      {minimal && controlsSlot ? createPortal(settingsSheet, controlsSlot) : null}
      {turnsPaneHidden && sessionStatus !== null && (
        <SessionStatusLine status={sessionStatus} onOpenSession={select} />
      )}
      <Composer
        sessionId={id}
        turnRunning={streaming}
        composer={composer}
        onFailedAction={setComposerFailedAction}
      />
    </div>
  )
}
