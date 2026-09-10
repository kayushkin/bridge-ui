// bundle-store's wire types (bundle.go and resolve.go in that repo), plus the
// repo-store row the resolve preview picks from.
//
// A member is the id its owning store assigned — skill-store's for 'skill',
// tool-store's for 'tool'. `name` is a display label and is never read back to
// find a member: skill names are not unique across skill-store's sources.

export type BundleMemberKind = 'skill' | 'tool'

export interface BundleMember {
  kind: BundleMemberKind
  id: number
  name?: string
  /** A task tag that gates the member: it is added only when the resolve
   *  request's task tags contain it. */
  condition?: string
}

/** A resolved member: the owning store's id, with the name for display. */
export interface BundleMemberRef {
  id: number
  name?: string
}

/** A bundle that contributed to a resolution, by bundle-store id. */
export interface BundleRef {
  id: number
  name: string
}

export interface Bundle {
  id: number
  name: string
  display_name?: string
  description?: string
  /** The parent bundle's id. `extends` carries its name for display. */
  extends_id?: number
  extends?: string
  match_tags?: string[] | null
  members?: BundleMember[] | null
  model?: string
  effort?: string
  enabled: boolean
  created_at: number
  updated_at: number
}

/** `POST /resolve`'s answer. Go encodes an empty slice as null. */
export interface BundleResolution {
  bundles: BundleRef[] | null
  skills: BundleMemberRef[] | null
  tools: BundleMemberRef[] | null
  model?: string
  effort?: string
}

/** One repository as repo-store's `GET /repos` returns it. */
export interface RepoStoreRepo {
  id: number
  name: string
  path?: string
  git_remote?: string
  tags: string[] | null
  /** The tags a resolve request sends as `repo_tags`. */
  effective_tags: string[] | null
  created_at: number
  updated_at: number
}
