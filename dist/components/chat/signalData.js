import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../../context';
import { SignalStateOpen, SignalSurfaceChat } from '../../types';
async function getSignals(fetchFn, url) {
    const res = await fetchFn(url);
    if (res.status === 404)
        return null;
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (!Array.isArray(body))
        throw new Error('signals response was not an array');
    return body;
}
/** Open chat-surface signals, newest first. Pass a sessionId to scope to one
 * session; omit it for the cross-session inbox. */
export function fetchOpenChatSignals(fetchFn, basePath, sessionId, limit) {
    const params = new URLSearchParams({ state: SignalStateOpen, surface: SignalSurfaceChat });
    if (sessionId)
        params.set('session_id', sessionId);
    if (limit)
        params.set('limit', String(limit));
    return getSignals(fetchFn, `${basePath}/signals?${params.toString()}`);
}
/** Every open signal that propagates to a noteboard todo, keyed by todo id.
 *
 * One request for a whole board, not one per card. The open set is small by
 * construction — at most one derived row per session, plus whatever tool asks
 * are parked right now — so asking per card would be N requests for a list the
 * server can hand over whole.
 *
 * Surface is deliberately not filtered. A todo is worked by chat sessions and
 * by autonomous workers alike, and the badge answers "does this piece of work
 * need me?", which is true of a signal on either surface. */
export async function fetchOpenSignalsByTodo(fetchFn, basePath) {
    const params = new URLSearchParams({ state: SignalStateOpen });
    const signals = await getSignals(fetchFn, `${basePath}/signals?${params.toString()}`);
    if (signals === null)
        return null;
    const byTodo = new Map();
    for (const signal of signals) {
        const todoID = signal.linked_todo_id;
        // An unlinked signal belongs to no todo. It is not a signal on "the todo
        // with an empty id".
        if (!todoID)
            continue;
        const existing = byTodo.get(todoID);
        if (existing)
            existing.push(signal);
        else
            byTodo.set(todoID, [signal]);
    }
    return byTodo;
}
/** Open signals against exactly one todo — the query a single-todo view makes.
 *
 * Narrowed server-side rather than by filtering the whole open set, so a view
 * that knows its todo id fetches only its own rows. An empty todoID is a 400
 * from the server, so callers must not call this without one. */
export function fetchOpenSignalsForTodo(fetchFn, basePath, todoID) {
    const params = new URLSearchParams({ state: SignalStateOpen, linked_todo_id: todoID });
    return getSignals(fetchFn, `${basePath}/signals?${params.toString()}`);
}
export function groupSignalsByRequest(signals) {
    const groups = [];
    const byKey = new Map();
    for (const signal of signals) {
        // The separator is NUL because it is the one character that cannot occur
        // in a session id or a request id, so `ab` + `c` cannot collide with `a` +
        // `bc`. The no-request form is prefixed as well so a derived signal's key
        // can never equal a real `sessionId + requestId` pair.
        //
        // WRITTEN AS THE ESCAPE, NEVER AS A RAW NUL BYTE. A raw NUL makes the whole
        // FILE binary: `file(1)` reports `data`, and every search that skips binary
        // files -- ripgrep, ugrep, git-grep without `-a`, and the `grep` every agent
        // on this box runs -- then returns ZERO matches in it, with no error and no
        // warning. git cannot diff it either. This file was in that state from
        // 2026-07-31 until 2026-08-15. `npm run check` now scans for the raw byte.
        const key = signal.request_id
            ? `${signal.session_id}\u0000${signal.request_id}`
            : `\u0000signal\u0000${signal.id}`;
        let group = byKey.get(key);
        if (!group) {
            group = { requestId: signal.request_id || '', sessionId: signal.session_id, signals: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.signals.push(signal);
    }
    return groups;
}
// Every mounted signal surface reads the same records, so a resolve on one has
// to reach the others: answering in the sidebar inbox while a RefChip panel is
// open on the same session otherwise leaves the panel offering a question that
// is already answered. There is no signal event on the SSE stream yet, so the
// resolve helpers below announce it here and every useOpenChatSignals refetches.
//
// This is a refetch trigger, not a cache — each surface still asks the server
// what is open, so the server stays the single source of truth for state.
const signalChangeListeners = new Set();
function announceSignalsChanged() {
    for (const listener of signalChangeListeners)
        listener();
}
/** Answer every question in one parked request.
 *
 * `answers` is keyed by signal title, which is exactly what the server minted
 * each row's title from and exactly what it reads back to pair an answer with
 * its row (resolveSignalsForRequest in internal/server/signals.go).
 *
 * The parked hook's own tool input is fetched and passed back untouched under
 * the answers, because the resolve verb REPLACES the tool input wholesale —
 * reconstructing it from the signal rows would silently drop whatever the
 * record does not carry (multiSelect, option previews). If the request is no
 * longer parked there is nothing to answer, and that is an error the user sees
 * rather than a resolve posted into the void. */
export async function resolveSignalQuestions(fetchFn, basePath, sessionId, requestId, answers) {
    if (!requestId)
        throw new Error('this signal carries no request_id — nothing to resolve');
    const pendingRes = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sessionId)}/hooks/pending`);
    if (!pendingRes.ok) {
        throw new Error(`pending hooks lookup failed: HTTP ${pendingRes.status} ${await pendingRes.text()}`);
    }
    // The route answers []msg.Event, and the hook is NESTED under `hook` — it is
    // not a bare HookEvent. Reading request_id off the envelope finds undefined
    // every time, so the lookup below missed unconditionally and every answer to
    // a tool-sourced question died on "no longer waiting" instead of resolving.
    // useBridgeSession.ts unwraps the same route correctly for the permission
    // banner; this is the copy that got it wrong.
    const pending = await pendingRes.json();
    const hook = pending.map(ev => ev.hook).find(h => h?.request_id === requestId);
    if (!hook) {
        throw new Error('this question is no longer waiting for an answer — its session moved on');
    }
    const parkedInput = (hook.input ?? {});
    await postResolve(fetchFn, basePath, sessionId, requestId, {
        behavior: 'allow',
        updated_input: { ...parkedInput, answers },
        resolved_by: 'user',
    });
    announceSignalsChanged();
}
/** Answer a derived question by sending its answer as the session's next user
 * message.
 *
 * Derived signals carry no request_id — no hook was ever parked for them — so
 * the hook-resolve verb cannot reach them. Sending a message IS their resolve
 * verb (SESSION-SIGNALS.md, "Resolve — per kind and source").
 *
 * The record closes server-side, in the /send handler, not here: a derived
 * question answered from the CLI or by an orchestrator has to close the same
 * way as one answered from this card, and only the server sees all of them. So
 * this posts the message and nothing else. */
export async function answerDerivedQuestion(fetchFn, basePath, sessionId, text) {
    const message = text.trim();
    if (!message)
        throw new Error('an answer cannot be empty');
    const res = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sessionId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
    if (!res.ok)
        throw new Error(`send failed: HTTP ${res.status} ${await res.text()}`);
    announceSignalsChanged();
}
/** Decline every question in one parked request. Unlike answering, this needs
 * no parked input: a deny carries no updated_input, and bridge-server records
 * the decision (and closes the signal rows) even for a request whose park is
 * already gone. */
export async function declineSignalQuestions(fetchFn, basePath, sessionId, requestId) {
    if (!requestId)
        throw new Error('this signal carries no request_id — nothing to decline');
    await postResolve(fetchFn, basePath, sessionId, requestId, { behavior: 'deny', resolved_by: 'user' });
    announceSignalsChanged();
}
/** Acknowledge a notification: close it without answering anything.
 *
 * Notifications are the one signal kind with no answer to deliver, so they
 * have no producer-specific resolve path — a tool notification and a derived
 * one both close here, through the signal-level verb
 * (POST /signals/{id}/resolve).
 *
 * The server refuses this for a question on purpose: a question nobody
 * answered has not been handled, and grading it "seen" would read as handled
 * on the surface that matters most, a worker's kanban card. Dismiss it
 * instead. */
export async function acknowledgeSignal(fetchFn, basePath, signalId) {
    await postSignalResolve(fetchFn, basePath, signalId, 'acknowledged');
    announceSignalsChanged();
}
/** Close a signal without an answer. Says out loud that no answer is coming,
 * which is the honest close for a question the user will not take — and, for
 * a derived question, what walks its session back off awaiting_user. */
export async function dismissSignal(fetchFn, basePath, signalId) {
    await postSignalResolve(fetchFn, basePath, signalId, 'dismissed');
    announceSignalsChanged();
}
async function postSignalResolve(fetchFn, basePath, signalId, state) {
    if (!signalId)
        throw new Error('a signal cannot be resolved without its id');
    const res = await fetchFn(`${basePath}/signals/${encodeURIComponent(signalId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
    });
    // 404 is the deployed gateway having no signals route yet, and it reaches
    // here only from a click — so unlike the reads, it is reported rather than
    // swallowed. A button that silently does nothing is worse than an error.
    if (!res.ok)
        throw new Error(`${state} failed: HTTP ${res.status} ${await res.text()}`);
}
async function postResolve(fetchFn, basePath, sessionId, requestId, body) {
    const res = await fetchFn(`${basePath}/sessions/${encodeURIComponent(sessionId)}/hooks/${encodeURIComponent(requestId)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok)
        throw new Error(`resolve failed: HTTP ${res.status} ${await res.text()}`);
}
/** Open chat signals for one session, or across all sessions when sessionId is
 * omitted.
 *
 * There is no signal event on the SSE stream yet, so `refreshKey` is how a
 * caller says "something happened that could have minted or closed a signal" —
 * the pending-hook set changing, for instance. Callers pass a value derived
 * from state they already track; nothing here polls on a timer. */
export function useOpenChatSignals(sessionId, refreshKey) {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [signals, setSignals] = useState([]);
    const [available, setAvailable] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reloadToken, setReloadToken] = useState(0);
    const reload = useCallback(() => setReloadToken(t => t + 1), []);
    useEffect(() => {
        signalChangeListeners.add(reload);
        return () => { signalChangeListeners.delete(reload); };
    }, [reload]);
    useEffect(() => {
        let live = true;
        setLoading(true);
        fetchOpenChatSignals(fetchFn, basePath, sessionId)
            .then(result => {
            if (!live)
                return;
            setError(null);
            if (result === null) {
                setAvailable(false);
                setSignals([]);
                return;
            }
            setAvailable(true);
            setSignals(result);
        })
            .catch((err) => {
            if (!live)
                return;
            setError(err instanceof Error ? err.message : String(err));
        })
            .finally(() => { if (live)
            setLoading(false); });
        return () => { live = false; };
    }, [fetchFn, basePath, sessionId, refreshKey, reloadToken]);
    return { signals, available, loading, error, reload };
}
/** Open signals grouped by the todo they propagate to, for a view that shows
 * many todos at once. Empty until the first fetch lands, and empty forever
 * against a bridge-server with no signals route — a board full of todos must
 * render either way.
 *
 * Takes no refresh key, unlike useOpenChatSignals. The query has no dimension
 * to key on: it asks for every open signal that names a todo, whatever board
 * or session the caller happens to be looking at. Keying it to the board id
 * refetched an identical list every time the selection changed. Resolves still
 * refresh it, through the same in-process announce every signal surface uses. */
export function useOpenSignalsByTodo() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [byTodo, setByTodo] = useState(new Map());
    const [reloadToken, setReloadToken] = useState(0);
    const reload = useCallback(() => setReloadToken(t => t + 1), []);
    useEffect(() => {
        signalChangeListeners.add(reload);
        return () => { signalChangeListeners.delete(reload); };
    }, [reload]);
    useEffect(() => {
        let live = true;
        fetchOpenSignalsByTodo(fetchFn, basePath)
            .then(result => {
            if (!live)
                return;
            setByTodo(result ?? new Map());
        })
            .catch(() => {
            // A board is not a signal surface. Failing to learn which todos have
            // open signals costs a badge; it must not cost the board.
            if (live)
                setByTodo(new Map());
        });
        return () => { live = false; };
    }, [fetchFn, basePath, reloadToken]);
    return byTodo;
}
/** Open signals against exactly one todo, for a view that is already looking
 * at that todo alone — the kanban card drawer.
 *
 * Deliberately not a lookup into useOpenSignalsByTodo's map. That map is the
 * board's read and answers "which of these many cards needs me?"; a drawer
 * knows its own todo id and asks the server for its own rows, so it is right
 * whether or not a board-wide read ever ran.
 *
 * Surface is not filtered here either, for the reason fetchOpenSignalsByTodo
 * gives: a todo is worked by chat sessions and by autonomous workers alike,
 * and both raise signals the person opening the card has to answer.
 *
 * Empty against a bridge-server with no signals route, and empty when the read
 * fails: a drawer is a card editor first, and it must open either way. */
export function useOpenSignalsForTodo(todoID) {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [signals, setSignals] = useState([]);
    const [reloadToken, setReloadToken] = useState(0);
    const reload = useCallback(() => setReloadToken(t => t + 1), []);
    useEffect(() => {
        signalChangeListeners.add(reload);
        return () => { signalChangeListeners.delete(reload); };
    }, [reload]);
    useEffect(() => {
        // An empty todo id is a 400 from the server, not "every signal" — so it is
        // never asked. A drawer on a placement whose noteboard item is gone has no
        // todo to ask about.
        if (!todoID) {
            setSignals([]);
            return;
        }
        let live = true;
        fetchOpenSignalsForTodo(fetchFn, basePath, todoID)
            .then(result => {
            if (!live)
                return;
            setSignals(result ?? []);
        })
            .catch(() => {
            if (live)
                setSignals([]);
        });
        return () => { live = false; };
    }, [fetchFn, basePath, todoID, reloadToken]);
    return signals;
}
//# sourceMappingURL=signalData.js.map