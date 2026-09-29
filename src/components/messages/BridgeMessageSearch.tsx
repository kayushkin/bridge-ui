import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBridgeConfig } from '../../context'
import { highlightSegments, messageTimeLabel, orderedSearchGroups, searchPath } from '../../multichatMessages'
import type { MultichatSearchAnswer } from '../../types-multichat'
import { errorText, useMultichat } from './useMultichat'
import { MultichatNotConfigured } from './messagesShared'
import styles from './Messages.module.css'
import { useDailyNitroCheck } from './useEmojiCatalog'

/**
 * Search the messages of every conversation. multichat reads the newest 50
 * messages of each room and matches the term as plain text in any case, so an
 * older message is not found. `?q=` holds the term, so a search can be linked.
 */
export function BridgeMessageSearch() {
  useDailyNitroCheck()
  const { read, configured } = useMultichat()
  const { routes } = useBridgeConfig()
  const [searchParams, setSearchParams] = useSearchParams()
  const searched = searchParams.get('q') ?? ''
  const [draft, setDraft] = useState(searched)
  const [answer, setAnswer] = useState<MultichatSearchAnswer | null>(null)
  const [answerFor, setAnswerFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (term: string) => {
    const path = searchPath(term)
    if (!path) return
    const next = new URLSearchParams(searchParams)
    next.set('q', term.trim())
    setSearchParams(next, { replace: true })
    setBusy(true)
    try {
      setAnswer(await read<MultichatSearchAnswer>(path))
      setAnswerFor(term.trim())
      setError(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  // A linked search (`?q=` on arrival) runs once, when the page opens.
  const ranLinked = useRef(false)
  useEffect(() => {
    if (!configured || ranLinked.current) return
    ranLinked.current = true
    if (searchPath(searched)) void run(searched)
  })

  if (!configured) return <MultichatNotConfigured page="Search" />

  const groups = answer ? orderedSearchGroups(answer) : []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>Search messages</h2>
        <p className={styles.subtitle}>
          Finds a word or phrase, in any case, in the newest 50 messages of every conversation; an older message is
          not searched. It reads every room, so it takes a few seconds.
        </p>
      </header>
      <form className={styles.filters} onSubmit={e => { e.preventDefault(); void run(draft) }}>
        <input className={styles.input} type="search" value={draft} placeholder="Word or phrase" autoFocus
          onChange={e => setDraft(e.target.value)} />
        <button type="submit" className="bi-save-btn" disabled={busy || !searchPath(draft)}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error && <pre className={styles.error}>{error}</pre>}
      {answer && answerFor !== null && (
        <div className={styles.muted}>
          {answer.total === 0 ? `Nothing matches "${answerFor}".`
            : `${answer.total} ${answer.total === 1 ? 'message matches' : 'messages match'} "${answerFor}" in ${groups.length} ${groups.length === 1 ? 'conversation' : 'conversations'}.`}
        </div>
      )}
      <ul className={styles.list}>
        {groups.map(group => (
          <li key={group.room_id} className={styles.row} data-room-id={group.room_id}>
            <div className={styles.rowHead}>
              <Link className={styles.name} to={`${routes.messageConversations}?${new URLSearchParams({ room: group.room_id }).toString()}`}>
                {group.room_name}
              </Link>
              {group.platform && <span className={styles.platform}>{group.platform}</span>}
              <span className={styles.muted}>{group.results.length} {group.results.length === 1 ? 'match' : 'matches'}</span>
            </div>
            <ul className={styles.hits}>
              {group.results.map(hit => (
                <li key={hit.event_id} className={styles.hit} data-event-id={hit.event_id}>
                  <div className={styles.messageHead}>
                    <span className={styles.sender}>{hit.sender_name}</span>
                    <span className={styles.time}>{messageTimeLabel(hit.timestamp)}</span>
                  </div>
                  <div className={styles.messageBody}>
                    {highlightSegments(hit.body, answerFor ?? '').map((segment, index) =>
                      segment.match ? <mark key={index} className={styles.mark}>{segment.text}</mark> : <span key={index}>{segment.text}</span>)}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
