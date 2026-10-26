import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ChatProvider,
  isRunningState,
  useActiveSession,
  useComposer,
  usePendingSession,
  useSessionActions,
  useSessionList,
} from '@kayushkin/chat-core'
import type { PeerLink } from '@kayushkin/llm-bridge-types'
import { BridgeContext, useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { PEER_LINKS_PATH, peerLinkBridgeConfig, peerLinkIsRemoved, peerRouteErrorText } from '../peers'
import { chatFetchOver } from '../chatFetch'
import TurnList from './chat/TurnList'

// One linked server's sessions, read and driven through this server's proxy
// for the link (`{basePath}/peer-links/{id}/proxy`). Everything below the
// providers runs against that server: a second chat-core store whose
// `basePath` is the proxy, and a `BridgeConfig` whose every other path is
// emptied (`peerLinkBridgeConfig`), because this host's stores know nothing of
// the other server's ids. The second store keeps nothing in the browser — no
// drafts, filters or IndexedDB cache — so it cannot mix with the chat's own.
// The other server decides what is listed and allowed, by the peer principal
// the link's token acts as there.

export function BridgePeerLink() {
  const config = useBridgeConfig()
  const { fetch: fetchFn, basePath, routes } = config
  const { linkId = '' } = useParams<{ linkId: string }>()
  const [link, setLink] = useState<PeerLink | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchFn(`${basePath}${PEER_LINKS_PATH}`)
        if (!res.ok) { if (!cancelled) setError(await peerRouteErrorText(res, `GET ${PEER_LINKS_PATH}`)); return }
        const links = ((await res.json()) as PeerLink[] | null) ?? []
        const found = links.find(l => l.id === linkId)
        if (cancelled) return
        if (!found) setError(`No link has id ${linkId}.`)
        else if (peerLinkIsRemoved(found)) setError(`${found.display_name} was unlinked at ${new Date(found.removed_at ?? '').toLocaleString()}: ${found.remove_reason ?? ''}`)
        else setLink(found)
      } catch (err) {
        if (!cancelled) setError(`GET ${PEER_LINKS_PATH}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
    return () => { cancelled = true }
  }, [fetchFn, basePath, linkId])

  const peerConfig = useMemo(() => peerLinkBridgeConfig(config, linkId), [config, linkId])
  const chatFetch = useMemo(() => chatFetchOver(fetchFn), [fetchFn])

  return (
    <div className="bp-container pr-link-page">
      <header className="bg-head">
        <h2 className="bg-title">
          <Link to={routes.peers}>Peers</Link> / {link ? link.display_name : linkId}
        </h2>
        {link && <p className="bp-hint">{link.base_url} · acting there as <code>{link.remote_peer_principal_id}</code></p>}
      </header>
      {error && <div className="bridge-error bp-error">{error}</div>}
      {link && (
        <BridgeContext.Provider value={peerConfig}>
          <ChatProvider
            key={link.id}
            fetch={chatFetch}
            basePath={peerConfig.basePath}
            cache={false}
            keepDraftsAndFiltersInBrowser={false}
          >
            <LinkedServerSessions />
          </ChatProvider>
        </BridgeContext.Provider>
      )}
    </div>
  )
}

function LinkedServerSessions() {
  const { groups, loading, moreSessions, loadOlderSessions } = useSessionList()
  const { id: activeID, select, summary } = useActiveSession()
  const pending = usePendingSession()
  const sessions = useMemo(() => groups.flatMap(g => g.sessions), [groups])
  return (
    <div className="pr-link-columns">
      <aside className="pr-link-list" aria-label="Sessions on the linked server">
        <NewSessionControl />
        {loading && sessions.length === 0 && <p className="bp-empty-inline">Loading…</p>}
        {!loading && sessions.length === 0 && <p className="bp-empty-inline">The linked server shows no session to this server&apos;s principal.</p>}
        <ul className="bp-list">
          {sessions.map(s => (
            <li key={s.sessionId}>
              <button
                type="button"
                className={`bp-row pr-session-row${s.sessionId === activeID ? ' bp-row-selected' : ''}`}
                onClick={() => select(s.sessionId)}
                data-session-id={s.sessionId}
              >
                <span className="bp-row-text">
                  <span className="bp-row-name">{s.displayName || s.sessionId}</span>
                  <span className="bp-row-email">{s.state} · {s.harness} · {new Date(s.updatedAt).toLocaleString()}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {moreSessions && <button type="button" className="bp-cancel" onClick={loadOlderSessions}>Older sessions</button>}
      </aside>
      <section className="pr-link-thread">
        {activeID || pending ? (
          <LinkedServerThread sessionID={activeID} streaming={!!summary && isRunningState(summary.state)} />
        ) : (
          <p className="bp-empty">Pick a session, or start one on an instance of the linked server.</p>
        )}
      </section>
    </div>
  )
}

/** Opens a new session on one of the linked server's instances. The session is
 *  created on the first send, as the chat does it. */
function NewSessionControl() {
  const { instances, error } = useBridgeInstances()
  const { newSession } = useSessionActions()
  const enabled = instances.filter(i => i.enabled)
  const [instanceID, setInstanceID] = useState('')
  const start = (event: FormEvent) => {
    event.preventDefault()
    const instance = enabled.find(i => i.id === instanceID)
    if (instance) newSession({ instanceId: instance.id, harness: instance.harness_type })
  }
  return (
    <form className="pr-new-session" onSubmit={start}>
      <select value={instanceID} onChange={e => setInstanceID(e.target.value)} aria-label="Instance on the linked server">
        <option value="">{enabled.length === 0 ? 'No instance to start on' : 'Start on…'}</option>
        {enabled.map(i => <option key={i.id} value={i.id}>{i.name} ({i.harness_type})</option>)}
      </select>
      <button type="submit" className="bp-submit" disabled={!instanceID}>New</button>
      {error && <div className="bridge-error bp-error">Could not read the linked server&apos;s instances: {error}</div>}
    </form>
  )
}

function LinkedServerThread({ sessionID, streaming }: { sessionID: string | null; streaming: boolean }) {
  const composer = useComposer(sessionID)
  const composerStatus = useMemo(
    () => ({ paused: composer.paused, resumable: composer.resumable, error: composer.error, failedAction: null }),
    [composer.paused, composer.resumable, composer.error],
  )
  const send = (event: FormEvent) => {
    event.preventDefault()
    void composer.send(composer.draft)
  }
  return (
    <div className="pr-thread">
      <TurnList
        sessionId={sessionID}
        view="turns"
        markdown
        streaming={streaming}
        compacting={false}
        composerStatus={composerStatus}
        style={{ flex: '1 1 0' }}
      />
      <form className="pr-composer" onSubmit={send}>
        <textarea
          className="bp-input"
          rows={3}
          value={composer.draft}
          onChange={e => composer.setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void composer.send(composer.draft) } }}
          placeholder={sessionID ? 'Message the session on the linked server' : 'First message starts the session on the linked server'}
          aria-label="Message"
        />
        <div className="pr-composer-actions">
          <button type="submit" className="bp-submit" disabled={composer.sending || !composer.draft.trim()}>Send</button>
          {streaming && <button type="button" className="bp-cancel" onClick={() => { void composer.stop().catch(() => undefined) }}>Stop</button>}
          {composer.resumable && <button type="button" className="bp-cancel" onClick={() => { void composer.resume().catch(() => undefined) }}>Resume</button>}
        </div>
      </form>
    </div>
  )
}
