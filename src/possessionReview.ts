// The rules of a host's page for answering possession-store's owner questions
// photo by photo (dash: /possession-review), as plain functions so they are
// tested (test/possessionReview.test.ts). The page itself is the host's; it
// reads possession-store through its proxy at `possessionStoreBasePath` and
// answers with `answerOwnerQuestion` from possessionRefs.ts.

import type { FetchFn } from './types'
import type { OwnerQuestion, PhotoReview, Sighting, SightingBox } from './types-possession-store'

/** How many records one read asks for while paging through a list. */
export const POSSESSION_REVIEW_PAGE_SIZE = 500

/** Reads every row of a possession-store list route, a page at a time, until
 *  a page comes back short. `route` carries its own query, if any. */
export async function readEveryPage<Row>(fetchFn: FetchFn, basePath: string, route: string): Promise<Row[]> {
  const rows: Row[] = []
  const separator = route.includes('?') ? '&' : '?'
  for (let offset = 0; ; offset += POSSESSION_REVIEW_PAGE_SIZE) {
    const url = `${basePath}${route}${separator}limit=${POSSESSION_REVIEW_PAGE_SIZE}&offset=${offset}`
    const response = await fetchFn(url)
    const text = await response.text()
    if (!response.ok) throw new Error(`possession-store answered ${response.status} to ${route}: ${text}`)
    const page = JSON.parse(text) as Row[]
    rows.push(...page)
    if (page.length < POSSESSION_REVIEW_PAGE_SIZE) return rows
  }
}

/** One photo that has open questions, with how many of each purpose. */
export interface PhotoWithOpenQuestions {
  photoId: string
  photoReviewId: string
  decisionQuestions: number
  detailQuestions: number
}

/** The photos to go through: each photo with an open question, joined to its
 *  review by photo id (possession-store keeps one review per photo). Photos
 *  with decision questions come first, the most first; then, when detail
 *  questions are included, photos with only those. Without them a photo with
 *  only detail questions is left out. A photo whose review is not among
 *  `reviews` is named in `photosWithoutReview` rather than dropped quietly. */
export function photosWithOpenQuestions(
  openQuestions: OwnerQuestion[],
  reviews: PhotoReview[],
  includeDetail: boolean,
): { photos: PhotoWithOpenQuestions[]; photosWithoutReview: string[] } {
  const reviewIdByPhotoId = new Map(reviews.map((review) => [review.photo_id, review.id]))
  const byPhoto = new Map<string, PhotoWithOpenQuestions>()
  const photosWithoutReview: string[] = []
  for (const question of openQuestions) {
    if (question.answered_at !== 0) continue
    let photo = byPhoto.get(question.photo_id)
    if (!photo) {
      const photoReviewId = reviewIdByPhotoId.get(question.photo_id)
      if (photoReviewId === undefined) {
        if (!photosWithoutReview.includes(question.photo_id)) photosWithoutReview.push(question.photo_id)
        continue
      }
      photo = { photoId: question.photo_id, photoReviewId, decisionQuestions: 0, detailQuestions: 0 }
      byPhoto.set(question.photo_id, photo)
    }
    if (question.purpose === 'decision') photo.decisionQuestions += 1
    else photo.detailQuestions += 1
  }
  const photos = [...byPhoto.values()]
    .filter((photo) => photo.decisionQuestions > 0 || includeDetail)
    .sort(
      (a, b) =>
        b.decisionQuestions - a.decisionQuestions ||
        b.detailQuestions - a.detailQuestions ||
        a.photoReviewId.localeCompare(b.photoReviewId),
    )
  return { photos, photosWithoutReview }
}

/** One photo's open questions in the order to ask them: decision questions
 *  first, then detail questions when included, each in the store's order
 *  (oldest first). */
export function questionsToAsk(openQuestions: OwnerQuestion[], includeDetail: boolean): OwnerQuestion[] {
  const open = openQuestions.filter((question) => question.answered_at === 0)
  const decisions = open.filter((question) => question.purpose === 'decision')
  const details = includeDetail ? open.filter((question) => question.purpose !== 'decision') : []
  return [...decisions, ...details]
}

/** The question to select after `answeredId` is answered: the next one after
 *  it in `ordered`, else the first before it that is still unanswered, else
 *  null when none is left. `answeredIds` holds every question answered on
 *  this page, the new one included. */
export function questionAfter(ordered: OwnerQuestion[], answeredId: string, answeredIds: ReadonlySet<string>): string | null {
  const position = ordered.findIndex((question) => question.id === answeredId)
  const rotated = position < 0 ? ordered : [...ordered.slice(position + 1), ...ordered.slice(0, position)]
  const next = rotated.find((question) => question.id !== answeredId && !answeredIds.has(question.id))
  return next ? next.id : null
}

/** What a sighting's box shows by its color: recorded (it has a possession),
 *  rejected, or waiting on the owner. */
export type SightingState = 'recorded' | 'waiting' | 'rejected'

export function sightingState(sighting: Pick<Sighting, 'status' | 'possession_id'>): SightingState {
  if (sighting.status === 'rejected') return 'rejected'
  if (sighting.possession_id) return 'recorded'
  return 'waiting'
}

/** A box as CSS percentages of the photo it is drawn over. */
export function sightingBoxStyle(box: SightingBox): { left: string; top: string; width: string; height: string } {
  const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`
  return {
    left: percent(box.left),
    top: percent(box.top),
    width: percent(box.right - box.left),
    height: percent(box.bottom - box.top),
  }
}

/** The choice a number key picks: `1` is the first choice, up to `9`; null
 *  for any other key or a number past the last choice. */
export function choiceIndexForKey(key: string, choiceCount: number): number | null {
  if (!/^[1-9]$/.test(key)) return null
  const index = Number(key) - 1
  return index < choiceCount ? index : null
}
