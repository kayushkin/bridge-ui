import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
// A day key in the event's own zone (UTC for our all-day dates, which are stored
// as UTC midnight). Kept separate from display formatting so the calendar POST
// and the table agree on which calendar day an event lands on.
function dayKey(ts, tz) {
    const d = new Date(ts * 1000);
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(d);
    }
    catch {
        return d.toISOString().slice(0, 10);
    }
}
function fmtDate(ts, tz) {
    if (!ts)
        return 'TBD';
    const d = new Date(ts * 1000);
    return new Intl.DateTimeFormat('en-US', {
        timeZone: tz || 'UTC', weekday: 'short', month: 'short', day: 'numeric',
    }).format(d);
}
function fmtTime(e) {
    if (!e.start_ts)
        return '';
    if (e.all_day)
        return 'All day';
    const d = new Date(e.start_ts * 1000);
    return new Intl.DateTimeFormat('en-US', {
        timeZone: e.tz || 'UTC', hour: 'numeric', minute: '2-digit',
    }).format(d);
}
function nextDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
/**
 * Potential Events. A table of candidate events discovered by the event-radar
 * dispatcher, filterable by location, category and status. Each row can be added
 * to the primary Google Calendar (via the host's calendar endpoint), marked
 * Interested, or dismissed — the decision is written back to event-store so a
 * re-scan never resurrects a dismissed event or re-adds one already on the calendar.
 */
export function BridgePotentialEvents() {
    const { fetch: authedFetch, eventsStoreBasePath, calendarBasePath } = useBridgeConfig();
    const [events, setEvents] = useState([]);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [location, setLocation] = useState('');
    const [category, setCategory] = useState('');
    const [statusView, setStatusView] = useState('open');
    const [busyId, setBusyId] = useState(null);
    const [flash, setFlash] = useState(null);
    const base = eventsStoreBasePath;
    async function load() {
        setLoading(true);
        setError(null);
        try {
            const [er, sr] = await Promise.all([
                authedFetch(`${base}/events`),
                authedFetch(`${base}/sources`),
            ]);
            if (!er.ok)
                throw new Error(`events: ${er.status}`);
            const ed = await er.json();
            setEvents(ed.events ?? []);
            if (sr.ok) {
                const sd = await sr.json();
                setSources(sd.sources ?? []);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!base)
            return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base]);
    const cities = useMemo(() => [...new Set(events.map(e => e.city).filter(Boolean))].sort(), [events]);
    const categories = useMemo(() => [...new Set(events.map(e => e.category).filter(Boolean))].sort(), [events]);
    const shown = useMemo(() => {
        return events
            .filter(e => (location ? e.city === location : true))
            .filter(e => (category ? e.category === category : true))
            .filter(e => {
            if (statusView === 'all')
                return true;
            if (statusView === 'open')
                return e.status === 'candidate' || e.status === 'interested';
            return e.status === statusView;
        })
            .sort((a, b) => (a.start_ts || 8e18) - (b.start_ts || 8e18));
    }, [events, location, category, statusView]);
    async function patch(id, body) {
        const r = await authedFetch(`${base}/events/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok)
            throw new Error(`patch ${id}: ${r.status}`);
        const updated = await r.json();
        setEvents(prev => prev.map(e => (e.id === id ? updated : e)));
    }
    async function setStatus(id, status) {
        setBusyId(id);
        try {
            await patch(id, { status });
        }
        catch (e) {
            setFlash(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusyId(null);
        }
    }
    async function addToCalendar(e) {
        if (!calendarBasePath)
            return;
        setBusyId(e.id);
        setFlash(null);
        try {
            const day = dayKey(e.start_ts, e.tz);
            const descParts = [e.description, e.cost ? `Cost: ${e.cost}` : '', e.url]
                .filter(Boolean);
            const body = {
                summary: e.title,
                location: [e.venue, e.city].filter(Boolean).join(', '),
                description: descParts.join('\n\n'),
            };
            if (e.all_day || !e.start_ts) {
                body.start = { date: day };
                body.end = { date: nextDay(day) };
            }
            else {
                const startISO = new Date(e.start_ts * 1000).toISOString();
                const endISO = new Date((e.end_ts || e.start_ts + 3600) * 1000).toISOString();
                body.start = { dateTime: startISO };
                body.end = { dateTime: endISO };
            }
            const r = await authedFetch(calendarBasePath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!r.ok)
                throw new Error(`calendar: ${r.status}`);
            const created = await r.json().catch(() => ({}));
            await patch(e.id, { status: 'added', calendar_event_id: created.id ?? 'added' });
            setFlash(`Added "${e.title}" to your Google Calendar.`);
        }
        catch (err) {
            setFlash(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusyId(null);
        }
    }
    const watchCount = sources.filter(s => s.kind === 'watch').length;
    const researchCount = sources.filter(s => s.kind === 'research').length;
    return (_jsxs("div", { className: "bridge-potential-events", style: { padding: '1rem' }, children: [_jsxs("header", { style: { display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }, children: [_jsx("h2", { style: { margin: 0 }, children: "Potential Events" }), _jsxs("span", { style: { opacity: 0.6, fontSize: '0.85rem' }, children: [shown.length, " shown \u00B7 ", events.length, " tracked \u00B7 ", sources.length, " sources (", watchCount, " watch, ", researchCount, " research)"] }), _jsx("button", { onClick: () => void load(), style: { marginLeft: 'auto' }, children: "Refresh" })] }), _jsxs("div", { style: { display: 'flex', gap: '0.75rem', margin: '0.75rem 0', flexWrap: 'wrap' }, children: [_jsxs("select", { value: location, onChange: ev => setLocation(ev.target.value), children: [_jsx("option", { value: "", children: "All locations" }), cities.map(c => _jsx("option", { value: c, children: c }, c))] }), _jsxs("select", { value: category, onChange: ev => setCategory(ev.target.value), children: [_jsx("option", { value: "", children: "All categories" }), categories.map(c => _jsx("option", { value: c, children: c }, c))] }), _jsxs("select", { value: statusView, onChange: ev => setStatusView(ev.target.value), children: [_jsx("option", { value: "open", children: "Open (candidate + interested)" }), _jsx("option", { value: "interested", children: "Interested" }), _jsx("option", { value: "added", children: "On calendar" }), _jsx("option", { value: "dismissed", children: "Dismissed" }), _jsx("option", { value: "all", children: "All" })] })] }), flash && (_jsx("div", { style: { margin: '0.5rem 0', padding: '0.5rem 0.75rem', background: 'rgba(120,180,255,0.12)', borderRadius: 6 }, children: flash })), error && _jsxs("div", { style: { color: 'crimson' }, children: ["Failed to load: ", error] }), loading ? (_jsx("div", { style: { opacity: 0.6 }, children: "Loading\u2026" })) : shown.length === 0 ? (_jsx("div", { style: { opacity: 0.6 }, children: "No events match. Try a wider filter or hit Refresh." })) : (_jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', borderBottom: '1px solid rgba(128,128,128,0.3)' }, children: [_jsx("th", { style: { padding: '0.4rem' }, children: "Date" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Time" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Event" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Location" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Category" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Cost" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Source" }), _jsx("th", { style: { padding: '0.4rem' }, children: "Actions" })] }) }), _jsx("tbody", { children: shown.map(e => {
                            const busy = busyId === e.id;
                            return (_jsxs("tr", { style: { borderBottom: '1px solid rgba(128,128,128,0.15)', opacity: e.status === 'dismissed' ? 0.5 : 1 }, children: [_jsx("td", { style: { padding: '0.4rem', whiteSpace: 'nowrap' }, children: fmtDate(e.start_ts, e.tz) }), _jsx("td", { style: { padding: '0.4rem', whiteSpace: 'nowrap' }, children: fmtTime(e) }), _jsxs("td", { style: { padding: '0.4rem' }, children: [e.url
                                                ? _jsx("a", { href: e.url, target: "_blank", rel: "noreferrer", children: e.title })
                                                : e.title, e.description && (_jsx("div", { style: { opacity: 0.6, fontSize: '0.8rem' }, children: e.description }))] }), _jsxs("td", { style: { padding: '0.4rem' }, children: [e.city, e.venue ? _jsx("div", { style: { opacity: 0.6, fontSize: '0.8rem' }, children: e.venue }) : null] }), _jsx("td", { style: { padding: '0.4rem' }, children: e.category }), _jsx("td", { style: { padding: '0.4rem' }, children: e.cost }), _jsx("td", { style: { padding: '0.4rem', opacity: 0.7 }, children: e.source_name }), _jsx("td", { style: { padding: '0.4rem', whiteSpace: 'nowrap' }, children: e.status === 'added' ? (_jsx("span", { style: { color: 'seagreen' }, children: "\u2713 on calendar" })) : (_jsxs(_Fragment, { children: [calendarBasePath && (_jsx("button", { disabled: busy, onClick: () => void addToCalendar(e), title: "Add to Google Calendar", children: busy ? '…' : '+ Calendar' })), e.status !== 'interested' && (_jsx("button", { disabled: busy, onClick: () => void setStatus(e.id, 'interested'), style: { marginLeft: 4 }, children: "\u2605" })), e.status !== 'dismissed' && (_jsx("button", { disabled: busy, onClick: () => void setStatus(e.id, 'dismissed'), style: { marginLeft: 4 }, title: "Dismiss", children: "\u2715" }))] })) })] }, e.id));
                        }) })] }))] }));
}
//# sourceMappingURL=BridgePotentialEvents.js.map