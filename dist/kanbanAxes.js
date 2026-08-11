/**
 * The axes email-classifier writes. Kept in the same order the controls should
 * appear: what it is, what it needs, how soon.
 */
export const CARD_AXES = [
    {
        prefix: 'cat:',
        label: 'Category',
        values: [
            'finance', 'housing', 'health', 'commerce', 'work-career', 'dev-infra',
            'social-events', 'government-legal', 'media-subs', 'politics', 'promotions', 'personal',
        ],
    },
    {
        prefix: 'action:',
        label: 'Action',
        values: ['reply', 'pay', 'decide', 'schedule', 'verify', 'fix', 'read', 'file', 'none'],
    },
    {
        prefix: 'urgency:',
        label: 'Urgency',
        // Ordered by pressure rather than alphabetically, so the control reads as a
        // scale. 'expired' sits last because a passed deadline is not urgency, it is
        // history — but it must stay visible rather than collapse into 'low'.
        values: ['critical', 'high', 'normal', 'low', 'expired'],
    },
    {
        prefix: 'work:',
        label: 'Work',
        values: ['not-started', 'in-progress', 'blocked', 'done'],
    },
];
export const WORK_AXIS_PREFIX = 'work:';
export const WORK_NOT_STARTED = 'not-started';
export const WORK_IN_PROGRESS = 'in-progress';
/** Rank used to sort urgency descending; unknown values sort last. */
const URGENCY_RANK = {
    critical: 0, high: 1, normal: 2, low: 3, expired: 4,
};
export function tagsOf(card) {
    const item = card.item;
    return item?.tags ?? [];
}
/** Returns the value of the axis tag on a card, or '' when it carries none. */
export function axisValue(card, prefix) {
    const found = tagsOf(card).find(t => t.startsWith(prefix));
    return found ? found.slice(prefix.length) : '';
}
/**
 * Replaces (or adds) one axis tag, leaving every other tag untouched.
 * Passing an empty value removes the axis tag entirely.
 */
export function withAxisValue(tags, prefix, value) {
    const rest = tags.filter(t => !t.startsWith(prefix));
    return value ? [...rest, prefix + value] : rest;
}
export function axisUsage(cards) {
    const out = [];
    for (const axis of CARD_AXES) {
        const counts = new Map();
        for (const card of cards) {
            const v = axisValue(card, axis.prefix);
            if (!v)
                continue;
            counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        if (counts.size === 0)
            continue;
        const values = [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => {
            const ia = axis.values.indexOf(a.value);
            const ib = axis.values.indexOf(b.value);
            // Values outside the vocabulary sort after known ones rather than being
            // dropped, so a classifier writing an unexpected value is visible.
            if (ia !== ib)
                return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
            return a.value.localeCompare(b.value);
        });
        out.push({ axis, values });
    }
    return out;
}
export function allCardsOf(columns) {
    // kanban-store serializes an empty column as `cards: null`, not `[]`.
    return columns.flatMap(c => c.cards ?? []);
}
export function matchesFilter(card, filter) {
    for (const [prefix, wanted] of Object.entries(filter)) {
        if (wanted.length === 0)
            continue;
        if (!wanted.includes(axisValue(card, prefix)))
            return false;
    }
    return true;
}
export function filterIsActive(filter) {
    return Object.values(filter).some(v => v.length > 0);
}
/**
 * Sorts a column's cards. 'default' returns them untouched, preserving whatever
 * order the board view gave us — worth keeping as an option because every writer
 * on this host passes position 0, so the stored order is arbitrary and a user may
 * still want to see it as-is.
 */
export function sortCards(cards, key) {
    if (key === 'default')
        return cards;
    const copy = [...cards];
    switch (key) {
        case 'urgency':
            copy.sort((a, b) => {
                const ra = URGENCY_RANK[axisValue(a, 'urgency:')] ?? 99;
                const rb = URGENCY_RANK[axisValue(b, 'urgency:')] ?? 99;
                if (ra !== rb)
                    return ra - rb;
                return titleOf(a).localeCompare(titleOf(b));
            });
            break;
        case 'title':
            copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
            break;
        case 'newest':
            copy.sort((a, b) => updatedAtOf(b).localeCompare(updatedAtOf(a)));
            break;
    }
    return copy;
}
function titleOf(card) {
    return card.item?.title ?? '';
}
function updatedAtOf(card) {
    return card.item?.updated_at ?? '';
}
/**
 * Groups a column's cards by an axis, for the "group by" control. Returns a
 * single unnamed group when grouping is off, so callers render one code path.
 */
export function groupCards(cards, prefix) {
    if (!prefix)
        return [{ name: '', cards }];
    const groups = new Map();
    for (const card of cards) {
        const key = axisValue(card, prefix) || '(unset)';
        const bucket = groups.get(key);
        if (bucket)
            bucket.push(card);
        else
            groups.set(key, [card]);
    }
    const axis = CARD_AXES.find(a => a.prefix === prefix);
    return [...groups.entries()]
        .map(([name, cards]) => ({ name, cards }))
        .sort((a, b) => {
        const order = axis?.values ?? [];
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        if (ia !== ib)
            return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
        return a.name.localeCompare(b.name);
    });
}
/**
 * Splits an email link's entity_ref back into the two parts email-classifier
 * joined: the mailstack account id and the provider message id.
 *
 * The account id is everything before the FIRST colon, because a Gmail message
 * id never contains one but an account id could not be recovered otherwise.
 */
export function parseEmailLocator(ref) {
    const i = ref.indexOf(':');
    if (i <= 0 || i === ref.length - 1)
        return null;
    return { accountID: ref.slice(0, i), messageID: ref.slice(i + 1) };
}
//# sourceMappingURL=kanbanAxes.js.map