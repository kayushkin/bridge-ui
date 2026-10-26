// What a photo reference chip shows, as pure rules so they are tested
// (test/photoRefs.test.ts). The chip is PhotoRefChip in
// components/chat/RefChip.tsx; its data is photo-store's answer to
// GET /photos/{id}, passed through by the host's resolver.

import type { Photo } from '@kayushkin/photo-store-types'
import { calendarDayOf } from './journalRefs'

/** Where the thumbnail is, through the host's proxy, or '' when the host does
 *  not carry photo-store. */
export function photoThumbnailUrl(photoStoreBasePath: string, id: string): string {
  return photoStoreBasePath ? `${photoStoreBasePath}/photos/${encodeURIComponent(id)}/thumbnail` : ''
}

/** A photo's name on a chip: the day it was taken, or "photo" when unknown. */
export function photoChipLabel(photo: Pick<Photo, 'taken_at' | 'date_source'>): string {
  if (photo.date_source === 'unknown' || !photo.taken_at) return 'photo'
  return `photo ${calendarDayOf(photo.taken_at)}`
}

/** How far to trust the date, in words. */
export function photoDateSourceLabel(dateSource: string): string {
  switch (dateSource) {
    case 'exif': return 'from the camera'
    case 'filename': return 'from the file name'
    case 'mtime': return 'from the file date, which a copy can change'
    case 'message': return 'when it was sent in a chat'
    case 'upload': return 'when it was posted online'
    default: return 'unknown'
  }
}

/** A map link for the photo's GPS, or '' when it has none. */
export function photoMapUrl(photo: Pick<Photo, 'latitude' | 'longitude'>): string {
  if (photo.latitude == null || photo.longitude == null) return ''
  const lat = photo.latitude.toFixed(5)
  const lon = photo.longitude.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}
