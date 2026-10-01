import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  contactLinkBody, contactLinkSuggestionDecisionPath, contactUnlinkBody, linkCandidates, linkedByLabel, personOfIdentity,
} from '../../multichatMessages'
import type { MultichatContactIdentity, MultichatContactLinkSuggestion, MultichatUnifiedContact } from '../../types-multichat'
import { errorText, useMultichat } from './useMultichat'
import styles from './Messages.module.css'

/** Everyone, one row per person, and a reload after a link changes. */
export function useUnifiedContacts(enabled = true) {
  const { read, configured } = useMultichat()
  const [contacts, setContacts] = useState<MultichatUnifiedContact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setContacts((await read<MultichatUnifiedContact[] | null>('/contacts/unified')) ?? [])
      setError(null)
    } catch (err) {
      setError(errorText(err))
    }
  }, [read])
  useEffect(() => {
    if (configured && enabled) void reload()
  }, [configured, enabled, reload])
  return { contacts, error, reload }
}

/** A search box that links one identity to another person: type part of any
 *  of their names, pick the row. The link goes live at once. */
export function PersonLinkPicker({ userID, contacts, onLinked }: {
  userID: string
  contacts: readonly MultichatUnifiedContact[]
  onLinked: () => Promise<void> | void
}) {
  const { write } = useMultichat()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const candidates = useMemo(() => linkCandidates(contacts, userID, query), [contacts, userID, query])
  const link = async (target: MultichatUnifiedContact) => {
    setBusy(true)
    const result = await write('POST', '/contacts/links', contactLinkBody(userID, target))
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setError(null)
    setQuery('')
    await onLinked()
  }
  return (
    <div className={styles.personLinkPicker} data-link-picker={userID}>
      <input className={styles.input} type="search" value={query} disabled={busy}
        placeholder="Same person as… (type a name)" onChange={e => setQuery(e.target.value)} />
      {candidates.length > 0 && (
        <ul className={styles.personLinkCandidates}>
          {candidates.map(candidate => (
            <li key={candidate.principal_id ?? candidate.identities[0]?.user_id}>
              <button type="button" className={styles.tagAdd} disabled={busy} onClick={() => { void link(candidate) }}>
                {candidate.display_name}
                {candidate.identities.map(identity => (
                  <span key={identity.user_id} className={styles.platform}>
                    {identity.platform}{identity.display_name && identity.display_name !== candidate.display_name ? ` · ${identity.display_name}` : ''}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <pre className={styles.error}>{error}</pre>}
    </div>
  )
}

/** Who linked an identity and why, with a button that separates it from its
 *  person. Separating also tells the phone matcher and the agent never to link
 *  it back. */
export function IdentityLink({ identity, onChanged }: {
  identity: MultichatContactIdentity
  onChanged: () => Promise<void> | void
}) {
  const { write } = useMultichat()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!identity.linked_by) return null
  const unlink = async () => {
    setBusy(true)
    const result = await write('POST', '/contacts/links/remove', contactUnlinkBody(identity.user_id))
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setError(null)
    await onChanged()
  }
  return (
    <span className={styles.identityLink} title={identity.link_reason}>
      <span className={styles.muted}>{linkedByLabel(identity.linked_by)}</span>
      <button type="button" className={styles.tagAdd} disabled={busy} onClick={() => { void unlink() }}>Not this person</button>
      {error && <pre className={styles.error}>{error}</pre>}
    </span>
  )
}

/** The agent's open suggestions: pairs it thought might be one person but was
 *  not sure enough to link. Accept links them; reject keeps them apart. */
export function ContactLinkSuggestions({ contacts, onDecided }: {
  contacts: readonly MultichatUnifiedContact[]
  onDecided: () => Promise<void> | void
}) {
  const { read, write } = useMultichat()
  const [suggestions, setSuggestions] = useState<MultichatContactLinkSuggestion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setSuggestions((await read<MultichatContactLinkSuggestion[] | null>('/contacts/links/suggestions')) ?? [])
    } catch (err) {
      setError(errorText(err))
    }
  }, [read])
  useEffect(() => { void reload() }, [reload])
  if (suggestions.length === 0 && !error) return null
  const nameOf = (userID: string) => {
    const person = personOfIdentity(contacts, userID)
    const identity = person?.identities.find(i => i.user_id === userID)
    return `${person?.display_name ?? userID} (${identity?.platform ?? '?'}${identity?.display_name && identity.display_name !== person?.display_name ? ` · ${identity.display_name}` : ''})`
  }
  const decide = async (suggestion: MultichatContactLinkSuggestion, decision: 'accept' | 'reject') => {
    setBusy(true)
    const result = await write('POST', contactLinkSuggestionDecisionPath(suggestion, decision), { decided_by: 'operator' })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setError(null)
    await Promise.all([reload(), onDecided()])
  }
  return (
    <section className={styles.tagManager}>
      <span className={styles.muted}>Suggested links ({suggestions.length})</span>
      <ul className={styles.list}>
        {suggestions.map(suggestion => (
          <li key={suggestion.id} className={styles.row}>
            <span>{nameOf(suggestion.contact_user_id)} = {nameOf(suggestion.other_contact_user_id)}?</span>
            <span className={styles.muted}>{suggestion.reason}</span>
            <span className={styles.tagRow}>
              <button type="button" className={styles.tagAdd} disabled={busy} onClick={() => { void decide(suggestion, 'accept') }}>Same person</button>
              <button type="button" className={styles.tagAdd} disabled={busy} onClick={() => { void decide(suggestion, 'reject') }}>Different people</button>
            </span>
          </li>
        ))}
      </ul>
      {error && <pre className={styles.error}>{error}</pre>}
    </section>
  )
}

/** In a one-to-one conversation: who the other person is across apps, and a
 *  picker to link this account to someone else. */
export function ConversationPerson({ partnerUserID }: { partnerUserID: string }) {
  const { contacts, error, reload } = useUnifiedContacts()
  if (error) return <pre className={styles.error}>{error}</pre>
  if (!contacts) return null
  const person = personOfIdentity(contacts, partnerUserID)
  const identity = person?.identities.find(i => i.user_id === partnerUserID)
  const elsewhere = person?.identities.filter(i => i.user_id !== partnerUserID) ?? []
  return (
    <div className={styles.threadTags} data-conversation-person={partnerUserID}>
      <span className={styles.muted}>Person</span>
      <span className={styles.name}>{person?.display_name ?? partnerUserID}</span>
      {identity?.linked_by && (
        <span className={styles.identityLink}>
          <span className={styles.muted}>this {identity.platform} account:</span>
          <IdentityLink identity={identity} onChanged={reload} />
        </span>
      )}
      {elsewhere.length > 0 && <span className={styles.muted}>also</span>}
      {elsewhere.map(other => (
        <span key={other.user_id} className={styles.platform} title={`${linkedByLabel(other.linked_by)}: ${other.link_reason ?? ''}`}>
          {other.platform}{other.display_name ? ` · ${other.display_name}` : ''}
        </span>
      ))}
      <PersonLinkPicker userID={partnerUserID} contacts={contacts} onLinked={reload} />
    </div>
  )
}
