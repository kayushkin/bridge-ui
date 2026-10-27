import { describe, expect, it } from 'vitest'
import {
  daySpanLabel, distanceLabel, durationLabel, localityLabel, placeChipLabel, pointMapUrl, tripBetweenLabel, tripChipLabel, tripGlyph,
  tripModeGlyph, tripRouteUrl, visitChipLabel,
} from '../src/locationRefs'

describe('location chips', () => {
  it('says distances and durations in plain words', () => {
    expect(distanceLabel(450)).toBe('450 m')
    expect(distanceLabel(7123.5)).toBe('7.1 km')
    expect(distanceLabel(250000)).toBe('250 km')
    expect(distanceLabel(null)).toBe('')
    expect(durationLabel(0, 45 * 60)).toBe('45 min')
    expect(durationLabel(0, 190 * 60)).toBe('3 h 10 min')
    expect(durationLabel(0, 3 * 86400)).toBe('3 days')
  })
  it('names a place by its name, or its kind', () => {
    expect(placeChipLabel({ name: 'Corner bakery', kind: 'venue' })).toBe('Corner bakery')
    expect(placeChipLabel({ name: '', kind: 'home' })).toBe('home')
    expect(placeChipLabel({ name: '', kind: 'other' })).toBe('place')
  })
  it('names a visit by where and the day', () => {
    expect(visitChipLabel({ place_name: 'Corner bakery', started_at: 1300000000 })).toMatch(/^Corner bakery 2011-03-1[23]$/)
    expect(visitChipLabel({ place_name: '', started_at: 1300000000 })).toMatch(/^visit 2011-03-1[23]$/)
  })
  it('names a trip by its title, or its mode, day and distance', () => {
    const movement = { kind: 'movement', ended_at: 1300003600, child_trips: 0 }
    expect(tripChipLabel({ ...movement, title: 'Lake weekend', mode: 'mixed', started_at: 1300000000, distance_meters: null })).toBe('Lake weekend')
    expect(tripChipLabel({ ...movement, title: '', mode: 'driving', started_at: 1300000000, distance_meters: 42000 })).toMatch(/^driving 2011-03-1[23] 42 km$/)
    expect(tripChipLabel({ ...movement, title: '', mode: 'unknown', started_at: 1300000000, distance_meters: null })).toMatch(/^trip 2011-03-1[23]$/)
    expect(tripModeGlyph('flying')).toBe('✈')
    expect(tripModeGlyph('teleport')).toBe('🧭')
  })
  it('names a journey by its title or its days, with how many trips it holds', () => {
    const journey = { kind: 'journey', mode: 'mixed', started_at: 1300000000, ended_at: 1300000000 + 3 * 86400, distance_meters: 900000 }
    expect(tripChipLabel({ ...journey, title: 'Hometown → Fartown, 13 Mar – 16 Mar 2011', child_trips: 12 }))
      .toBe('Hometown → Fartown, 13 Mar – 16 Mar 2011 · 12 trips')
    expect(tripChipLabel({ ...journey, title: '', child_trips: 1 })).toMatch(/^journey 2011-03-1[23] – 2011-03-1[56] · 1 trip$/)
    expect(tripChipLabel({ ...journey, title: 'Empty so far', child_trips: 0 })).toBe('Empty so far')
    expect(tripGlyph({ kind: 'journey', mode: 'flying' })).toBe('🧳')
    expect(tripGlyph({ kind: 'movement', mode: 'flying' })).toBe('✈')
    expect(daySpanLabel(1300000000, 1300000060)).toMatch(/^2011-03-1[23]$/)
  })
  it('names towns, and says where a trip went between', () => {
    const fartown = { city: 'Fartown', region: 'Example Region', country: 'Exampleland', country_code: 'XX', time_zone: 'Africa/Ndjamena',
      geonames_id: 4, distance_meters: 100, described_by: 'location-name-localities' }
    expect(localityLabel(fartown)).toBe('Fartown, Example Region')
    expect(localityLabel({ ...fartown, region: '' })).toBe('Fartown, Exampleland')
    expect(localityLabel(null)).toBe('')
    expect(tripBetweenLabel({ start_place_name: 'Home', end_place_name: '', start_locality: null, end_locality: fartown }))
      .toBe('Home → Fartown, Example Region')
  })
  it('links a map only when there is a place', () => {
    expect(pointMapUrl(10.5, 20.5)).toBe('https://www.openstreetmap.org/?mlat=10.50000&mlon=20.50000#map=16/10.50000/20.50000')
    expect(pointMapUrl(null, 20.5)).toBe('')
    expect(tripRouteUrl({ start_latitude: 10, start_longitude: 20, end_latitude: 10.5, end_longitude: 20.5 }))
      .toBe('https://www.openstreetmap.org/directions?route=10.00000%2C20.00000%3B10.50000%2C20.50000')
    expect(tripRouteUrl({ start_latitude: 10, start_longitude: 20, end_latitude: null, end_longitude: null })).toBe('')
  })
})
