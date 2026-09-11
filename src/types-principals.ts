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
