import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PrincipalStoreResult } from '../principalStoreClient'
import type { PrincipalDetail, PrincipalResource, PrincipalResourceType } from '../types-principals'
import {
  filterResourceOptions, partitionResourceRows, resourceTypeWording, type ResourceTypeWording,
} from '../principalResources'
import {
  unavailableCatalog, useAgentCatalog, useInstanceCatalog, useMachineCatalog, useSkillCatalog, useToolCatalog,
  type ResourceCatalog,
} from '../useResourceCatalogs'

/**
 * A principal's "Works with" section: the agents, harness instances,
 * environments, skills and tools principal-store lists against a person or a
 * group, one list per type, each with a picker.
 *
 * ⚠️ A list, not a lock. Nothing refuses work outside it; the section says so
 * on screen, because a list that looks like a permission will be read as one.
 *
 * A person's list includes every group's they are in. An inherited row names
 * the group and opens it; it has no remove button, because the row is on the
 * group's list and removing it is an edit to the group.
 */

/** What the section needs from principal-store, bound by the page to the host's
 *  fetch and base path. The page memoises it: the section re-reads when it
 *  changes. */
export interface PrincipalResourcesAccess {
  listTypes: () => Promise<PrincipalStoreResult<PrincipalResourceType[]>>
  list: (principalID: string) => Promise<PrincipalStoreResult<PrincipalResource[]>>
  add: (principalID: string, resourceType: PrincipalResourceType, resourceID: string) => Promise<PrincipalStoreResult<unknown>>
  remove: (principalID: string, resourceType: PrincipalResourceType, resourceID: string) => Promise<PrincipalStoreResult<unknown>>
}

export function PrincipalResourcesSection({ detail, access, onOpen }: {
  detail: PrincipalDetail
  access: PrincipalResourcesAccess
  onOpen: (principalID: string) => void
}) {
  const [types, setTypes] = useState<PrincipalResourceType[] | null>(null)
  const [typesError, setTypesError] = useState<string | null>(null)
  const [rows, setRows] = useState<PrincipalResource[] | null>(null)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const ticket = useRef(0)

  useEffect(() => {
    let cancelled = false
    access.listTypes().then(result => {
      if (cancelled) return
      if (result.ok) { setTypes(result.value); setTypesError(null) } else setTypesError(result.error)
    })
    return () => { cancelled = true }
  }, [access])

  const load = useCallback(async () => {
    const mine = ++ticket.current
    const result = await access.list(detail.id)
    if (mine !== ticket.current) return
    if (result.ok) { setRows(result.value); setRowsError(null) } else setRowsError(result.error)
  }, [access, detail.id])

  useEffect(() => { setRows(null); setRowsError(null) }, [detail.id])
  // A person inherits their groups' rows, so a membership change moves the
  // list. The groups on the detail are what say it changed.
  const groupsKey = (detail.groups ?? []).map(group => `${group.id}:${group.disabled_at}`).join(',')
  useEffect(() => { void load() }, [load, groupsKey])

  const groupNames = useMemo(
    () => new Map((detail.groups ?? []).map(group => [group.id, group.display_name])),
    [detail.groups],
  )

  return (
    <section className="bp-section bp-resources" data-principal-id={detail.id}>
      <h4 className="bp-section-title">Works with</h4>
      <p className="bp-hint">
        {detail.kind === 'group'
          ? 'Everyone in this group inherits this list. It is a list, not a permission: nothing stops work outside it.'
          : 'Their own list, plus what their groups carry. It is a list, not a permission: nothing stops work outside it. A card offers its assignees’ harness instances first.'}
      </p>
      {typesError && <div className="bridge-error bp-error">Could not read the resource types: {typesError}</div>}
      {rowsError && <div className="bridge-error bp-error">Could not read this list: {rowsError}</div>}
      {types === null && !typesError && <div className="bp-empty-inline">Loading…</div>}
      {types?.map(type => (
        <ResourceGroupForType
          key={`${detail.id}:${type}`}
          type={type}
          principalID={detail.id}
          rows={rows}
          groupNames={groupNames}
          add={resourceID => access.add(detail.id, type, resourceID)}
          remove={resourceID => access.remove(detail.id, type, resourceID)}
          onChanged={load}
          onOpen={onOpen}
        />
      ))}
    </section>
  )
}

interface ResourceGroupSourceProps {
  type: PrincipalResourceType
  principalID: string
  rows: PrincipalResource[] | null
  groupNames: ReadonlyMap<string, string>
  add: (resourceID: string) => Promise<PrincipalStoreResult<unknown>>
  remove: (resourceID: string) => Promise<PrincipalStoreResult<unknown>>
  onChanged: () => Promise<void>
  onOpen: (principalID: string) => void
}

/** Picks the owner lookup for a type. One component per type, so each calls
 *  only its own owner's hook. */
function ResourceGroupForType(props: ResourceGroupSourceProps) {
  switch (props.type) {
    case 'agent': return <AgentResourceGroup {...props} />
    case 'instance': return <InstanceResourceGroup {...props} />
    case 'machine': return <MachineResourceGroup {...props} />
    case 'skill': return <SkillResourceGroup {...props} />
    case 'tool': return <ToolResourceGroup {...props} />
    default: return <UnknownTypeResourceGroup {...props} />
  }
}

function AgentResourceGroup(props: ResourceGroupSourceProps) {
  const [query, setQuery] = useState('')
  const catalog = useAgentCatalog(query)
  return <ResourceGroup {...props} catalog={catalog} query={query} onQueryChange={setQuery} />
}

function InstanceResourceGroup(props: ResourceGroupSourceProps) {
  const [query, setQuery] = useState('')
  const catalog = useInstanceCatalog(query)
  return <ResourceGroup {...props} catalog={catalog} query={query} onQueryChange={setQuery} />
}

function MachineResourceGroup(props: ResourceGroupSourceProps) {
  const [query, setQuery] = useState('')
  const catalog = useMachineCatalog(query)
  return <ResourceGroup {...props} catalog={catalog} query={query} onQueryChange={setQuery} />
}

function SkillResourceGroup(props: ResourceGroupSourceProps) {
  const [query, setQuery] = useState('')
  const ids = useMemo(
    () => (props.rows ?? []).filter(row => row.resource_type === 'skill').map(row => row.resource_id),
    [props.rows],
  )
  const catalog = useSkillCatalog(query, ids)
  return <ResourceGroup {...props} catalog={catalog} query={query} onQueryChange={setQuery} />
}

function ToolResourceGroup(props: ResourceGroupSourceProps) {
  const [query, setQuery] = useState('')
  const catalog = useToolCatalog(query)
  return <ResourceGroup {...props} catalog={catalog} query={query} onQueryChange={setQuery} />
}

function UnknownTypeResourceGroup(props: ResourceGroupSourceProps) {
  const catalog = useMemo(
    () => unavailableCatalog(`principal-store lists a “${props.type}” type this page has no lookup for, so its ids are shown as they are.`),
    [props.type],
  )
  return <ResourceGroup {...props} catalog={catalog} query="" onQueryChange={() => {}} />
}

/** How many options the picker lists before asking for a narrower search. */
const RESOURCE_MATCHES_SHOWN = 30

export interface ResourceGroupProps extends ResourceGroupSourceProps {
  catalog: ResourceCatalog
  query: string
  onQueryChange: (query: string) => void
  /** Opens the picker on first render. The group owns it live; this lets a
   *  static render show what the picker offers. */
  initialPickerOpen?: boolean
}

function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`
}

/** One type's list for one principal, with its picker. Exported for the
 *  render checks, which drive it with a fixed catalog. */
export function ResourceGroup({
  type, principalID, rows, groupNames, catalog, query, onQueryChange, add, remove, onChanged, onOpen,
  initialPickerOpen = false,
}: ResourceGroupProps) {
  const wording = resourceTypeWording(type)
  const [pickerOpen, setPickerOpen] = useState(initialPickerOpen)
  const [busyID, setBusyID] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { direct, inherited } = useMemo(
    () => rows ? partitionResourceRows(rows, principalID, type) : { direct: [], inherited: [] },
    [rows, principalID, type],
  )
  const directIDs = useMemo(() => new Set(direct.map(row => row.resource_id)), [direct])
  const candidates = useMemo(
    () => catalog.matches ? filterResourceOptions(catalog.matches, '', directIDs) : null,
    [catalog.matches, directIDs],
  )
  const shown = candidates ? candidates.slice(0, RESOURCE_MATCHES_SHOWN) : []

  const run = async (resourceID: string, outcome: Promise<PrincipalStoreResult<unknown>>) => {
    setBusyID(resourceID)
    setError(null)
    const result = await outcome
    if (result.ok) await onChanged()
    else setError(result.error)
    setBusyID(null)
  }

  const total = direct.length + inherited.length

  return (
    <div className="bp-resource-group" data-resource-type={type}>
      <h5 className="bp-resource-title">
        {wording.plural} <span className="bp-count">{rows ? total : '…'}</span>
      </h5>
      {catalog.unavailable && <p className="bp-hint">{catalog.unavailable}</p>}
      {catalog.error && <div className="bridge-error bp-error">Could not read {wording.owner}: {catalog.error}</div>}
      <ul className="bp-resource-list">
        {direct.map(row => (
          <ResourceRow
            key={`direct:${row.resource_id}`}
            row={row}
            wording={wording}
            catalog={catalog}
            busy={busyID !== null}
            onRemove={() => { void run(row.resource_id, remove(row.resource_id)) }}
          />
        ))}
        {inherited.map(row => (
          <ResourceRow
            key={`inherited:${row.assigned_to}:${row.resource_id}`}
            row={row}
            wording={wording}
            catalog={catalog}
            busy={busyID !== null}
            viaName={groupNames.get(row.assigned_to)}
            onOpenVia={() => onOpen(row.assigned_to)}
          />
        ))}
        {rows === null && <li className="bp-empty-inline">Loading…</li>}
        {rows !== null && total === 0 && <li className="bp-empty-inline">None.</li>}
      </ul>
      {error && <div className="bridge-error bp-error bp-membership-error">{error}</div>}
      {!catalog.unavailable && (
        <div className="bp-picker bp-resource-picker">
          <input
            type="search"
            className="bp-picker-query"
            placeholder={`Add ${withArticle(wording.singular)}…`}
            value={query}
            onChange={e => { onQueryChange(e.target.value); setPickerOpen(true) }}
            onFocus={() => setPickerOpen(true)}
            aria-label={`Add ${withArticle(wording.singular)}`}
          />
          {pickerOpen && candidates === null && !catalog.error && <div className="bp-empty-inline">Loading…</div>}
          {pickerOpen && candidates !== null && (
            <ul className="bp-picker-matches">
              {shown.map(option => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="bp-picker-match bp-resource-match"
                    data-resource-id={option.id}
                    disabled={busyID !== null}
                    title={`Add ${option.label}`}
                    onClick={() => { void run(option.id, add(option.id)) }}
                  >
                    <span className="bp-resource-name">{option.label}</span>
                    {option.detail && <span className="bp-resource-detail">{option.detail}</span>}
                    {option.disabled && <span className="bp-badge bp-badge-disabled">disabled</span>}
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="bp-empty-inline">
                  {query.trim()
                    ? `No ${wording.singular} matches “${query.trim()}”.`
                    : catalog.matches && catalog.matches.length > 0
                      ? `Every ${wording.singular} is already on the list.`
                      : `${wording.owner} has none.`}
                </li>
              )}
              {candidates.length > shown.length && (
                <li className="bp-empty-inline">{candidates.length - shown.length} more — narrow the search.</li>
              )}
              <li>
                <button type="button" className="bp-cancel" onClick={() => { setPickerOpen(false); onQueryChange('') }}>Done</button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One row. A resource the owner cannot name shows its raw id, with the reason
 * on hover, never nothing: the row is a true record that someone put that id on
 * the list, and only the name is unknown.
 */
function ResourceRow({ row, wording, catalog, busy, onRemove, viaName, onOpenVia }: {
  row: PrincipalResource
  wording: ResourceTypeWording
  catalog: ResourceCatalog
  busy: boolean
  onRemove?: () => void
  viaName?: string
  onOpenVia?: () => void
}) {
  const option = catalog.byID.get(row.resource_id)
  const inherited = onOpenVia !== undefined
  const unresolvedReason = option
    ? null
    : catalog.unavailable
      ?? (catalog.error
        ? `${wording.owner} did not answer: ${catalog.error}`
        : catalog.settled(row.resource_id)
          ? `${wording.owner} has no ${wording.singular} with this id`
          : 'still loading')
  const name = option ? option.label : row.resource_id
  const groupName = viaName ?? row.assigned_to

  return (
    <li
      className={`bp-resource${option ? '' : ' bp-resource-unresolved'}${option?.disabled ? ' bp-resource-disabled' : ''}${inherited ? ' bp-resource-inherited' : ''}`}
      data-resource-id={row.resource_id}
      data-assigned-to={row.assigned_to}
    >
      <span className="bp-resource-name" title={`${row.resource_type} ${row.resource_id}${unresolvedReason ? ` — ${unresolvedReason}` : ''}`}>
        {name}
      </span>
      {option?.detail && <span className="bp-resource-detail">{option.detail}</span>}
      {option?.disabled && <span className="bp-badge bp-badge-disabled">disabled</span>}
      {inherited ? (
        <button
          type="button"
          className="bp-resource-via"
          title={`On ${groupName}’s list. Open the group to change it.`}
          onClick={onOpenVia}
        >via {groupName}</button>
      ) : (
        <button
          type="button"
          className="bp-membership-remove"
          title={`Remove ${name}`}
          aria-label={`Remove ${name}`}
          disabled={busy}
          onClick={onRemove}
        >×</button>
      )}
    </li>
  )
}
