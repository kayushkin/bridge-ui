import { describe, expect, it } from 'vitest'
import { answerOwnerQuestion, resolutionSummary } from '../src/possessionRefs'
import {
  POSSESSION_REVIEW_PAGE_SIZE,
  choiceIndexForKey,
  photosWithOpenQuestions,
  questionAfter,
  questionsToAsk,
  readEveryPage,
  sightingBoxStyle,
  sightingState,
} from '../src/possessionReview'
import type { OwnerQuestion, PhotoReview } from '../src/types-possession-store'

function question(id: string, photoId: string, purpose: string, answeredAt = 0): OwnerQuestion {
  return {
    id, sighting_id: `sighting_${id}`, photo_id: photoId, purpose, question: `about ${id}`,
    choices: [
      { label: 'New', resolution: { action: 'accept' } },
      { label: 'Not mine', resolution: { action: 'reject' } },
    ],
    answer_choice: null, answer_text: '', resolution: null, answered_by: '', asked_at: 1, answered_at: answeredAt,
  }
}

function review(id: string, photoId: string): PhotoReview {
  return { id, photo_id: photoId, status: 'waiting_for_owner', error: '', queued_by: 'principal_000001', queued_at: 1, finished_at: 2, cost_usd: 0 }
}

/** A fake possession-store behind a host's fetch: it records each call and
 *  answers from `answer`. */
function fakeStore(answer: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return answer(url, init)
  }
  return { calls, fetchFn }
}

describe('answering an owner question', () => {
  it('posts the choice to the host and answers the question as the store now holds it', async () => {
    const answered = { ...question('possession_question_000001', 'photo_000001', 'decision', 5), answer_choice: 1, resolution: { action: 'reject' } }
    const store = fakeStore(() => new Response(JSON.stringify(answered), { status: 200 }))
    const result = await answerOwnerQuestion(store.fetchFn, '/api/possessions', 'possession_question_000001', { choice: 1 })
    expect(store.calls).toHaveLength(1)
    expect(store.calls[0].url).toBe('/api/possessions/owner-questions/possession_question_000001/answer')
    expect(store.calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(store.calls[0].init?.body))).toEqual({ choice: 1 })
    expect(result.resolution).toEqual({ action: 'reject' })
  })

  it('posts words as text and never signs the answer itself', async () => {
    const store = fakeStore(() => new Response(JSON.stringify(question('q', 'p', 'detail', 5)), { status: 200 }))
    await answerOwnerQuestion(store.fetchFn, '/api/possessions', 'q', { text: 'it is the blue one' })
    const body = JSON.parse(String(store.calls[0].init?.body))
    expect(body).toEqual({ text: 'it is the blue one' })
    expect(body).not.toHaveProperty('answered_by')
  })

  it('throws the store refusal with its status and words', async () => {
    const store = fakeStore(() => new Response('{"error":"already answered"}', { status: 409 }))
    await expect(answerOwnerQuestion(store.fetchFn, '/api/possessions', 'q', { choice: 0 }))
      .rejects.toThrow('possession-store answered 409: {"error":"already answered"}')
  })

  it('says what a detail answer did', () => {
    expect(resolutionSummary({ action: 'keep' }).text).toBe('Left as recorded')
    expect(resolutionSummary({ action: 'amend' }).text).toBe('Amended the possession')
  })
})

describe('reading every page', () => {
  it('pages until a page comes back short, keeping the route query', async () => {
    const full = Array.from({ length: POSSESSION_REVIEW_PAGE_SIZE }, (_, index) => index)
    const store = fakeStore((url) => new Response(JSON.stringify(url.includes('offset=0') ? full : [1, 2]), { status: 200 }))
    const rows = await readEveryPage<number>(store.fetchFn, '/api/possessions', '/owner-questions?purpose=decision')
    expect(rows).toHaveLength(POSSESSION_REVIEW_PAGE_SIZE + 2)
    expect(store.calls.map((call) => call.url)).toEqual([
      `/api/possessions/owner-questions?purpose=decision&limit=${POSSESSION_REVIEW_PAGE_SIZE}&offset=0`,
      `/api/possessions/owner-questions?purpose=decision&limit=${POSSESSION_REVIEW_PAGE_SIZE}&offset=${POSSESSION_REVIEW_PAGE_SIZE}`,
    ])
  })

  it('throws on a refusal rather than answering an empty list', async () => {
    const store = fakeStore(() => new Response('down', { status: 502 }))
    await expect(readEveryPage(store.fetchFn, '/api/possessions', '/photo-reviews')).rejects.toThrow('502')
  })
})

describe('the photos to go through', () => {
  const reviews = [review('photo_review_000001', 'photo_a'), review('photo_review_000002', 'photo_b'), review('photo_review_000003', 'photo_c')]
  const questions = [
    question('q1', 'photo_a', 'detail'),
    question('q2', 'photo_b', 'decision'),
    question('q3', 'photo_b', 'detail'),
    question('q4', 'photo_c', 'decision'),
    question('q5', 'photo_c', 'decision'),
    question('q6', 'photo_unreviewed', 'decision'),
    question('q7', 'photo_a', 'decision', 9),
  ]

  it('puts the most decision questions first and counts each purpose', () => {
    const { photos, photosWithoutReview } = photosWithOpenQuestions(questions, reviews, true)
    expect(photos).toEqual([
      { photoId: 'photo_c', photoReviewId: 'photo_review_000003', decisionQuestions: 2, detailQuestions: 0 },
      { photoId: 'photo_b', photoReviewId: 'photo_review_000002', decisionQuestions: 1, detailQuestions: 1 },
      { photoId: 'photo_a', photoReviewId: 'photo_review_000001', decisionQuestions: 0, detailQuestions: 1 },
    ])
    expect(photosWithoutReview).toEqual(['photo_unreviewed'])
  })

  it('leaves out photos with only detail questions unless asked', () => {
    expect(photosWithOpenQuestions(questions, reviews, false).photos.map((photo) => photo.photoId)).toEqual(['photo_c', 'photo_b'])
  })
})

describe('one photo\'s questions', () => {
  const open = [question('d1', 'p', 'detail'), question('c1', 'p', 'decision'), question('c2', 'p', 'decision'), question('x', 'p', 'decision', 3)]

  it('asks decisions first, then details when included, never answered ones', () => {
    expect(questionsToAsk(open, true).map((q) => q.id)).toEqual(['c1', 'c2', 'd1'])
    expect(questionsToAsk(open, false).map((q) => q.id)).toEqual(['c1', 'c2'])
  })

  it('moves to the next unanswered question, wrapping, and to none when all are answered', () => {
    const ordered = questionsToAsk(open, true)
    expect(questionAfter(ordered, 'c1', new Set(['c1']))).toBe('c2')
    expect(questionAfter(ordered, 'd1', new Set(['d1']))).toBe('c1')
    expect(questionAfter(ordered, 'c2', new Set(['c1', 'c2']))).toBe('d1')
    expect(questionAfter(ordered, 'd1', new Set(['c1', 'c2', 'd1']))).toBeNull()
  })
})

describe('boxes and keys', () => {
  it('colors a sighting by what became of it', () => {
    expect(sightingState({ status: 'accepted', possession_id: 'possession_000001' })).toBe('recorded')
    expect(sightingState({ status: 'proposed', possession_id: null })).toBe('waiting')
    expect(sightingState({ status: 'same_as_other_sighting', possession_id: null })).toBe('waiting')
    expect(sightingState({ status: 'rejected', possession_id: null })).toBe('rejected')
  })

  it('draws a box as percentages of the photo', () => {
    expect(sightingBoxStyle({ left: 0.1, top: 0.25, right: 0.5, bottom: 1 })).toEqual({ left: '10.00%', top: '25.00%', width: '40.00%', height: '75.00%' })
  })

  it('maps number keys to choices', () => {
    expect(choiceIndexForKey('1', 3)).toBe(0)
    expect(choiceIndexForKey('3', 3)).toBe(2)
    expect(choiceIndexForKey('4', 3)).toBeNull()
    expect(choiceIndexForKey('0', 3)).toBeNull()
    expect(choiceIndexForKey('n', 3)).toBeNull()
  })
})
