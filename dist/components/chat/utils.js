// The states in which the harness holds the turn and more of it is still
// coming. Everything else — the quiet states (idle, awaiting_user, paused),
// the waits that need a human or a clock (awaiting_permission,
// rate_limited), and the terminal ones (completed, error, aborted) — means
// no further assistant output arrives without a fresh action, so whatever
// the last turn looks like in the log, nothing is being produced for it now.
// Those waits have their own surfaces (the permission banner, the status
// chip); a "streaming…" badge during them would say something untrue.
const workingStates = new Set([
    'starting',
    'model_generating',
    'tool_running',
    'compacting',
]);
export function harnessIsWorkingOnTurn(state) {
    return workingStates.has(state);
}
// The states in which POST /sessions/{id}/resume will actually be accepted —
// the client-visible proxy for "the server holds no live process for this
// session". handleResumeSession refuses with 409 whenever it still has one
// (llm-bridge-server internal/server/sessions.go, pinned by
// TestResumeSession_AlreadyRunning), so offering Resume anywhere else is
// offering a button that cannot work.
//
// `paused` is deliberately NOT here, and that is the whole point of the set.
// It is now a real server state — the interrupt handler writes it — but that
// changed only where it comes from, not what it means. Interrupt does not end
// the process: Manager.Stop calls proc.Interrupt(), llm-bridge-claudecode
// catches the signal and keeps running, and the process stays registered. So
// a paused session is exactly the session /resume refuses. Keyed on `paused`,
// Resume 409'd every single time it was pressed, and the user read
// "Resume failed: Conflict" as a symptom of the interrupt.
//
// A paused session needs no Resume anyway — its harness is alive and sending
// the next message continues it.
//
// The quiet states stay out for their own reasons: `idle` cannot tell a live
// process between turns from a dead one whose row never caught up,
// `completed` is written by "mark done" without touching the process, and
// `error`/`rate_limited` are mid-life. None of them need Resume anyway —
// /send starts a process when the registry has none, so any dead session
// revives by being sent to. Resume is the way back WITHOUT putting words in
// the session's mouth.
//
// This mirrors RESUMABLE_STATES in chat-core (src/react/hooks.ts), which
// dash's chat page shipped first. When `e1732f61` (SessionPaused on interrupt) is
// decided and the manager starts emitting a real paused state, `paused`
// joins both sets and nothing else changes.
const resumableStates = new Set([
    'aborted',
    'disconnected',
]);
export function sessionCanBeResumed(state) {
    return resumableStates.has(state);
}
export function formatHMS(ts) {
    try {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }
    catch {
        return ts;
    }
}
export function idTail(id, n = 10) {
    return id.length > n ? `…${id.slice(-n)}` : id;
}
export function oneLine(s, n = 120) {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length > n ? flat.slice(0, n) + '…' : flat;
}
export function renderValue(v) {
    if (v == null)
        return '-';
    if (typeof v === 'boolean')
        return v ? 'yes' : 'no';
    if (typeof v === 'number')
        return `${v}`;
    if (typeof v === 'string')
        return v;
    return JSON.stringify(v);
}
export function flattenToRows(obj, prefix = '') {
    const rows = [];
    for (const [key, val] of Object.entries(obj)) {
        const label = prefix ? `${prefix}.${key}` : key;
        if (val != null && typeof val === 'object' && !Array.isArray(val)) {
            rows.push(...flattenToRows(val, label));
        }
        else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                const item = val[i];
                if (item != null && typeof item === 'object') {
                    rows.push(...flattenToRows(item, `${label}[${i}]`));
                }
                else {
                    rows.push([`${label}[${i}]`, renderValue(item)]);
                }
            }
        }
        else {
            rows.push([label, renderValue(val)]);
        }
    }
    return rows;
}
export function shouldExpandByDefault(row) {
    if (row.actor === 'user')
        return true;
    if (row.kind === 'text' && row.text)
        return true;
    return !!row.meta || row.kind === 'result';
}
export function groupEventsByType(events) {
    const order = [];
    const buckets = {};
    for (const e of events) {
        const t = String(e.type ?? 'unknown') || 'unknown';
        if (!(t in buckets)) {
            buckets[t] = [];
            order.push(t);
        }
        buckets[t].push(e);
    }
    return order.map(t => ({ type: t, events: buckets[t] }));
}
export function typesInRow(row) {
    return [row.kind];
}
export function formatTodoWrite(todos) {
    if (!Array.isArray(todos))
        return undefined;
    let done = 0;
    let active = 0;
    let pending = 0;
    let current;
    for (const raw of todos) {
        if (!raw || typeof raw !== 'object')
            continue;
        const t = raw;
        if (t.status === 'completed')
            done++;
        else if (t.status === 'in_progress') {
            active++;
            current = t.activeForm || t.content || current;
        }
        else
            pending++;
    }
    const total = todos.length;
    const bits = [`${total} todo${total === 1 ? '' : 's'}`];
    const counts = [];
    if (done)
        counts.push(`${done}✓`);
    if (active)
        counts.push(`${active}⏺`);
    if (pending)
        counts.push(`${pending}○`);
    if (counts.length)
        bits.push(`(${counts.join(' ')})`);
    if (current)
        bits.push(`— ${oneLine(current, 60)}`);
    return bits.join(' ');
}
export function toolSnippet(t) {
    if (!t.input)
        return '';
    const keys = Object.keys(t.input);
    if (keys.length === 0)
        return '';
    if (t.tool === 'TodoWrite') {
        const summary = formatTodoWrite(t.input.todos);
        if (summary)
            return summary;
    }
    const preferred = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt'];
    for (const k of preferred) {
        const v = t.input[k];
        if (typeof v === 'string' && v)
            return `${k}=${oneLine(v, 80)}`;
    }
    const first = t.input[keys[0]];
    if (typeof first === 'string')
        return `${keys[0]}=${oneLine(first, 80)}`;
    if (Array.isArray(first))
        return `${keys[0]}[${first.length}]`;
    return keys.join(',');
}
export function toolFullText(t) {
    if (!t.input)
        return undefined;
    try {
        return JSON.stringify(t.input, null, 2);
    }
    catch {
        return undefined;
    }
}
// --- Row-memo comparators ---
//
// The three chat panes each memoize their row component, and all three lean on
// one property of the reducer: `applyEventToRows` replaces only the row an
// event touched and returns every other row by the same reference. One SSE
// delta therefore changes one object out of N, and these comparators are what
// let a pane act on that — they answer "did this row's content change", not
// "is this a new array".
//
// Two shapes, because the panes differ in what they hand a row. Thread passes
// the reducer's own `LogRow` objects straight through, so identity is the
// whole test. Turns and Timeline derive fresh item objects from the rows on
// every render, so identity always differs and the fields are the test.
// True when two row lists hold the same row objects in the same order.
// Reference equality per element is the point: a row the reducer did not
// touch is the very same object, so an untouched turn compares equal without
// reading any of its content.
export function sameRowList(a, b) {
    if (a === b)
        return true;
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}
// True when two derived pane items say the same thing.
//
// Both `TurnsItem` and `TimelineItem` are flat records of primitives plus an
// optional `usage`, so a shallow own-key comparison is exact — there is no
// nested value it could miss. It is deliberately written against the keys
// actually present rather than a fixed list: a field added to either item type
// is compared from the moment it is added, instead of being silently ignored
// until somebody remembers to extend this. `usage` is the one object-valued
// field, and it is compared by identity because `rowsToTurns` copies it
// straight off the row it came from, so an unchanged row yields the very same
// object; a changed one yields a different row and fails an earlier field
// anyway.
export function sameItemFields(a, b) {
    if (a === b)
        return true;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length)
        return false;
    for (const k of aKeys) {
        if (a[k] !== b[k])
            return false;
    }
    return true;
}
//# sourceMappingURL=utils.js.map