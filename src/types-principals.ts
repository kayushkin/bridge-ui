// Principals, as principal-store (:8314) serves them.
//
// A principal is whoever a card can be assigned to: a human or a group. The
// store owns the id — `principal_000001`, never a bare uuid, for the same
// reason prediction-store prefixes its ids: dash's resolver probes every
// entity-type row whose id pattern matches, and noteboard already claims the
// uuid shape. Cards join on `id`; `display_name` rides along for display only.

export type PrincipalKind = 'human' | 'group'

export interface Principal {
  /** `principal_000001`. The only thing a card assignment stores. */
  id: string
  kind: PrincipalKind
  display_name: string
  email: string
  /** Unix seconds. 0 while the principal is active; set once they are
   * disabled. A disabled principal still resolves — a card assigned to someone
   * who left must keep showing their name — but is never offered again. */
  disabled_at: number
  /** Unix seconds. */
  created_at: number
  /** Unix seconds. */
  updated_at: number
  /** The declared working week, for a human who has one. OMITTED entirely when
   * there is none — which is the common case and means unknown, not "always".
   * A group never carries one. */
  availability?: Availability
}

/** What `GET /principals/{id}` returns: the row plus its memberships, computed
 * on read. Exactly one of the two lists is present — `groups` for a human,
 * `members` for a group — so the kind can be read off the shape as well as off
 * `kind`. Neither is expanded by the `GET /principals` listing. */
export interface PrincipalDetail extends Principal {
  /** A human's groups. Present (possibly empty) for a human, absent for a group. */
  groups?: Principal[]
  /** A group's human members. Present (possibly empty) for a group, absent for a human. */
  members?: Principal[]
}

/** What `PUT /principals/{group}/members/{member}` answers: 201 with
 * `created: true` the first time, 200 with `created: false` after. */
export interface GroupMembership {
  group_id: string
  member_id: string
  created: boolean
}

// --- Availability ------------------------------------------------------------
//
// A human's declared working week, and the absences beside it. Added to
// principal-store on 2026-09-11 so kanban-store can hand a card to someone who
// is actually working. There is no measured presence here — no heartbeat, no
// "last seen" — so the declared week is the whole signal.

/** A human's working week, in that human's own zone: a Los Angeles board can
 * have an Amsterdam member, and each is read where they are. The same shape as
 * a kanban board's `business_hours`, deliberately.
 *
 * ⚠️ Absent means UNKNOWN, and unknown is never available. There is no default
 * zone and none may be invented: a guessed zone makes someone look free at 3am,
 * and an assignment made on that guess is worse than no assignment. */
export interface Availability {
  /** An IANA zone principal-store's host can load. Never defaulted. */
  tzid: string
  /** RFC 5545 day codes, served at `GET /weekday-codes`. At least one. */
  days: string[]
  /** `HH:MM` in `tzid`. */
  start: string
  /** `HH:MM` in `tzid`, after `start`. The window is half-open, so a week
   * ending 17:00 is off hours at 17:00 exactly. */
  end: string
}

/** One absence: a half-open range of absolute instants, so it means the same
 * moment wherever it is read. `timeoff_000001`; the one table here that really
 * is hard-deleted, because nothing joins on it. */
export interface TimeOff {
  id: string
  seq: number
  principal_id: string
  /** Unix seconds, inclusive. */
  starts_at: number
  /** Unix seconds, exclusive. */
  ends_at: number
  note: string
  created_at: number
}

/** `GET /principals/{id}/availability?at=`: the week and the absences reduced
 * to one answer, with the single reason that decided it. */
export interface AvailabilityAnswer {
  principal_id: string
  /** The instant asked about, in Unix seconds. */
  at: number
  available: boolean
  /** One of `GET /availability-reasons` — the store owns the vocabulary, so a
   * reader that meets a reason it does not know must say so rather than
   * guess. */
  reason: string
}
