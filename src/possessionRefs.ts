// What a possession-store reference chip shows, as pure rules so they are
// tested (test/possessionRefs.test.ts). The chips are in
// components/chat/RefChip.tsx; their data is possession-store's answer to the
// type's Get route, passed through by the host's resolver. The pictures and
// the answer to a question go through the host's proxy at
// `possessionStoreBasePath` (dash: /api/possessions).

import type { FetchFn } from './types'
import type { OwnerQuestion, Possession, PossessionProduct, Purchase, Resolution } from './types-possession-store'

/** The cut-out picture of a possession, a sighting or a question's sighting,
 *  through the host, or '' when the host does not carry possession-store.
 *  `route` is the store's route for the record (`possessions`, `sightings`,
 *  `owner-questions`). */
export function possessionStoreImageUrl(basePath: string, route: string, id: string): string {
  return basePath ? `${basePath}/${route}/${encodeURIComponent(id)}/image` : ''
}

/** Where an owner's answer is posted. */
export function ownerQuestionAnswerUrl(basePath: string, questionId: string): string {
  return `${basePath}/owner-questions/${encodeURIComponent(questionId)}/answer`
}

/** The body of an answer: a choice's index, or the owner's own words. dash
 *  signs it with the caller (answered_by), so the page never sends that. */
export function ownerQuestionAnswerBody(answer: { choice: number } | { text: string }): string {
  return JSON.stringify(answer)
}

/** Posts an owner's answer through the host and answers the question as the
 *  store now holds it, with its resolution. A refusal (a second answer is a
 *  409) is thrown with the store's status and words, never swallowed. */
export async function answerOwnerQuestion(
  fetchFn: FetchFn,
  basePath: string,
  questionId: string,
  answer: { choice: number } | { text: string },
): Promise<OwnerQuestion> {
  const response = await fetchFn(ownerQuestionAnswerUrl(basePath, questionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: ownerQuestionAnswerBody(answer),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`possession-store answered ${response.status}: ${text}`)
  return JSON.parse(text) as OwnerQuestion
}

/** A kind's name in words: `computer_part` → "computer part"; no kind → "". */
export function possessionKindLabel(kind: string): string {
  return kind.replace(/_/g, ' ')
}

/** A possession's name on a chip, with how many when there are several. */
export function possessionChipLabel(possession: Pick<Possession, 'name' | 'quantity'>): string {
  return possession.quantity > 1 ? `${possession.name} ×${possession.quantity}` : possession.name
}

/** Brand and model together, or '' when neither is known. */
export function possessionMakeLabel(possession: Pick<Possession, 'brand' | 'model'>): string {
  return [possession.brand, possession.model].filter((part) => part !== '').join(' ')
}

/** Money in its currency, or '' when there is no amount. */
export function moneyLabel(cents: number | null | undefined, currency: string): string {
  if (cents == null) return ''
  if (!currency) return `${(cents / 100).toFixed(2)}`
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  } catch {
    // A code Intl does not know: show it as the store wrote it.
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** One fact of a possession's kind record: a field's name in words and its
 *  value as text, or `ids` when the field holds ids of other records (a
 *  `…_id` or `…_ids` field), which the chip draws as chips. */
export interface KindFact {
  label: string
  text: string
  ids: string[]
}

/** The facts of a possession's kind record, in the store's field order, with
 *  the record's own id and every empty field left out. The fields are read
 *  off the record, not listed here, so a column the store adds shows up. */
export function possessionKindFacts(possession: Possession): KindFact[] {
  if (!possession.kind) return []
  const record = possession[possession.kind]
  if (record === null || typeof record !== 'object') return []
  const facts: KindFact[] = []
  for (const [field, value] of Object.entries(record as Record<string, unknown>)) {
    if (field === 'id' || value === null || value === '' || (value === 0 && field.endsWith('_at'))) continue
    if (Array.isArray(value) && value.length === 0) continue
    const label = field.replace(/_/g, ' ')
    if (field.endsWith('_id') && typeof value === 'string') {
      facts.push({ label, text: '', ids: [value] })
    } else if (field.endsWith('_ids') && Array.isArray(value)) {
      facts.push({ label, text: '', ids: value.map(String) })
    } else if (field.endsWith('_at') && typeof value === 'number') {
      facts.push({ label, text: new Date(value * 1000).toLocaleDateString(), ids: [] })
    } else if (Array.isArray(value)) {
      facts.push({ label, text: value.join(', '), ids: [] })
    } else {
      facts.push({ label, text: String(value), ids: [] })
    }
  }
  return facts
}

/** The records a possession links to that are not part of its kind record:
 *  a garment's outfits and a computer's installed parts. */
export function possessionLinkedIds(possession: Possession): { label: string; ids: string[] }[] {
  const linked: { label: string; ids: string[] }[] = []
  if (possession.outfit_ids && possession.outfit_ids.length > 0) linked.push({ label: 'Outfits', ids: possession.outfit_ids })
  if (possession.installed_part_ids && possession.installed_part_ids.length > 0) {
    linked.push({ label: 'Parts', ids: possession.installed_part_ids })
  }
  return linked
}

/** A question's name on a chip: its first words. */
export function questionChipLabel(question: Pick<OwnerQuestion, 'question'>, words = 6): string {
  const all = question.question.trim().split(/\s+/).filter((word) => word !== '')
  if (all.length === 0) return 'question'
  return all.length > words ? `${all.slice(0, words).join(' ')}…` : all.join(' ')
}

/** What an answer did, in words, with the id it points at for a chip. */
export function resolutionSummary(resolution: Resolution): { text: string; id: string } {
  switch (resolution.action) {
    case 'accept':
      return { text: 'Recorded as a new possession', id: resolution.possession_id ?? '' }
    case 'same_as':
      return { text: 'The same as', id: resolution.possession_id ?? '' }
    case 'same_as_sighting':
      return { text: 'The same as the sighting', id: resolution.sighting_id ?? '' }
    case 'reject':
      return { text: 'Not a possession', id: '' }
    case 'keep':
      return { text: 'Left as recorded', id: '' }
    case 'amend':
      return { text: 'Amended the possession', id: '' }
    case 'order_line_link':
      return { text: 'Came from the order', id: resolution.budget_transaction_id || resolution.marketplace_order_line_id || '' }
    case 'order_line_not_this':
      return { text: 'Not from that order', id: resolution.marketplace_order_line_id ?? '' }
    case 'withdrawn':
      return { text: 'Withdrawn', id: '' }
    default:
      return { text: resolution.action, id: '' }
  }
}

/** The link text for a product's listing: whose page it is, and what kind
 *  of source, when it is not the maker's own. */
export function productListingLabel(product: Pick<PossessionProduct, 'listing_url' | 'listing_source' | 'listing_publisher'>): string {
  let host = product.listing_url
  try {
    host = new URL(product.listing_url).host
  } catch {
    // Not a URL the browser parses: show it as stored.
  }
  const who = product.listing_publisher || host
  return product.listing_source === 'manufacturer' ? `${who} (official)` : `${who} (${product.listing_source})`
}

/** A purchase's name on a chip: who sold it and the order, or the seller. */
export function purchaseChipLabel(purchase: Pick<Purchase, 'seller' | 'order_reference' | 'marketplace'>): string {
  const seller = purchase.seller || purchase.marketplace || 'purchase'
  return purchase.order_reference ? `${seller} ${purchase.order_reference}` : seller
}
