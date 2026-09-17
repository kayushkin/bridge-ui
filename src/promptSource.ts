// Wire types and pure rules for the prompt source (agent-store's
// prompt_collections / prompt_sections / prompt_drifts), kept out of the
// component so they can be tested without rendering anything.
//
// Nothing here names a prompt file or a harness. File names and delivery kinds
// are served by agent-store at GET /prompt-delivery-options and harness ids by
// GET /prompt-harness-deliveries; a copy here would go stale the day a harness
// is added.

export interface PromptCollection {
  id: number
  slug: string
  title: string
  scope: 'global' | 'project'
  root_path: string
  description?: string
  created_at: number
  updated_at: number
}

export interface PromptSection {
  id: number
  collection_id: number
  title: string
  heading: string
  body: string
  tags: string[]
  position: number
  enabled: boolean
  created_at: number
  updated_at: number
}

export interface PromptSectionRevision {
  id: number
  section_id: number
  collection_id: number
  operation: 'create' | 'update' | 'delete'
  title: string
  heading: string
  body: string
  tags: string[]
  position: number
  enabled: boolean
  source: string
  drift_id?: number
  note?: string
  created_at: number
}

export interface PromptCollectionOutput {
  id: number
  collection_id: number
  relative_path: string
  path: string
  enabled: boolean
  accounted_sha256?: string
  accounted_at?: number
  exists_on_disk: boolean
  disk_sha256?: string
  drifted: boolean
  matches_render: boolean
  tracked_file_id?: number
}

export interface PromptDriftOperation {
  kind: 'update' | 'insert' | 'delete'
  section_id?: number
  after_section_id?: number
  before_section_id?: number
  heading?: string
  body?: string
  title?: string
  tags?: string[]
}

export interface PromptDriftInsertedSectionLabel {
  operation_index: number
  title?: string
  tags: string[]
}

export interface PromptDriftAnnotation {
  note?: string
  inserted_sections?: PromptDriftInsertedSectionLabel[]
  annotated_by?: string
}

export interface PromptDrift {
  id: number
  collection_id: number
  output_id: number
  path: string
  accounted_sha256?: string
  disk_sha256: string
  status: string
  held_reason?: string
  operations: PromptDriftOperation[]
  annotation?: PromptDriftAnnotation
  created_at: number
  resolved_at?: number
}

export interface PromptCollectionView {
  collection: PromptCollection
  sections: PromptSection[]
  outputs: PromptCollectionOutput[]
  rendered: string
  open_drifts: PromptDrift[]
}

export interface PromptRenderResult {
  view: PromptCollectionView
  written_files: { id: number; path: string }[]
  refused_reason?: string
}

export interface PromptHarnessDelivery {
  harness: string
  delivery: string
  native_relative_path?: string
  note?: string
  updated_at: number
}

export interface PromptDeliveryOptions {
  deliveries: string[]
  prompt_file_names: string[]
  harness_config_directory_names: string[]
  drift_statuses: string[]
  tracked_file_ignore_rule_kinds: string[]
  deepest_section_heading_level: number
}

export interface ResolvedContextEntry {
  collection_id: number
  slug: string
  scope: string
  root_path: string
  bytes: number
  injected: boolean
  read_natively_from?: string
}

export interface ResolvedContext {
  harness: string
  work_dir?: string
  delivery: string
  content: string
  manifest: ResolvedContextEntry[]
}

export type PromptOutputState = 'disabled' | 'not_written' | 'edited_on_disk' | 'in_sync' | 'behind'

/**
 * What one output file looks like next to the sections, in the order the
 * answers matter: an edit on disk outranks everything, because a render
 * refuses to run until it is settled.
 */
export function promptOutputState(output: PromptCollectionOutput): PromptOutputState {
  if (!output.enabled) return 'disabled'
  if (!output.exists_on_disk) return 'not_written'
  if (output.drifted) return 'edited_on_disk'
  if (output.matches_render) return 'in_sync'
  return 'behind'
}

export const PROMPT_OUTPUT_STATE_LABEL: Record<PromptOutputState, string> = {
  disabled: 'not rendered to',
  not_written: 'not written yet',
  edited_on_disk: 'edited on disk',
  in_sync: 'in sync',
  behind: 'behind the sections',
}

/** True when a render would change at least one file. */
export function collectionNeedsRender(view: PromptCollectionView): boolean {
  return view.outputs.some(output => {
    const state = promptOutputState(output)
    return state === 'behind' || state === 'not_written'
  })
}

/** Tags typed as "a, b  c" → ['a', 'b', 'c'], lowercased, de-duplicated, sorted: the form agent-store stores. */
export function parseTagInput(input: string): string[] {
  const seen = new Set<string>()
  for (const raw of input.split(/[,\s]+/)) {
    const tag = raw.trim().toLowerCase()
    if (tag) seen.add(tag)
  }
  return [...seen].sort()
}

export function allTags(sections: PromptSection[]): string[] {
  const seen = new Set<string>()
  for (const section of sections) for (const tag of section.tags) seen.add(tag)
  return [...seen].sort()
}

export function sectionMatchesFilter(section: PromptSection, tag: string | null, query: string): boolean {
  if (tag && !section.tags.includes(tag)) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  return section.title.toLowerCase().includes(q) || section.heading.toLowerCase().includes(q) || section.body.toLowerCase().includes(q)
}

/** One line per operation, for the drift inbox. */
export function describeDriftOperation(operation: PromptDriftOperation, sectionsById: Map<number, PromptSection>): string {
  const known = operation.section_id ? sectionsById.get(operation.section_id) : undefined
  switch (operation.kind) {
    case 'update': {
      const was = known?.heading ?? `section ${operation.section_id}`
      return operation.heading && known && operation.heading !== known.heading
        ? `edits ${was} and renames it to ${operation.heading}`
        : `edits ${was || 'the preamble'}`
    }
    case 'insert':
      return `adds ${operation.heading || 'a preamble'}`
    case 'delete':
      return `removes ${known?.heading ?? operation.heading ?? `section ${operation.section_id}`}`
  }
}

/**
 * The labels to send when approving a drift: one entry per added section, from
 * what is typed in the inbox. Keyed by operation index because that is how
 * agent-store addresses them.
 */
export function annotationFromLabelDrafts(
  drift: PromptDrift,
  tagInputByOperationIndex: Record<number, string>,
  note: string,
): PromptDriftAnnotation {
  const inserted: PromptDriftInsertedSectionLabel[] = []
  drift.operations.forEach((operation, index) => {
    if (operation.kind !== 'insert') return
    const stored = drift.annotation?.inserted_sections?.find(label => label.operation_index === index)
    const typed = tagInputByOperationIndex[index]
    inserted.push({
      operation_index: index,
      title: stored?.title,
      tags: typed !== undefined ? parseTagInput(typed) : stored?.tags ?? [],
    })
  })
  return { note: note.trim() || drift.annotation?.note, inserted_sections: inserted, annotated_by: drift.annotation?.annotated_by }
}

/** The body a section write sends. `position` 0 tells agent-store to keep (update) or append (create). */
export function sectionWriteBody(draft: { title: string; heading: string; body: string; tagInput: string; enabled: boolean; note: string }) {
  return {
    title: draft.title.trim(),
    heading: draft.heading.trim(),
    body: draft.body,
    tags: parseTagInput(draft.tagInput),
    enabled: draft.enabled,
    note: draft.note.trim(),
  }
}
