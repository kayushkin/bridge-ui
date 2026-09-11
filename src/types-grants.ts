// Grants, as grant-store (:8315) serves them.
//
// A grant is one relationship tuple: this principal (a human or a group from
// principal-store) stands in this relation to this resource. "Who may use
// what" lives there and nowhere else. The store owns the id — `grant_000001`,
// never a bare uuid, for the same reason principal-store prefixes its ids.

/** A kind of thing a grant can name. The vocabulary is served by
 * `GET /resource-types`, and the names are kanban-store's entity-type names,
 * so the stores speak of the same things the same way. */
export type GrantResourceType = 'agent' | 'instance' | 'machine' | 'skill' | 'tool'

/** One relation, as `GET /relations` describes it. The list is the store's,
 * never hardcoded here: a page builds its sections from what the store serves,
 * and a relation this library has no words for is shown under its own name. */
export interface GrantRelation {
  name: string
  /** The resource types a grant with this relation may name. */
  resource_types: GrantResourceType[]
  /** True when llm-bridge-server filters a session's offer by this relation.
   * False means the relation is a list someone reads, not a lock. */
  enforced: boolean
  description: string
}

/** One row of `GET /grants`, `GET /principals/{id}/effective`, and what
 * `POST /grants` answers. */
export interface Grant {
  /** `grant_000001`. */
  id: string
  seq: number
  /** The holder: a principal-store id, human or group. In an effective list,
   * equal to the principal asked about for its own grants and a group's id for
   * one it inherits. */
  principal_id: string
  relation: string
  resource_type: GrantResourceType
  /** The owning store's id, as text: agent-store's numeric `agents.id`,
   * skill-store's and tool-store's numeric ids, harness-store's instance and
   * machine ids. Never a name. */
  resource_id: string
  note: string
  /** Unix seconds. */
  granted_at: number
  /** Unix seconds. 0 while the grant is active. A revoked grant stays: the
   * store never deletes, so a session can always point at what offered it. */
  revoked_at: number
}

/** What `POST /grants` takes. */
export interface CreateGrantRequest {
  principal_id: string
  relation: string
  resource_type: GrantResourceType
  resource_id: string
  note?: string
}
