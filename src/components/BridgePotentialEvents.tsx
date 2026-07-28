import { useEffect, useMemo, useState } from 'react'
import { useBridgeConfig } from '../context'

// Mirrors event-store's JSON (github.com/kayushkin/event-store). Events are
// candidate happenings discovered by a source; status tracks the human decision.
interface EventItem {
  id: number
  title: string
  start_ts: number
  end_ts: number
  all_day: boolean
  tz: string
  city: string
  venue: string
  category: string
  tags: string[] | null
  description: string
  cost: string
  url: string
  source_id: number
  source_name: string
  status: 'candidate' | 'interested' | 'added' | 'dismissed'
  relevance: number
  calendar_event_id: string
}

interface SourceItem {
  id: number
  name: string
  kind: 'watch' | 'research'
  location: string
}

type StatusView = 'open' | 'interested' | 'added' | 'dismissed' | 'all'

// A day key in the event's own zone (UTC for our all-day dates, which are stored
// as UTC midnight). Kept separate from display formatting so the calendar POST
// and the table agree on which calendar day an event lands on.
function dayKey(ts: number, tz: string): string {
  const d = new Date(ts * 1000)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function fmtDate(ts: number, tz: string): string {
  if (!ts) return 'TBD'
  const d = new Date(ts * 1000)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(d)
}

function fmtTime(e: EventItem): string {
  if (!e.start_ts) return ''
  if (e.all_day) return 'All day'
  const d = new Date(e.start_ts * 1000)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: e.tz || 'UTC', hour: 'numeric', minute: '2-digit',
  }).format(d)
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Potential Events. A table of candidate events discovered by the event-radar
 * dispatcher, filterable by location, category and status. Each row can be added
 * to the primary Google Calendar (via the host's calendar endpoint), marked
 * Interested, or dismissed — the decision is written back to event-store so a
 * re-scan never resurrects a dismissed event or re-adds one already on the calendar.
 */
export function BridgePotentialEvents() {
  const { fetch: authedFetch, eventsStoreBasePath, calendarBasePath } = useBridgeConfig()
  const [events, setEvents] = useState<EventItem[]>([])
  const [sources, setSources] = useState<SourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [statusView, setStatusView] = useState<StatusView>('open')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const base = eventsStoreBasePath

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [er, sr] = await Promise.all([
        authedFetch(`${base}/events`),
        authedFetch(`${base}/sources`),
      ])
      if (!er.ok) throw new Error(`events: ${er.status}`)
      const ed = await er.json()
      setEvents(ed.events ?? [])
      if (sr.ok) {
        const sd = await sr.json()
        setSources(sd.sources ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!base) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  const cities = useMemo(
    () => [...new Set(events.map(e => e.city).filter(Boolean))].sort(),
    [events],
  )
  const categories = useMemo(
    () => [...new Set(events.map(e => e.category).filter(Boolean))].sort(),
    [events],
  )

  const shown = useMemo(() => {
    return events
      .filter(e => (location ? e.city === location : true))
      .filter(e => (category ? e.category === category : true))
      .filter(e => {
        if (statusView === 'all') return true
        if (statusView === 'open') return e.status === 'candidate' || e.status === 'interested'
        return e.status === statusView
      })
      .sort((a, b) => (a.start_ts || 8e18) - (b.start_ts || 8e18))
  }, [events, location, category, statusView])

  async function patch(id: number, body: Record<string, unknown>) {
    const r = await authedFetch(`${base}/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`patch ${id}: ${r.status}`)
    const updated: EventItem = await r.json()
    setEvents(prev => prev.map(e => (e.id === id ? updated : e)))
  }

  async function setStatus(id: number, status: EventItem['status']) {
    setBusyId(id)
    try {
      await patch(id, { status })
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function addToCalendar(e: EventItem) {
    if (!calendarBasePath) return
    setBusyId(e.id)
    setFlash(null)
    try {
      const day = dayKey(e.start_ts, e.tz)
      const descParts = [e.description, e.cost ? `Cost: ${e.cost}` : '', e.url]
        .filter(Boolean)
      const body: Record<string, unknown> = {
        summary: e.title,
        location: [e.venue, e.city].filter(Boolean).join(', '),
        description: descParts.join('\n\n'),
      }
      if (e.all_day || !e.start_ts) {
        body.start = { date: day }
        body.end = { date: nextDay(day) }
      } else {
        const startISO = new Date(e.start_ts * 1000).toISOString()
        const endISO = new Date((e.end_ts || e.start_ts + 3600) * 1000).toISOString()
        body.start = { dateTime: startISO }
        body.end = { dateTime: endISO }
      }
      const r = await authedFetch(calendarBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`calendar: ${r.status}`)
      const created = await r.json().catch(() => ({}))
      await patch(e.id, { status: 'added', calendar_event_id: created.id ?? 'added' })
      setFlash(`Added "${e.title}" to your Google Calendar.`)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const watchCount = sources.filter(s => s.kind === 'watch').length
  const researchCount = sources.filter(s => s.kind === 'research').length

  return (
    <div className="bridge-potential-events" style={{ padding: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Potential Events</h2>
        <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          {shown.length} shown · {events.length} tracked · {sources.length} sources
          ({watchCount} watch, {researchCount} research)
        </span>
        <button onClick={() => void load()} style={{ marginLeft: 'auto' }}>Refresh</button>
      </header>

      <div style={{ display: 'flex', gap: '0.75rem', margin: '0.75rem 0', flexWrap: 'wrap' }}>
        <select value={location} onChange={ev => setLocation(ev.target.value)}>
          <option value="">All locations</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={category} onChange={ev => setCategory(ev.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusView} onChange={ev => setStatusView(ev.target.value as StatusView)}>
          <option value="open">Open (candidate + interested)</option>
          <option value="interested">Interested</option>
          <option value="added">On calendar</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
      </div>

      {flash && (
        <div style={{ margin: '0.5rem 0', padding: '0.5rem 0.75rem', background: 'rgba(120,180,255,0.12)', borderRadius: 6 }}>
          {flash}
        </div>
      )}
      {error && <div style={{ color: 'crimson' }}>Failed to load: {error}</div>}
      {loading ? (
        <div style={{ opacity: 0.6 }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ opacity: 0.6 }}>No events match. Try a wider filter or hit Refresh.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(128,128,128,0.3)' }}>
              <th style={{ padding: '0.4rem' }}>Date</th>
              <th style={{ padding: '0.4rem' }}>Time</th>
              <th style={{ padding: '0.4rem' }}>Event</th>
              <th style={{ padding: '0.4rem' }}>Location</th>
              <th style={{ padding: '0.4rem' }}>Category</th>
              <th style={{ padding: '0.4rem' }}>Cost</th>
              <th style={{ padding: '0.4rem' }}>Source</th>
              <th style={{ padding: '0.4rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(e => {
              const busy = busyId === e.id
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid rgba(128,128,128,0.15)', opacity: e.status === 'dismissed' ? 0.5 : 1 }}>
                  <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>{fmtDate(e.start_ts, e.tz)}</td>
                  <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>{fmtTime(e)}</td>
                  <td style={{ padding: '0.4rem' }}>
                    {e.url
                      ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>
                      : e.title}
                    {e.description && (
                      <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>{e.description}</div>
                    )}
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    {e.city}{e.venue ? <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>{e.venue}</div> : null}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{e.category}</td>
                  <td style={{ padding: '0.4rem' }}>{e.cost}</td>
                  <td style={{ padding: '0.4rem', opacity: 0.7 }}>{e.source_name}</td>
                  <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>
                    {e.status === 'added' ? (
                      <span style={{ color: 'seagreen' }}>✓ on calendar</span>
                    ) : (
                      <>
                        {calendarBasePath && (
                          <button disabled={busy} onClick={() => void addToCalendar(e)} title="Add to Google Calendar">
                            {busy ? '…' : '+ Calendar'}
                          </button>
                        )}
                        {e.status !== 'interested' && (
                          <button disabled={busy} onClick={() => void setStatus(e.id, 'interested')} style={{ marginLeft: 4 }}>★</button>
                        )}
                        {e.status !== 'dismissed' && (
                          <button disabled={busy} onClick={() => void setStatus(e.id, 'dismissed')} style={{ marginLeft: 4 }} title="Dismiss">✕</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
