import { describe, expect, it } from 'vitest'
import {
  distanceLabel, durationLabel, placeChipLabel, pointMapUrl, tripChipLabel, tripModeGlyph, tripRouteUrl, visitChipLabel,
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
    expect(tripChipLabel({ title: 'Lake weekend', mode: 'mixed', started_at: 1300000000, distance_meters: null })).toBe('Lake weekend')
    expect(tripChipLabel({ title: '', mode: 'driving', started_at: 1300000000, distance_meters: 42000 })).toMatch(/^driving 2011-03-1[23] 42 km$/)
    expect(tripChipLabel({ title: '', mode: 'unknown', started_at: 1300000000, distance_meters: null })).toMatch(/^trip 2011-03-1[23]$/)
    expect(tripModeGlyph('flying')).toBe('✈')
    expect(tripModeGlyph('teleport')).toBe('🧭')
  })
  it('links a map only when there is a place', () => {
    expect(pointMapUrl(10.5, 20.5)).toBe('https://www.openstreetmap.org/?mlat=10.50000&mlon=20.50000#map=16/10.50000/20.50000')
    expect(pointMapUrl(null, 20.5)).toBe('')
    expect(tripRouteUrl({ start_latitude: 10, start_longitude: 20, end_latitude: 10.5, end_longitude: 20.5 }))
      .toBe('https://www.openstreetmap.org/directions?route=10.00000%2C20.00000%3B10.50000%2C20.50000')
    expect(tripRouteUrl({ start_latitude: 10, start_longitude: 20, end_latitude: null, end_longitude: null })).toBe('')
  })
})
