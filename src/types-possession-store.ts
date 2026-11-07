// possession-store's wire types, written by hand.
//
// Every other store's types come from its own generated package; possession-
// store has none yet — no `ts/` directory and no tygo config — and its
// possession view is a map the store assembles per kind, so tygo would have
// no struct to render for the record the chips read most. These mirror
// ~/repos/possession-store/CONTRACT.md ("Possession, as every read answers
// it") and the `Outfit`, `Purchase`, `PurchaseLine`, `PhotoReview`,
// `Sighting`, `Box`, `Proposal`, `OwnerQuestion`, `Choice` and `Resolution`
// structs in its outfits.go, purchases.go, images.go and review.go. They are
// partial on purpose: only what a chip or the host's review page reads. When possession-store renders its own package, import it
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
  possession_ids: string[]
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

/** Where in a photo a sighting is: each side a fraction 0–1 of the photo's
 *  width or height, from its left or top edge. */
export interface SightingBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** A possession as a reader proposes it: the store's `Proposal`. */
export interface Proposal {
  name: string
  brand: string
  model: string
  description: string
  quantity: number
  kind: string
  kind_fields: Record<string, unknown>
  dropped_fields?: string[]
  existing_possession_id?: string
  existing_sighting_id?: string
}

export interface Sighting {
  id: string
  photo_review_id: string
  photo_id: string
  label: string
  box: SightingBox
  /** What the store would record: the readers' agreed entry, or the first
   *  reader's when they differ. */
  proposed: Proposal
  /** Each reader's own entry by model id, when they differ. */
  versions: Record<string, Proposal>
  /** both_agree, readers_differ or one_reader_only. */
  agreement: string
  /** proposed, accepted, rejected or same_as_other_sighting. */
  status: string
  same_as_sighting_id: string | null
  possession_id: string | null
  decided_by: string
  decided_at: number
  question_ids: string[]
}

/** What answering a question does to its sighting. */
export interface Resolution {
  /** accept, same_as, same_as_sighting or reject for a decision question;
   *  keep or amend for a detail question. */
  action: string
  /** For accept, what is recorded; for amend, the possession as it now reads. */
  proposal?: Proposal
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
  /** decision: the sighting waits on the answer; detail: the sighting is
   *  recorded and the answer only adds to it. */
  purpose: string
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
