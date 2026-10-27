// What a place, visit or trip reference chip shows, as pure rules so they are
// tested (test/locationRefs.test.ts). The chips are PlaceRefChip, VisitRefChip
// and TripRefChip in components/chat/RefChip.tsx; their data is
// location-store's answer to GET /places/{id}, /visits/{id} or /trips/{id},
// passed through by the host's resolver.

import type { Locality, Place, Trip, Visit } from '@kayushkin/location-store-types'
import { calendarDayOf } from './journalRefs'

/** A distance in words: metres under a kilometre, else kilometres. */
export function distanceLabel(meters: number | null | undefined): string {
  if (meters == null) return ''
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`
}

/** A span of time in words: "45 min", "3 h 10 min", "2 days". */
export function durationLabel(startedAt: number, endedAt: number): string {
  const minutes = Math.max(0, Math.round((endedAt - startedAt) / 60))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 48 * 60) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours} h ${rest} min` : `${hours} h`
  }
  return `${Math.round(minutes / (24 * 60))} days`
}

/** A place's name on a chip: its name, or its kind when it has none. */
export function placeChipLabel(place: Pick<Place, 'name' | 'kind'>): string {
  return place.name || (place.kind === 'other' ? 'place' : place.kind)
}

/** A visit's name on a chip: where, and the day. */
export function visitChipLabel(visit: Pick<Visit, 'place_name' | 'started_at'>): string {
  return `${visit.place_name || 'visit'} ${calendarDayOf(visit.started_at)}`
}

/** Whether a trip is a journey: a span away from home made of other trips. */
export function isJourney(trip: Pick<Trip, 'kind'>): boolean {
  return trip.kind === 'journey'
}

/** The days a span covers: "2026-06-26 – 2026-06-30", or one day. */
export function daySpanLabel(startedAt: number, endedAt: number): string {
  const first = calendarDayOf(startedAt)
  const last = calendarDayOf(endedAt)
  return first === last ? first : `${first} – ${last}`
}

/** A trip's name on a chip. A movement: its title, or its mode, day and
 *  distance. A journey: its title, or "journey" and its days; then how many
 *  trips it is made of. */
export function tripChipLabel(
  trip: Pick<Trip, 'title' | 'mode' | 'started_at' | 'ended_at' | 'distance_meters' | 'kind' | 'child_trips'>,
): string {
  if (isJourney(trip)) {
    const name = trip.title || `journey ${daySpanLabel(trip.started_at, trip.ended_at)}`
    return trip.child_trips > 0 ? `${name} · ${trip.child_trips} trip${trip.child_trips === 1 ? '' : 's'}` : name
  }
  if (trip.title) return trip.title
  const mode = trip.mode === 'unknown' ? 'trip' : trip.mode
  const distance = distanceLabel(trip.distance_meters)
  return [mode, calendarDayOf(trip.started_at), distance].filter(Boolean).join(' ')
}

/** The glyph a trip draws with: a suitcase for a journey, else its mode's. */
export function tripGlyph(trip: Pick<Trip, 'kind' | 'mode'>): string {
  return isJourney(trip) ? '🧳' : tripModeGlyph(trip.mode)
}

/** A town in words: "Fartown, Example Region", or '' when none is named. */
export function localityLabel(locality: Locality | null | undefined): string {
  if (!locality) return ''
  const second = locality.region || locality.country
  return second && second !== locality.city ? `${locality.city}, ${second}` : locality.city
}

/** Where a trip went between, in words: its places' names, else its towns. */
export function tripBetweenLabel(
  trip: Pick<Trip, 'start_place_name' | 'end_place_name' | 'start_locality' | 'end_locality'>,
): string {
  const start = trip.start_place_name || localityLabel(trip.start_locality)
  const end = trip.end_place_name || localityLabel(trip.end_locality)
  return [start, end].filter(Boolean).join(' → ')
}

/** The glyph a trip's mode draws with. */
export function tripModeGlyph(mode: string): string {
  switch (mode) {
    case 'driving': return '🚗'
    case 'motorcycling': return '🏍'
    case 'walking': case 'hiking': case 'running': return '🚶'
    case 'cycling': return '🚲'
    case 'bus': return '🚌'
    case 'train': case 'tram': case 'subway': return '🚆'
    case 'ferry': case 'boating': return '⛴'
    case 'flying': return '✈'
    case 'skiing': return '⛷'
    default: return '🧭'
  }
}

/** A map link for one point, or '' when there is none. */
export function pointMapUrl(latitude: number | null | undefined, longitude: number | null | undefined): string {
  if (latitude == null || longitude == null) return ''
  const lat = latitude.toFixed(5)
  const lon = longitude.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}

/** A directions link from a trip's start to its end, or '' without both. */
export function tripRouteUrl(trip: Pick<Trip, 'start_latitude' | 'start_longitude' | 'end_latitude' | 'end_longitude'>): string {
  if (trip.start_latitude == null || trip.start_longitude == null || trip.end_latitude == null || trip.end_longitude == null) return ''
  const point = (latitude: number, longitude: number) => `${latitude.toFixed(5)},${longitude.toFixed(5)}`
  return `https://www.openstreetmap.org/directions?route=${encodeURIComponent(
    `${point(trip.start_latitude, trip.start_longitude)};${point(trip.end_latitude, trip.end_longitude)}`,
  )}`
}
