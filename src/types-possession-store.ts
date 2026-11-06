// possession-store's wire types, written by hand.
//
// Every other store's types come from its own generated package; possession-
// store has none yet — no `ts/` directory and no tygo config — and its
// possession view is a map the store assembles per kind, so tygo would have
// no struct to render for the record the chips read most. These mirror
// ~/repos/possession-store/CONTRACT.md ("Possession, as every read answers
// it") and the `Outfit`, `Purchase`, `PurchaseLine`, `PhotoReview`,
// `Sighting`, `OwnerQuestion`, `Choice` and `Resolution` structs in its
// outfits.go, purchases.go and review.go. They are partial on purpose: only
// what a chip reads. When possession-store renders its own package, import it
// and delete this file.

/** One photo a possession appears on, with where in it (fractions 0–1). */
export interface PossessionPhoto {
  photo_id: string
  box_left: number | null
  box_top: number | null
  box_right: number | null
  box_bottom: number | null
  is_cover: boolean
  sighting_id: string | null
  linked_by: string
  linked_at: number
}

/** A possession as every possession read answers it, a kind route's read
 *  included: `id` is always the possession's, and the kind record, when there
 *  is one, sits under the key `kind` names (`garment`, `computer`…). */
export interface Possession {
  id: string
  name: string
  brand: string
  model: string
  serial_number: string
  description: string
  quantity: number
  condition: string
  status: string
  place_id: string | null
  spot: string
  acquired_at: number
  acquired_how: string
  purchase_line_id: string | null
  price_cents: number | null
  price_currency: string
  disposed_at: number
  tags: string[]
  created_by: string
  created_at: number
  updated_at: number
  deleted_at: number
  /** "" for a possession with no kind. */
  kind: string
  photos: PossessionPhoto[]
  cover_photo_id: string | null
  /** A garment's outfits. */
  outfit_ids?: string[]
  /** A computer's parts (`computer_part_…`). */
  installed_part_ids?: string[]
  /** The kind record, under the key `kind` names. */
  [kindRecord: string]: unknown
}

export interface Outfit {
  id: string
  name: string
  occasion: string
  weather: string
  status: string
  reasoning: string
  preview_image_path: string
  created_by: string
  created_at: number
  updated_at: number
  deleted_at: number
  garment_ids: string[]
  worn_on: string[]
}

export interface PurchaseLine {
  id: string
  line_number: number
  title: string
  quantity: number
  unit_price_cents: number | null
  product_reference: string
  disposition: string
  possession_ids: string[]
}

export interface Purchase {
  id: string
  seller: string
  marketplace: string
  order_reference: string
  ordered_at: number
  total_cents: number | null
  currency: string
  source: string
  created_at: number
  lines: PurchaseLine[]
}

export interface PhotoReview {
  id: string
  photo_id: string
  status: string
  error: string
  queued_by: string
  queued_at: number
  finished_at: number
  sightings?: Sighting[]
  cost_usd: number
}

export interface Sighting {
  id: string
  photo_review_id: string
  photo_id: string
  label: string
  agreement: string
  status: string
  same_as_sighting_id: string | null
  possession_id: string | null
  decided_by: string
  decided_at: number
  question_ids: string[]
}

/** What answering a question does to its sighting. */
export interface Resolution {
  /** accept, same_as, same_as_sighting or reject. */
  action: string
  possession_id?: string
  sighting_id?: string
  explanation?: string
}

export interface Choice {
  label: string
  resolution: Resolution
}

export interface OwnerQuestion {
  id: string
  sighting_id: string
  photo_id: string
  question: string
  choices: Choice[]
  answer_choice: number | null
  answer_text: string
  /** null until answered. */
  resolution: Resolution | null
  answered_by: string
  asked_at: number
  answered_at: number
}
