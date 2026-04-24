export function generateFrontendId() {
    return `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export function generateDefaultAgent(harness) {
    return `${harness}-agent`;
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
//# sourceMappingURL=utils.js.map