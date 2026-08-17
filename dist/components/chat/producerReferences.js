import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { RefChip, SignalRequestList, SIGNAL_KIND_QUESTION, parseRefChips, remarkRefChips, useOpenSignals, } from '@kayushkin/chat-core';
import { useBridgeConfig } from '../../context';
// How producer (orchestrator) text gets its `[session:…]` / `[todo:…]` /
// `[note:…]` / `[task:…]` references rendered.
//
// The GRAMMAR lives in exactly one place for every surface here:
// `@kayushkin/chat-core`'s `parseRefChips` / `remarkRefChips`, which understand
// the producer's bracket dialect natively — each token matches whole, brackets
// consumed, and `[task:…]` resolves as kind `todo` because a kanban card id IS
// a noteboard item id. Two hand-rolled `\[(session|task|todo):([^\]]+)\]`
// copies used to live in this package (the orchestrator page's and this pane's)
// and they had already drifted from each other; both are gone.
//
// ⚠️ The PRESENTATION is not one thing, and the split is a hard constraint
// rather than a preference. `RefChip` and `useOpenSignals` are chat-core hooks:
// they read `ChatProvider`'s context and THROW ("chat-core hooks must be used
// inside <ChatProvider>") when there is none above them. `BridgeChat` — the
// only host that mounts `OrchestratorPanel` — supplies `BridgeProvider` and no
// `ChatProvider`, so a chip rendered in that pane would take the whole chat page
// down the first time the producer wrote a session id, which it does on every
// run. So:
//
//   - a surface INSIDE a `ChatProvider` (the `BridgeOrchestrator` page, which
//     documents that requirement) renders chips, with the detail panel and the
//     answer-in-place signal cards that come with them;
//   - a surface that cannot promise one renders routes-aware links instead, and
//     a plain span when the host mounts no such page.
//
// Both read the same segments from the same parser, so the two presentations
// can never disagree about what IS a reference.
/** Where a reference points on THIS host. Every path comes from the consumer's
 *  `routes`, never from a literal: the same surface runs in a host that mounts
 *  chat at `/` and in one that mounts it at `/bridge`. An empty route means the
 *  host has no such page, and the caller renders plain text rather than a link
 *  to somewhere that does not exist. */
function referenceHref(routes, kind, refId) {
    if (kind === 'session') {
        return routes.chat ? `${routes.chat}?session=${encodeURIComponent(refId)}` : '';
    }
    // note / todo — one noteboard id space, one host page. `task` never reaches
    // here: the parser has already resolved it to `todo`.
    return routes.notes;
}
/** Open a referenced session on the host's chat page, or nothing at all when the
 *  host mounts no chat route. Null (rather than a no-op function) is what lets a
 *  chip fall back to its own detail panel instead of announcing itself as a
 *  button that goes nowhere — see `RefChipProps.onActivate`. */
function useOpenReferencedSession() {
    const { routes } = useBridgeConfig();
    const navigate = useNavigate();
    const chatRoute = routes.chat;
    const open = useCallback((_kind, refId) => {
        navigate(`${chatRoute}?session=${encodeURIComponent(refId)}`);
    }, [navigate, chatRoute]);
    return chatRoute ? open : undefined;
}
/** One reference, as a chip. Sessions may expand inline; everything else is
 *  chat-core's chip unchanged. */
function ProducerReferenceChip({ expandSessionsWithOpenQuestions, onOpenSession, ...chipProps }) {
    const kind = String(chipProps.kind ?? 'session');
    const refId = String(chipProps.refId ?? chipProps.refid ?? '');
    // The expanding variant reads the session's open signals, so it is mounted
    // ONLY when expansion is on: a page that does not expand must not put a
    // /signals request on the wire for every id the producer happened to mention.
    if (kind !== 'session' || refId === '' || !expandSessionsWithOpenQuestions) {
        return _jsx(RefChip, { ...chipProps, onActivate: onOpenSession });
    }
    return _jsx(SessionReferenceWithOpenQuestions, { refId: refId, onOpenSession: onOpenSession });
}
/**
 * A referenced session that is waiting on a human, shown already open.
 *
 * A collapsed chip hides the one thing that matters about such a session — that
 * it is blocked on a question only a person can answer — behind a click. On a
 * surface whose whole job is "what is the fleet doing", that question should be
 * on screen and answerable where it is named.
 *
 * It expands INLINE rather than by opening the chip's panel, and that is the
 * point rather than an implementation detail: the panel is a portal onto
 * `document.body`, positioned against the chip's rect, and opening several at
 * once stacks them at overlapping coordinates, each stealing the others'
 * screen space and pointer events. An inline card takes its own room in the
 * flow, so ten of them read as ten cards.
 *
 * Sessions with nothing open stay ordinary collapsed chips — this renders the
 * chip alone, with no wrapper and no empty box.
 */
function SessionReferenceWithOpenQuestions({ refId, onOpenSession, }) {
    const { requests, reload } = useOpenSignals(refId);
    // QUESTIONS only. A notification is something the session said, not something
    // it is waiting on, and expanding for one would put a card in the reader's way
    // for every routine "done" the producer mentions. The whole request GROUP is
    // rendered once it qualifies, because the group is the unit that gets
    // answered — dropping a notification out of a mixed group would ask half a
    // question.
    const openQuestionRequests = useMemo(() => requests.filter((r) => r.signals.some((s) => s.kind === SIGNAL_KIND_QUESTION)), [requests]);
    const chip = _jsx(RefChip, { kind: "session", refId: refId, onActivate: onOpenSession });
    if (openQuestionRequests.length === 0)
        return chip;
    return (_jsxs("span", { className: "bc-producer-ref-expanded", "data-ref-kind": "session", "data-ref-id": refId, children: [chip, _jsx(SignalRequestList, { requests: openQuestionRequests, compact: true, onResolved: reload })] }));
}
// remark-gfm's presence is load-bearing, not decoration: `remarkRefChips` skips
// `link` subtrees so a linkified id keeps its address, and only gfm's
// autolink-literal extension makes a bare pasted URL a `link` node. Without it a
// session id sitting in a URL's query string is cut out of the middle of the
// address into a chip.
const REMARK_PLUGINS = [remarkGfm, remarkRefChips];
/**
 * Producer prose as markdown, with every reference rendered as a chat-core chip.
 *
 * ⚠️ Must be mounted inside chat-core's `<ChatProvider>` — the chips resolve
 * their ids against llm-bridge and noteboard through its context, and its hooks
 * throw without it.
 */
export function ProducerMarkdown({ text, expandSessionsWithOpenQuestions = false, className, }) {
    const onOpenSession = useOpenReferencedSession();
    const components = useMemo(() => ({
        'ref-chip': (props) => (_jsx(ProducerReferenceChip, { ...props, onOpenSession: onOpenSession, expandSessionsWithOpenQuestions: expandSessionsWithOpenQuestions })),
    }), [onOpenSession, expandSessionsWithOpenQuestions]);
    // `bc-turns-md` by default, and not for want of a name of its own: it is the
    // markdown normalization this package's stylesheet already ships (first/last
    // child margins, list indents, code and table rules), and producer prose is
    // the same prose. A private class would have meant either shipping CSS from a
    // component or leaving every host to re-derive those rules.
    return (_jsx("div", { className: className ?? 'bc-producer-md bc-turns-md', children: _jsx(ReactMarkdown, { remarkPlugins: REMARK_PLUGINS, components: components, children: text }) }));
}
/**
 * Producer text kept VERBATIM, with its references as chat-core chips.
 *
 * For the injected-context dump, which is a payload rather than prose: its
 * indentation, blank lines and bullet glyphs are what the model will actually
 * be handed, so it is parsed with `parseRefChips` (the same matcher, no
 * markdown) and every character between the references survives to the DOM.
 * Renders inline, so the caller decides the block — a `<pre>`, usually.
 *
 * ⚠️ Same `<ChatProvider>` requirement as {@link ProducerMarkdown}.
 */
export function ProducerTextWithReferenceChips({ text }) {
    const onOpenSession = useOpenReferencedSession();
    const segments = useMemo(() => parseRefChips(text), [text]);
    return (_jsx(_Fragment, { children: segments.map((segment, i) => segment.type === 'text' ? (_jsx("span", { children: segment.value }, i)) : (_jsx(RefChip, { kind: segment.kind, refId: segment.refId, onActivate: segment.kind === 'session' ? onOpenSession : undefined }, i))) }));
}
// ---------------------------------------------------------------------------
// Links (no chat-core provider required)
// ---------------------------------------------------------------------------
/**
 * Producer text kept verbatim, with its references as routes-aware links.
 *
 * The presentation for a surface that cannot promise a `ChatProvider` above it
 * (see this file's header). A reference whose target page this host does not
 * mount renders as a plain span, never as a link to a route that would 404 or
 * silently reload the current page.
 */
export function ProducerTextWithReferenceLinks({ text }) {
    const { routes } = useBridgeConfig();
    const segments = useMemo(() => parseRefChips(text), [text]);
    return (_jsx(_Fragment, { children: segments.map((segment, i) => {
            if (segment.type === 'text')
                return _jsx("span", { children: segment.value }, i);
            const href = referenceHref(routes, segment.kind, segment.refId);
            return href ? (_jsx("a", { className: "bc-producer-ref-link", href: href, "data-ref-kind": segment.kind, "data-ref-id": segment.refId, style: { color: 'var(--accent,#818cf8)' }, children: segment.refId }, i)) : (_jsx("span", { className: "bc-producer-ref-plain", "data-ref-kind": segment.kind, "data-ref-id": segment.refId, children: segment.refId }, i));
        }) }));
}
//# sourceMappingURL=producerReferences.js.map