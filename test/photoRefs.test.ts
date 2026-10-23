import { describe, expect, it } from 'vitest'
import { photoChipLabel, photoDateSourceLabel, photoMapUrl, photoThumbnailUrl } from '../src/photoRefs'

describe('photo chips', () => {
  it('draws the thumbnail through the host, or not at all', () => {
    expect(photoThumbnailUrl('/api/photos', 'photo_000123')).toBe('/api/photos/photos/photo_000123/thumbnail')
    expect(photoThumbnailUrl('', 'photo_000123')).toBe('')
  })
  it('names a photo by its day, unless the day is unknown', () => {
    expect(photoChipLabel({ taken_at: 1300000000, date_source: 'exif' })).toMatch(/^photo 2011-03-1[23]$/)
    expect(photoChipLabel({ taken_at: 0, date_source: 'unknown' })).toBe('photo')
  })
  it('says how far to trust the date', () => {
    expect(photoDateSourceLabel('exif')).toBe('from the camera')
    expect(photoDateSourceLabel('mtime')).toMatch(/copy/)
  })
  it('links a map only when there is a place', () => {
    expect(photoMapUrl({ latitude: 39.52963, longitude: -119.8138 })).toBe('https://www.openstreetmap.org/?mlat=39.52963&mlon=-119.81380#map=16/39.52963/-119.81380')
    expect(photoMapUrl({ latitude: null, longitude: null })).toBe('')
  })
})
