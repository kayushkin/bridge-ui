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
