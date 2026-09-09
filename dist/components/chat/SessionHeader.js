import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveSession, useSessionList, useSessionActions, useSessionCost, useContextUsage, useSessionInfo, useManagedSession, usePendingSession, useActivity, } from '@kayushkin/chat-core';
import { useBridgeHarnesses } from '../../useBridgeHarnesses';
import { useBridgeInstances } from '../../useBridgeInstances';
import { useBridgeMachines } from '../../useBridgeMachines';
import { useInstanceReachable } from '../../useInstanceReachable';
import { formatCost } from '../../utils';
import { CostBreakdown } from './CostBreakdown';
import { EditableName } from './EditableName';
import { StatusDot } from './StatusDot';
import { SystemPromptModal } from './SystemPromptModal';
import { ToolsPanel } from './ToolsPanel';
import { isArchivedFolder, toBridgeSessionInfo } from './bridgeAdapters';
import { useSelectSession } from './useSelectSession';
import { ContextStrip, SessionSettingsInline, SessionSettingsPanel, } from './SessionSettings';
import styles from './Chat.module.css';
import { PANE_KEYS } from './panePersistence';
/** The top bar: everything the active session is, doing, and set to, on one row.
 *
 *  ## What changed, and why it is one bar now
 *
 *  There used to be two. This header carried identity (status, name, harness, machine,
 *  cost, permission mode, Tools, Prompt, Done, nav arrows, pane toggles) and a separate
 *  `bc-controls-bar` sat between the thread and the composer carrying model, effort,
 *  Compact and Fork. Two rows of chrome for one session, and the split was historical
 *  rather than meaningful — it came from bridge-ui's own layout, where the bar predates
 *  the header.
 *
 *  Merging them bought back a row of vertical space for the transcript, which is the only
 *  thing on this page anybody is actually reading.
 *
 *  ## What stays on the row, and what went behind the caret
 *
 *  The row carries what is worth knowing WITHOUT asking: the status dot, the session
 *  name, cost, the model picker, Compact, the view toggles, and Done. Everything else
 *  moved into the details dropdown — the harness and machine by full name, the nav
 *  arrows, the permission controls, Tools, Prompt, Fork and effort — because each is
 *  either read once or set once, and a row that shows everything shows nothing.
 *
 *  Two things deliberately survived the cull in miniature. The machine keeps its emoji
 *  and its reachability DOT, without its name: the name is what made it wide, but the dot
 *  is the only thing on screen that says the host a session is pinned to has gone away,
 *  and burying that behind a click would mean a dead session looks healthy. The harness
 *  keeps its logo for the same reason in reverse — it is already only an image, it costs
 *  16px, and it is how you tell two otherwise identical sessions apart at a glance.
 *
 *  ## The row no longer wraps
 *
 *  `.bc-header-row` is `flex-wrap: wrap` in bridge-ui's stylesheet, and every chip on it
 *  is `flex-shrink: 0` while `.bc-session-name` has no `min-width: 0`. Nothing could give,
 *  so a long name pushed the right-hand cluster onto a second line and the "one bar" was
 *  two again at any realistic width. `styles.headerRow` sets `nowrap` and `styles.headerName`
 *  makes the name the single shrinkable element, so narrowing truncates the name — the one
 *  thing on the row that survives being cut short — instead of reflowing the chrome.
 *
 *  ## The context readout is along the bottom edge
 *
 *  `ContextStrip` replaces two readouts that disagreed about where they lived: a 2px
 *  hairline that carried no numbers and a percentage baked into the Compact button's
 *  label. See the note on that component. */
export default function SessionHeader({ panesHidden, paneDrawable, togglePane, raw, setRaw, markdown, setMarkdown, settings, controls, }) {
    const { id, summary } = useActiveSession();
    // Not chat-core's bare `select`: opening a session from here also records it as its
    // instance's last session, the same as the sidebar. See `useSelectSession`.
    const select = useSelectSession();
    // A new chat that has not been sent yet has no session id, so it reaches this header
    // through the same `id === null` as "nothing selected". Without the pending record the
    // two draw identically and a freshly opened chat looks like an empty pane.
    const pending = usePendingSession();
    const { groups, effectiveState } = useSessionList();
    const { rename, archive, unarchive } = useSessionActions();
    const { instanceMap } = useBridgeInstances();
    const { machineMap } = useBridgeMachines();
    const { harnessMap, basePath } = useBridgeHarnesses();
    // Cost + context are PURE selectors (no network); info is lazily fetched once per
    // session and cached by the store.
    const { totalUsd, byModel, byQuerySource } = useSessionCost(id);
    const { tokens, limit, pct } = useContextUsage(id);
    const { info, loading: infoLoading } = useSessionInfo(id);
    // `setPermissionState` is optimistic and reverts on failure; harnessConfig carries all
    // three axes the controls read and write — the mode, the sandbox `disableNetwork` gate,
    // and the Custom mode's raw `permissionModeCustom` knobs.
    const { session: managed, setPermissionState } = useManagedSession(id);
    // The pair the cost chip measures spend against. Both fields ride on the detail read
    // above, NOT on the session summary — `spend_usd` / `max_budget_usd` are deliberately
    // absent from the chat summary wire, because a ceiling is one session's fact and the
    // sidebar query loads a hundred rows.
    //
    // ZERO MEANS NO CEILING (the convention `--max-budget-usd` and `ManagedSession` both
    // use), so an absent and a zero `maxBudgetUsd` collapse to the same answer here: no
    // ceiling, and the chip renders exactly as it did before this existed.
    const maxBudgetUsd = managed?.maxBudgetUsd ?? 0;
    const spendCeiling = maxBudgetUsd > 0
        ? { spendUSD: managed?.spendUsd ?? 0, maxBudgetUSD: maxBudgetUsd }
        : undefined;
    // What the session is doing right now, as opposed to what phase the server thinks it is
    // in. The two answer different questions: a state is a row the server writes and can
    // strand, an activity is read off the event that just arrived.
    const activity = useActivity(id);
    // Reachability for the machine dot. Resolved before the pending-pane early return
    // below, because a hook cannot be called conditionally — and because a pending chat
    // already names the instance its first message will land on, so it can say the machine
    // is gone before anything is typed.
    const chipInstanceId = summary?.instanceId ?? pending?.instanceId;
    const machineReachable = useInstanceReachable(chipInstanceId);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [promptOpen, setPromptOpen] = useState(false);
    // The details dropdown behind the caret. Closes on an outside mousedown or Escape.
    //
    // The open state holds WHICH session it was opened for, not a bare boolean, so
    // switching sessions closes it by derivation. A boolean would need an effect to reset
    // it, and that effect would leave the previous session's panel painted over the new one
    // for a frame.
    //
    // ⚠️ A pending pane has no `id`, so its key is the literal below rather than null —
    // null is the closed state, and using it would make the dropdown impossible to open
    // before the first send. That matters more than it used to: the dropdown is now where
    // the pre-start effort picker lives.
    const PENDING_DETAILS_KEY = '__pending__';
    const detailsKey = id ?? PENDING_DETAILS_KEY;
    const [detailsOpenFor, setDetailsOpenFor] = useState(null);
    const detailsOpen = detailsOpenFor !== null && detailsOpenFor === detailsKey;
    const detailsRef = useRef(null);
    useEffect(() => {
        if (!detailsOpen)
            return;
        // Closes through the setter itself rather than a wrapper: a wrapper closes over the
        // key and is rebuilt every render, which would re-subscribe these two listeners on
        // every render of an open panel.
        const onDocClick = (e) => {
            if (!detailsRef.current)
                return;
            if (!detailsRef.current.contains(e.target))
                setDetailsOpenFor(null);
        };
        const onKey = (e) => {
            if (e.key === 'Escape')
                setDetailsOpenFor(null);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [detailsOpen]);
    // Flatten the grouped list into display order for prev/next navigation. Cheap (session
    // count), never touches transcripts.
    const orderedIds = useMemo(() => {
        const out = [];
        for (const g of groups)
            for (const s of g.sessions)
                out.push(s.sessionId);
        return out;
    }, [groups]);
    const idx = id ? orderedIds.indexOf(id) : -1;
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < orderedIds.length - 1;
    const viewControls = (_jsx(ViewControls, { panesHidden: panesHidden, paneDrawable: paneDrawable, togglePane: togglePane, raw: raw, setRaw: setRaw, markdown: markdown, setMarkdown: setMarkdown }));
    const detailsToggle = (_jsx("button", { type: "button", className: styles.iconButton, onClick: () => setDetailsOpenFor(detailsOpen ? null : detailsKey), "aria-expanded": detailsOpen, "aria-label": "Session details and settings", title: "Session details and settings", children: "\u22EF" }));
    if (!id || !summary) {
        // A pending chat names the instance/harness its first message will create the session
        // on. That target is the store's, not a guess, so the header can say it before the
        // session exists — which is the whole difference between "new chat on Claude Code"
        // and a blank pane.
        const pendingInstance = pending?.instanceId ? instanceMap.get(pending.instanceId) : undefined;
        const pendingMachine = pendingInstance?.machine ??
            (pendingInstance ? machineMap.get(pendingInstance.machine_id) : undefined);
        const pendingHarness = pending?.harness ?? pendingInstance?.harness_type;
        const pendingHarnessInfo = pendingHarness ? harnessMap.get(pendingHarness) : undefined;
        return (_jsx("div", { className: "bc-header", "data-harness": pendingHarness || undefined, children: _jsxs("div", { className: `bc-header-row ${styles.headerRow}`, children: [_jsx(StatusDot, { state: "placeholder", title: pending ? 'New chat — not started' : 'No session' }), pendingHarness && (_jsx(HarnessMark, { harness: pendingHarness, info: pendingHarnessInfo, basePath: basePath })), pendingMachine && _jsx(MachineMark, { machine: pendingMachine, reachable: machineReachable }), pending ? (_jsxs("span", { className: `bc-session-name ${styles.headerName}`, children: ["New chat", pendingInstance ? ` — ${pendingInstance.name}` : ''] })) : (_jsx("span", { className: `bc-session-name bc-session-name-empty ${styles.headerName}`, children: "\u2014" })), _jsxs("div", { className: `bc-header-right ${styles.headerCluster}`, children: [_jsx(SessionSettingsInline, { settings: settings, controls: controls }), _jsx("div", { className: styles.headerDivider }), viewControls, _jsx("div", { className: styles.headerDivider }), _jsxs("div", { className: "bc-details-wrap", ref: detailsRef, children: [detailsToggle, detailsOpen && (_jsxs("div", { className: styles.detailsPanel, role: "dialog", "aria-label": "Session details", children: [_jsx(SessionSettingsPanel, { settings: settings, controls: controls }), pendingMachine && (_jsxs("div", { className: styles.detailsSection, children: [_jsx("span", { className: styles.detailsSectionLabel, children: "Target" }), _jsx(MachineChip, { machine: pendingMachine, reachable: machineReachable })] }))] }))] })] })] }) }));
    }
    const instance = summary.instanceId ? instanceMap.get(summary.instanceId) : undefined;
    const machine = instance?.machine ?? (instance ? machineMap.get(instance.machine_id) : undefined);
    const state = effectiveState(id);
    // The status dot is the only thing on this header that says what the session is doing,
    // and on its own it cannot tell a turn that has been on one tool for four minutes from
    // one that has just started. The activity rides in the dot's own label.
    //
    // NOT gated on `state`: bridge-ui gates its suffix on four session states of which three
    // are emitted zero times, which is why its own suffix has never rendered. An activity
    // that is not idle is itself the evidence that work is happening.
    const activityLabel = activity.kind === 'idle'
        ? ''
        : activity.kind === 'tool'
            ? activity.name || 'tool'
            : activity.kind;
    const stateTitle = activityLabel ? `${state} · ${activityLabel}` : state;
    const isArchived = isArchivedFolder(summary.folderName);
    // Server-registered harness metadata drives the header's logo image and its warm
    // harness-keyed tint (the `--bc-harness` var + `data-harness` attr the bc-header
    // gradient reads). Falls through to the theme accent when the harness isn't registered
    // or has no tint — never a hardcoded color.
    const harnessInfo = harnessMap.get(summary.harness);
    const headerStyle = harnessInfo?.tint
        ? { ['--bc-harness']: harnessInfo.tint }
        : undefined;
    return (_jsxs("div", { className: "bc-header", style: headerStyle, "data-harness": summary.harness || undefined, children: [_jsxs("div", { className: `bc-header-row ${styles.headerRow}`, children: [_jsx(StatusDot, { state: state, title: stateTitle }), summary.harness && (_jsx(HarnessMark, { harness: summary.harness, info: harnessInfo, basePath: basePath })), machine && _jsx(MachineMark, { machine: machine, reachable: machineReachable }), _jsx(EditableName, { value: summary.displayName || summary.sessionId, onSave: (next) => rename(id, next), className: `bc-session-name ${styles.headerName}` }), (totalUsd > 0 || spendCeiling) && (_jsx(CostBreakdown, { aggregate: { totalUsd, byModel, bySource: byQuerySource }, ceiling: spendCeiling })), _jsxs("div", { className: `bc-header-right ${styles.headerCluster}`, children: [_jsx(SessionSettingsInline, { settings: settings, controls: controls }), _jsx("div", { className: styles.headerDivider }), viewControls, _jsx("div", { className: styles.headerDivider }), _jsx("button", { className: `${styles.iconButton} ${styles.iconButtonDone}`, onClick: () => (isArchived ? unarchive(id) : archive(id)), "aria-pressed": isArchived, "aria-label": isArchived ? 'Reopen (unarchive)' : 'Mark done (archive)', title: isArchived ? 'Reopen (unarchive)' : 'Mark done (archive)', children: isArchived ? '↺' : '✓' }), _jsxs("div", { className: "bc-details-wrap", ref: detailsRef, children: [detailsToggle, detailsOpen && (_jsxs("div", { className: styles.detailsPanel, role: "dialog", "aria-label": "Session details", children: [_jsxs("div", { className: styles.detailsSection, children: [_jsx("span", { className: styles.detailsSectionLabel, children: "Navigate" }), _jsxs("div", { className: "bc-nav-arrows", children: [_jsx("button", { className: "bc-nav-arrow", disabled: !hasPrev, title: "Previous session", "aria-label": "Previous session", onClick: () => hasPrev && select(orderedIds[idx - 1]), children: "\u2039" }), _jsx("button", { className: "bc-nav-arrow", disabled: !hasNext, title: "Next session", "aria-label": "Next session", onClick: () => hasNext && select(orderedIds[idx + 1]), children: "\u203A" })] }), machine && _jsx(MachineChip, { machine: machine, reachable: machineReachable })] }), managed?.harnessConfig?.permissionMode !== undefined && (_jsxs("div", { className: styles.detailsSection, children: [_jsx("span", { className: styles.detailsSectionLabel, children: "Permissions" }), _jsx(PermissionControls, { harness: summary.harness, mode: managed.harnessConfig.permissionMode, disableNetwork: managed.harnessConfig.disableNetwork === true, custom: managed.harnessConfig.permissionModeCustom, supportedModes: harnessInfo?.supported_permission_modes, supportsDisableNetwork: harnessInfo?.supports_disable_network === true, onChange: (next) => 
                                                        // Optimistic in the hook; it reverts + rethrows on failure. Swallow
                                                        // the rejection here so a failed PUT doesn't become an unhandled
                                                        // rejection — the revert already makes the failure visible. The
                                                        // promise is RETURNED, not dropped: it is what holds the controls
                                                        // disabled for the duration of the write.
                                                        setPermissionState(next).catch(() => { }) })] })), _jsx(SessionSettingsPanel, { settings: settings, controls: controls }), _jsxs("div", { className: styles.detailsSection, children: [_jsx("span", { className: styles.detailsSectionLabel, children: "Inspect" }), _jsx("button", { className: `bc-ctrl-btn ${toolsOpen ? 'bc-ctrl-btn-active' : ''}`, onClick: () => setToolsOpen((v) => !v), "aria-pressed": toolsOpen, title: "Tools, slash commands, sub-agents, skills & MCP servers for this session", children: "\uD83E\uDDF0 Tools" }), _jsx("button", { className: "bc-ctrl-btn", onClick: () => setPromptOpen(true), disabled: !info, title: info
                                                            ? "View this session's system prompt, model & working directory"
                                                            : 'No session info reported yet', children: "\uD83D\uDCC4 Prompt" })] }), _jsx(SessionDetailsPanel, { summary: summary, detail: managed })] }))] })] })] }), toolsOpen && (_jsx("div", { className: styles.toolsDrawer, children: infoLoading ? (_jsx("div", { className: styles.toolsLoading, children: "Loading session tools\u2026" })) : info ? (_jsx(ToolsPanel, { info: toBridgeSessionInfo(info) })) : (_jsx("div", { className: styles.toolsLoading, children: "No tool info reported yet. The harness emits this after its first init." })) })), _jsx(ContextStrip, { tokens: tokens, limit: limit, pct: pct }), promptOpen && info && (_jsx(SystemPromptModal, { info: toBridgeSessionInfo(info), onClose: () => setPromptOpen(false) }))] }));
}
/** The harness logo on the top bar — image, else emoji, else the short name.
 *
 *  bridge-ui's `bc-harness-chip` already renders image-only when the registry has an
 *  image, which is true for the harnesses in daily use. This keeps that class (and so the
 *  harness tint) but never renders the text label beside it: the label is what made the
 *  chip wide, and the logo alone already answers "which harness is this". The full label
 *  stays on the title. */
function HarnessMark({ harness, info, basePath, }) {
    const label = info?.label || harness;
    return (_jsx("span", { className: "bc-harness-chip", title: label, "aria-label": label, children: info?.image ? (_jsx("img", { className: "bc-harness-chip-img", src: `${basePath}${info.image}`, alt: "" })) : info?.emoji ? (_jsx("span", { className: "bc-harness-chip-emoji", "aria-hidden": true, children: info.emoji })) : (_jsx("span", { className: "bc-harness-chip-label", children: label })) }));
}
/** The machine on the top bar, reduced to its emoji and its reachability dot.
 *
 *  The NAME is what moved into the dropdown — it is the widest thing the old chip carried
 *  and the least often needed. The dot did not move, and that is the whole point of this
 *  component existing rather than the chip simply being deleted: it is the only thing on
 *  screen that says the host a session is pinned to has gone away, and a session on a dead
 *  machine that looks exactly like a healthy one is the failure this dot was added to
 *  prevent.
 *
 *  `reachable === null` means unknown — no answer yet, or the status read failed — and is
 *  drawn as its own state rather than folded into "unreachable", because "I could not ask"
 *  and "I asked and it is down" are different facts. */
function MachineMark({ machine, reachable }) {
    return (_jsxs("span", { className: "bc-machine-chip", title: machineTitle(machine, reachable), children: [_jsx("span", { className: "bc-machine-chip-emoji", "aria-hidden": true, children: machine.emoji || '🖥' }), _jsx("span", { className: `bc-machine-chip-dot ${reachableClass(reachable)}`, "aria-hidden": true })] }));
}
/** The full machine chip — emoji, NAME, dot — as shown inside the details dropdown. */
function MachineChip({ machine, reachable }) {
    return (_jsxs("span", { className: "bc-machine-chip", title: machineTitle(machine, reachable), children: [_jsx("span", { className: "bc-machine-chip-emoji", "aria-hidden": true, children: machine.emoji || '🖥' }), _jsx("span", { className: "bc-machine-chip-label", children: machine.name }), _jsx("span", { className: `bc-machine-chip-dot ${reachableClass(reachable)}`, "aria-hidden": true })] }));
}
function reachableClass(reachable) {
    if (reachable === null)
        return 'bc-machine-chip-dot-unknown';
    return reachable ? 'bc-machine-chip-dot-ok' : 'bc-machine-chip-dot-fail';
}
function machineTitle(machine, reachable) {
    return [
        `${machine.name}${machine.hostname ? ` (${machine.hostname})` : ''}`,
        `transport: ${machine.transport}`,
        reachable === null ? 'reachability unknown' : reachable ? 'reachable' : 'unreachable',
    ].join('\n');
}
/** Every field the gateway holds about this session, in bridge-ui's SessionDetailsPanel
 *  DOM (`bc-details-list` / `bc-details-row` / `bc-details-mono`) so it inherits the
 *  shared stylesheet.
 *
 *  It reads TWO records, and that split is the point of the whole feature. The sidebar row
 *  (`SessionSummary`) carries the twelve fields the list query returns; the other nine come
 *  from `GET /sessions/{id}`, which chat-core already fetched and cached before this panel
 *  existed. Nothing here widens the list query — a detail is one session at a time, a list
 *  is all of them.
 *
 *  `detail` is null until that lazy fetch lands, so its nine rows read "…" for a moment and
 *  then fill in. That is deliberately distinct from "—": one says the answer has not
 *  arrived, the other says the server holds no value. */
function SessionDetailsPanel({ summary, detail, }) {
    const text = (v) => (v && v.length ? v : '—');
    // A field the detail read has not returned yet is unknown, not empty.
    const pending = (v) => (detail ? text(v) : '…');
    const date = (v) => {
        if (!v)
            return '—';
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
    };
    const rows = [
        ['type', text(summary.type)],
        ['purpose', text(summary.purpose)],
        ['origin', pending(detail?.origin)],
        ['folder', text(summary.folderName)],
        ['state', text(summary.state)],
        ['mode', summary.mode || 'events'],
        ['harness', text(summary.harness)],
        ['agent', text(summary.agentId)],
        ['instance', text(summary.instanceId), true],
        ['working dir', pending(detail?.workingDir), true],
        ['session id', text(summary.sessionId), true],
        ['harness session', pending(detail?.harnessSessionId), true],
        // Named for the id it actually holds. The server's own field is `parent_id` and its
        // doc comment says it is neither a session id nor a general parent — it is the fork
        // parent's HARNESS id, fed to `--fork`. Labelling it "parent" beside a row called
        // "session id" invites reading one as the other.
        ['fork parent (harness id)', pending(detail?.forkParentHarnessSessionId), true],
        ['forked from', pending(detail?.forkedFromSessionId), true],
        ['spawned by', pending(detail?.managerSessionId), true],
        ['pid', detail ? (detail.pid ? String(detail.pid) : '—') : '…'],
        // Both money rows read "—" when the field is absent, never "$0.00". A server that
        // predates the spend gate reports no spend at all, and a ceiling of ZERO MEANS NO
        // CEILING — printing a dollar figure for either would invent a measurement.
        ['spend', detail ? (detail.spendUsd === undefined ? '—' : formatCost(detail.spendUsd)) : '…'],
        [
            'ceiling',
            detail ? ((detail.maxBudgetUsd ?? 0) > 0 ? formatCost(detail.maxBudgetUsd) : '—') : '…',
        ],
        ['created', date(summary.createdAt)],
        ['updated', date(summary.updatedAt)],
    ];
    return (_jsx("dl", { className: "bc-details-list", children: rows.map(([label, value, mono]) => (_jsxs("div", { className: "bc-details-row", children: [_jsx("dt", { children: label }), _jsx("dd", { className: mono ? 'bc-details-mono' : undefined, title: value, children: value })] }, label))) }));
}
/** Canonical permission-mode ordering, mirroring bridge-ui's SessionPermissionMode
 *  (MODE_ORDER) — restrictive → permissive, with the Custom escape hatch last. It orders
 *  the dropdown; it does not decide what goes in it. Which modes a session may actually
 *  take comes from the harness (`supported_permission_modes`), and a mode the harness adds
 *  but this list has not heard of is appended rather than dropped, so a server-side
 *  addition renders without a UI change. */
const PERM_MODE_ORDER = [
    'block_all',
    'plan',
    'read',
    'ask_all',
    'ask',
    'auto',
    'bypass',
    'custom',
];
const PERM_MODE_LABELS = {
    block_all: 'Block All',
    plan: 'Plan',
    read: 'Read',
    ask_all: 'Ask All',
    ask: 'Rules',
    auto: 'Auto Rules',
    bypass: 'Allow All',
    custom: 'Custom…',
};
/** One sentence per mode, from bridge-ui's MODE_TITLES. A permission mode is the one
 *  control here that decides what an agent is allowed to do to the machine, and its label
 *  alone does not say — "Auto Rules" and "Rules" are indistinguishable from four words of
 *  UI. */
const PERM_MODE_TITLES = {
    block_all: 'Deny every tool call. Agent sees the deny and can keep reasoning or ask you.',
    plan: 'Only planning tools (Read / Glob / Grep / TodoWrite). No writes, no shell.',
    read: 'Read-only inspection (Read / Glob / Grep / LS / NotebookRead). No writes, no shell.',
    ask_all: 'Skip rules and prompt on every single tool call.',
    ask: 'Default. Use permission rules; prompt only when a rule says ask or no rule matches.',
    auto: 'Auto-allow safe tools (reads + edits + planning); rules for shell / fetch / agent spawns.',
    bypass: 'Allow every tool call. AskUserQuestion still pauses for your answer.',
    custom: 'Raw harness-specific approval / sandbox knobs (advanced).',
};
/** Draw a separator before Custom so the power-user escape hatch reads as apart from the
 *  everyday modes. `<select>` has no real separator element, so it is a disabled option —
 *  every browser honours the disabled state. */
const PERM_MODE_DIVIDER_BEFORE = new Set(['custom']);
/** When a harness advertises no modes at all, offer only the two every harness in the
 *  registry implements. Offering all eight instead would be inventing a capability claim
 *  the harness never made. Same fallback as bridge-ui's SessionPermissionMode. */
const PERM_MODE_UNADVERTISED_FALLBACK = ['ask', 'bypass'];
/** The modes this harness will actually honour, in canonical order.
 *
 *  Offering a mode the harness does not implement is not harmless — the select shows the
 *  user a setting that silently does nothing on the next spawn, and for a permission
 *  control the failure direction is "I chose Block All and it did not block". Only `codex`
 *  advertises `custom`, and only `claude_code` and `codex` advertise `auto`. */
function supportedPermissionModes(supported, current) {
    const advertised = supported && supported.length > 0 ? supported : PERM_MODE_UNADVERTISED_FALLBACK;
    const known = PERM_MODE_ORDER.filter((m) => advertised.includes(m));
    const extras = advertised.filter((m) => !PERM_MODE_ORDER.includes(m));
    const ordered = [...known, ...extras];
    // The session's own mode always stays selectable, even when the harness no longer
    // advertises it — a `<select>` whose value is absent from its options renders blank,
    // which would report the wrong permission mode rather than an unexpected one.
    return ordered.includes(current) ? ordered : [current, ...ordered];
}
/** Which harnesses' Custom mode exposes which raw knobs, keyed by harness name and
 *  mirroring bridge-ui's CUSTOM_PANEL_SCHEMAS. `custom` means "the harness has its own
 *  approval/sandbox vocabulary", and that vocabulary is per-harness — there is no generic
 *  set of values to fall back on, so a harness absent from this map gets no panel even when
 *  it advertises `custom`. Offering it empty selects, or codex's values under another
 *  harness's name, would be inventing a capability claim.
 *
 *  Only `codex` advertises `custom` in the live registry today. */
const PERM_CUSTOM_PANEL_SCHEMAS = {
    codex: {
        approvalOptions: [
            { value: 'untrusted', label: 'untrusted (escalate on mutation)' },
            { value: 'on-request', label: 'on-request (model decides)' },
            { value: 'never', label: 'never (no codex prompts)' },
        ],
        sandboxOptions: [
            { value: 'read-only', label: 'read-only' },
            { value: 'workspace-write', label: 'workspace-write' },
            { value: 'danger-full-access', label: 'danger-full-access' },
        ],
    },
};
/** Permission controls: the mode select, the sandbox "No network" checkbox, and — in
 *  Custom mode — the harness's raw approval/sandbox knobs. Three affordances, but ONE
 *  persisted state: every change sends all three axes in a single PUT, so a pair of edits
 *  in the same React batch cannot land as two writes where the first is lost.
 *
 *  There is no local mirror of the values. `onChange` patches the store optimistically and
 *  reverts the whole detail on a failed PUT, so the props ARE the optimistic state; a
 *  `useState` copy would be a second source of truth that a revert could not reach. `busy`
 *  only serializes the writes — a second change while one is in flight would snapshot the
 *  first's optimistic value as the thing to revert to. */
function PermissionControls({ harness, mode, disableNetwork, custom, supportedModes, supportsDisableNetwork, onChange, }) {
    const options = useMemo(() => supportedPermissionModes(supportedModes, mode), [supportedModes, mode]);
    const [busy, setBusy] = useState(false);
    const approval = custom?.approval ?? '';
    const sandbox = custom?.sandbox ?? '';
    const customSchema = PERM_CUSTOM_PANEL_SCHEMAS[harness];
    // Send every axis, always — including the ones this change did not touch — so the server
    // never has to merge two half-states. The network gate goes only when the harness
    // supports it: for the other eighteen harnesses the key is not ours to write, and an
    // explicit false would DELETE a value some other path may have set.
    const write = async (next) => {
        if (busy)
            return;
        const state = {
            mode: next.mode ?? mode,
            ...(supportsDisableNetwork ? { disableNetwork: next.disableNetwork ?? disableNetwork } : {}),
        };
        // The custom knobs ride along only in Custom mode. Leaving them out on the way to
        // another mode means the server keeps them, so switching to Auto and back does not
        // silently reset a user's approval policy to the default.
        if (state.mode === 'custom') {
            state.permissionModeCustom = {
                approval: next.permissionModeCustom?.approval ?? approval,
                sandbox: next.permissionModeCustom?.sandbox ?? sandbox,
            };
        }
        setBusy(true);
        try {
            await onChange(state);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: styles.permissionControls, children: [_jsx("select", { className: "bc-ctrl-select", value: mode, disabled: busy, onChange: (e) => void write({ mode: e.target.value }), "aria-label": "Permission mode", title: [
                    `Permission mode: ${mode}${disableNetwork ? ' · network disabled' : ''}`,
                    PERM_MODE_TITLES[mode],
                ]
                    .filter(Boolean)
                    .join('\n'), children: options.flatMap((m, i) => {
                    const option = (_jsxs("option", { value: m, title: PERM_MODE_TITLES[m] ?? '', children: ["\uD83D\uDD12 ", PERM_MODE_LABELS[m] ?? m, disableNetwork ? ' ⛔' : ''] }, m));
                    return PERM_MODE_DIVIDER_BEFORE.has(m) && i > 0
                        ? [
                            _jsx("option", { disabled: true, value: "", children: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" }, `__sep_${m}`),
                            option,
                        ]
                        : [option];
                }) }), supportsDisableNetwork && (_jsxs("label", { className: styles.permissionNetwork, title: "Block outbound network access at the sandbox layer. Takes effect on the next session spawn.", children: [_jsx("input", { type: "checkbox", checked: disableNetwork, disabled: busy, onChange: (e) => void write({ disableNetwork: e.target.checked }), "aria-label": "Disable network access" }), _jsx("span", { children: "No network" })] })), mode === 'custom' && customSchema && (_jsxs("div", { className: styles.permissionCustom, title: "Raw harness-specific approval and sandbox knobs.", children: [_jsxs("select", { className: "bc-ctrl-select", value: approval, disabled: busy, onChange: (e) => void write({ permissionModeCustom: { approval: e.target.value } }), "aria-label": "Custom approval policy", children: [_jsx("option", { value: "", children: "(default)" }), customSchema.approvalOptions.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value)))] }), _jsxs("select", { className: "bc-ctrl-select", value: sandbox, disabled: busy, onChange: (e) => void write({ permissionModeCustom: { sandbox: e.target.value } }), "aria-label": "Custom sandbox mode", children: [_jsx("option", { value: "", children: "(default)" }), customSchema.sandboxOptions.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value)))] })] }))] }));
}
/** What each pane's icon is and what it is for. A table rather than branches inside the
 *  map, because the set is closed (`PANE_KEYS`) and TypeScript then refuses a pane added
 *  without an entry for it. */
const PANE_PILLS = {
    turns: {
        label: 'Turns',
        icon: '📋',
        title: 'The conversation — one row per message',
    },
    timeline: {
        label: 'Timeline',
        icon: '⏱',
        title: 'Timeline — event-granular, turn → task grouped',
    },
    kanban: {
        label: 'Cards',
        icon: '🗂',
        title: 'The kanban cards linked to this session',
    },
    git: {
        label: 'Git',
        icon: '🌿',
        title: 'The working tree — branch, status, staged and unstaged diffs',
    },
    attach: {
        label: 'Terminal',
        icon: '⌨',
        title: 'The session terminal — pty mode only',
    },
};
/** The view controls: which panes are on screen, then the two modifiers that apply to the
 *  Turns pane. All four are icon-only now — they are the controls a person recognises by
 *  position rather than by reading, and the row they sit on has eight other things on it.
 *
 *  ⚠️ EVERY button here carries an `aria-label`, and that is load-bearing rather than
 *  decorative. Dropping the text means the glyph is the only visible name, and a glyph is
 *  not an accessible name — without the label these become unreachable to a screen reader
 *  AND to the e2e specs, which locate them by role + accessible name precisely because
 *  that is what a user reaches for. Raw in particular had NO aria-label while it had a
 *  text node to fall back on; it needs one now.
 *
 *  Raw is disabled while the Turns pane is hidden rather than removed: a control that
 *  vanishes when a pane closes and reappears somewhere in a row of icons is harder to find
 *  again than one that greys out where it was.
 *
 *  ⚠️ MD/TXT is NOT disabled with it, and the two are not the same kind of control. Raw is
 *  a mode of one pane and is forgotten on reload; markdown is a durable global preference
 *  (`threadPersistence.ts`) that outlives the session it is set in. Greying it out because
 *  a pane is closed would refuse a choice the user is entitled to make about every pane
 *  they open next.
 *
 *  Markdown keeps its `bc-turns-md-toggle` class alongside the icon styling: it is the one
 *  control here whose state is a WORD rather than a glyph, because "is this rendering
 *  markdown" has no icon that reads unambiguously, and MD/TXT already did. */
function ViewControls({ panesHidden, togglePane, raw, setRaw, markdown, setMarkdown, paneDrawable, }) {
    const turnsHidden = panesHidden.turns;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-pane-toggles", role: "group", "aria-label": "Pane visibility", children: PANE_KEYS.filter(
                // A pill for a pane this session cannot draw is a control that does nothing.
                // Absent rather than disabled, because "your session is not in pty mode" is not
                // something a greyed-out glyph can say, and the row already carries nine other
                // controls — a permanently dead tenth on every events session is worse than one
                // that appears when it means something. bridge-ui hides it on the same test
                // (`Workspace.tsx:479`, `attachAvailable`).
                (key) => key !== 'attach' || paneDrawable.attach === true).map((key) => {
                    const visible = !panesHidden[key];
                    const pill = PANE_PILLS[key];
                    return (_jsx("button", { className: styles.iconButton, onClick: () => togglePane(key), "aria-pressed": visible, "aria-label": pill.label, title: `${visible ? 'Hide' : 'Show'} ${pill.label.toLowerCase()} — ${pill.title}`, children: _jsx("span", { "aria-hidden": true, children: pill.icon }) }, key));
                }) }), _jsx("button", { className: styles.iconButton, onClick: () => setRaw(!raw), "aria-pressed": raw, "aria-label": "Raw", disabled: turnsHidden, title: turnsHidden
                    ? 'Raw needs the Turns pane — show it first'
                    : raw
                        ? 'Raw view — every entry incl. duplicates, with source + eventId. Click for the collapsed view'
                        : 'Collapsed view — duplicates hidden, sources badge per message. Click for raw', children: _jsx("span", { "aria-hidden": true, children: "\uD83D\uDC41" }) }), _jsx("button", { className: `bc-turns-md-toggle ${styles.iconButton}`, onClick: () => setMarkdown(!markdown), "aria-pressed": markdown, "aria-label": markdown ? 'Rendering markdown' : 'Rendering plain text', title: markdown ? 'Rendering markdown — click for plain text' : 'Plain text — click for markdown', children: markdown ? 'MD' : 'TXT' })] }));
}
//# sourceMappingURL=SessionHeader.js.map