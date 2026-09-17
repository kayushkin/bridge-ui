import { describe, expect, it } from 'vitest'
import {
  annotationFromLabelDrafts, collectionNeedsRender, describeDriftOperation, filterSectionGroups, groupSections, parseTagInput,
  promptOutputState, sectionMatchesFilter,
  type PromptCollectionOutput, type PromptDrift, type PromptSection,
} from '../src/promptSource'

const output = (over: Partial<PromptCollectionOutput>): PromptCollectionOutput => ({
  id: 1, collection_id: 1, relative_path: 'X.md', path: '/h/X.md', enabled: true,
  exists_on_disk: true, drifted: false, matches_render: true, ...over,
})

const section = (over: Partial<PromptSection>): PromptSection => ({
  id: 1, collection_id: 1, level: 2, title: 'Scheduler', heading: '## Scheduler', body: 'cron jobs', tags: ['scheduler'],
  position: 100, enabled: true, created_at: 0, updated_at: 0, ...over,
})

describe('promptOutputState', () => {
  it('ranks an edit on disk above being behind', () => {
    expect(promptOutputState(output({ drifted: true, matches_render: false }))).toBe('edited_on_disk')
  })
  it('tells behind from in sync from not written', () => {
    expect(promptOutputState(output({}))).toBe('in_sync')
    expect(promptOutputState(output({ matches_render: false }))).toBe('behind')
    expect(promptOutputState(output({ exists_on_disk: false, matches_render: false }))).toBe('not_written')
    expect(promptOutputState(output({ enabled: false, drifted: true }))).toBe('disabled')
  })
  it('asks for a render only when one would write something', () => {
    const view = { collection: {} as never, sections: [], rendered: '', open_drifts: [] }
    expect(collectionNeedsRender({ ...view, outputs: [output({})] })).toBe(false)
    expect(collectionNeedsRender({ ...view, outputs: [output({}), output({ matches_render: false })] })).toBe(true)
    expect(collectionNeedsRender({ ...view, outputs: [output({ drifted: true, matches_render: false })] })).toBe(false)
  })
})

describe('tags', () => {
  it('normalises the way agent-store stores them', () => {
    expect(parseTagInput(' Stores, scheduler  stores,')).toEqual(['scheduler', 'stores'])
    expect(parseTagInput('')).toEqual([])
  })
  it('filters on tag and text together', () => {
    expect(sectionMatchesFilter(section({}), 'scheduler', 'CRON')).toBe(true)
    expect(sectionMatchesFilter(section({}), 'stores', '')).toBe(false)
    expect(sectionMatchesFilter(section({}), null, 'plumber')).toBe(false)
  })
})

describe('drift inbox', () => {
  const drift: PromptDrift = {
    id: 3, collection_id: 1, output_id: 1, path: '/h/X.md', disk_sha256: 'abc', status: 'held',
    operations: [
      { kind: 'update', section_id: 1, heading: '## Scheduler', body: 'new' },
      { kind: 'insert', after_section_id: 1, heading: '## Reminders', body: 'one coordinator' },
      { kind: 'delete', section_id: 9, heading: '## Gone' },
    ],
    annotation: { note: 'from the tagger', annotated_by: 'tagger', inserted_sections: [{ operation_index: 1, tags: ['reminders'] }] },
    created_at: 0,
  }
  const byId = new Map([[1, section({})]])

  it('describes each operation in words', () => {
    expect(drift.operations.map(operation => describeDriftOperation(operation, byId))).toEqual([
      'edits ## Scheduler', 'adds ## Reminders', 'removes ## Gone',
    ])
    expect(describeDriftOperation({ kind: 'update', section_id: 1, heading: '## Cron' }, byId)).toBe('edits ## Scheduler and renames it to ## Cron')
  })
  it('keeps the tagger labels unless the operator typed over them, and labels inserts only', () => {
    expect(annotationFromLabelDrafts(drift, {}, '').inserted_sections).toEqual([{ operation_index: 1, tags: ['reminders'] }])
    const typed = annotationFromLabelDrafts(drift, { 1: 'Scheduler nudges' }, 'mine')
    expect(typed.inserted_sections).toEqual([{ operation_index: 1, tags: ['nudges', 'scheduler'] }])
    expect(typed.note).toBe('mine')
  })
})

describe('section tree', () => {
  const sections = [
    section({ id: 1, level: 0, title: 'Preamble', heading: '', body: 'hello', tags: [] }),
    section({ id: 2, level: 1, title: 'Services', heading: '# Services', body: '', tags: ['services'] }),
    section({ id: 3, level: 2, title: 'Scheduler', heading: '## Scheduler', body: 'cron jobs', tags: ['scheduler'] }),
    section({ id: 4, level: 2, title: 'Noteboard', heading: '## Noteboard', body: 'todos', tags: ['notes'] }),
    section({ id: 5, level: 1, title: 'Rules', heading: '# Rules', body: 'be plain', tags: [] }),
  ]
  it('nests level-2 sections under the group above them', () => {
    const tree = groupSections(sections)
    expect(tree.map(entry => [entry.group?.id ?? null, entry.children.map(child => child.id)])).toEqual([[null, [1]], [2, [3, 4]], [5, []]])
  })
  it('counts a group with no text of its own by what it holds', () => {
    const services = groupSections(sections)[1]
    expect(services.group?.body).toBe('')
    expect(services.characters).toBe('# Services'.length + '## Scheduler'.length + 'cron jobs'.length + '## Noteboard'.length + 'todos'.length)
  })
  it('keeps a group when a child matches, and all children when the group itself matches', () => {
    const tree = groupSections(sections)
    expect(filterSectionGroups(tree, null, 'cron').map(entry => [entry.group?.id ?? null, entry.children.map(child => child.id)])).toEqual([[2, [3]]])
    expect(filterSectionGroups(tree, 'services', '').map(entry => entry.children.length)).toEqual([2])
    expect(filterSectionGroups(tree, null, '')).toBe(tree)
  })
})
