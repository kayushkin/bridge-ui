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
import type { PeerConnectionView } from '@kayushkin/llm-bridge-types'
import { BridgeContext, useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import {
  peerConnectionBridgeConfig,
  peerConnectionPath,
  peerConnectionReach,
  peerRouteErrorText,
  peerTransportDescription,
} from '../peers'
import { chatFetchOver } from '../chatFetch'
import TurnList from './chat/TurnList'

// One connected server's sessions, read and driven through this server's
// proxy for the connection (`{basePath}/peer-connections/{id}/proxy`), which
// goes direct or over the dial-out socket as the connection says. Everything
// below the providers runs against that server: a second chat-core store
// whose `basePath` is the proxy, and a `BridgeConfig` whose every other path
// is emptied (`peerConnectionBridgeConfig`), because this host's stores know
// nothing of the other server's ids. The second store keeps nothing in the
// browser — no drafts, filters or IndexedDB cache — so it cannot mix with the
// chat's own. The other server decides what is listed and allowed, by the
// level of access it gave this one.

/** Why the connected server cannot be opened now, in plain words, or null
 *  when it can. The proxy would refuse with the same reason; saying it first
 *  spares a page of failed reads. */
function whyNotOpenable(view: PeerConnectionView): string | null {
  const { connection } = view
  if (connection.removed_at) {
    return `${connection.display_name} was disconnected at ${new Date(connection.removed_at).toLocaleString()}${connection.remove_reason ? `: ${connection.remove_reason}` : ''}.`
  }
  if (!view.access_held) {
    return `${connection.display_name} has not given this server any access yet, so there is nothing to open. Its administrator gives a level on its own Peers page.`
  }
  if (peerConnectionReach(view) === 'socket closed') {
    return `${connection.display_name} is not connected now: the socket between the two servers is closed. It reconnects by itself when the server that dials out is running and online.`
  }
  return null
}

export function BridgePeerConnection() {
  const config = useBridgeConfig()
  const { fetch: fetchFn, basePath, routes } = config
  const { connectionId = '' } = useParams<{ connectionId: string }>()
  const [view, setView] = useState<PeerConnectionView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const path = peerConnectionPath(connectionId)
      try {
        const res = await fetchFn(`${basePath}${path}`)
        if (!res.ok) { if (!cancelled) setError(await peerRouteErrorText(res, `GET ${path}`)); return }
        const found = (await res.json()) as PeerConnectionView
        if (!cancelled) setView(found)
      } catch (err) {
        if (!cancelled) setError(`GET ${path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
    return () => { cancelled = true }
  }, [fetchFn, basePath, connectionId])

  const peerConfig = useMemo(() => peerConnectionBridgeConfig(config, connectionId), [config, connectionId])
  const chatFetch = useMemo(() => chatFetchOver(fetchFn), [fetchFn])
  const blocked = view ? whyNotOpenable(view) : null

  return (
    <div className="bp-container pr-link-page">
      <header className="bg-head">
        <h2 className="bg-title">
          <Link to={routes.peers}>Peers</Link> / {view ? view.connection.display_name : connectionId}
        </h2>
        {view && (
          <p className="bp-hint">
            {peerTransportDescription(view.connection)}
            {view.connection.remote_base_url ? <> · {view.connection.remote_base_url}</> : null}
            {view.access_held ? <> · acting there as <code>{view.access_held.remote_peer_principal_id}</code></> : null}
          </p>
        )}
      </header>
      {error && <div className="bridge-error bp-error">{error}</div>}
      {blocked && <div className="bridge-error bp-error">{blocked}</div>}
      {view && !blocked && (
        <BridgeContext.Provider value={peerConfig}>
          <ChatProvider
            key={view.connection.id}
            fetch={chatFetch}
            basePath={peerConfig.basePath}
            cache={false}
            keepDraftsAndFiltersInBrowser={false}
          >
            <ConnectedServerSessions />
          </ChatProvider>
        </BridgeContext.Provider>
      )}
    </div>
  )
}

function ConnectedServerSessions() {
  const { groups, loading, moreSessions, loadOlderSessions } = useSessionList()
  const { id: activeID, select, summary } = useActiveSession()
  const pending = usePendingSession()
  const sessions = useMemo(() => groups.flatMap(g => g.sessions), [groups])
  return (
    <div className="pr-link-columns">
      <aside className="pr-link-list" aria-label="Sessions on the connected server">
        <NewSessionControl />
        {loading && sessions.length === 0 && <p className="bp-empty-inline">Loading…</p>}
        {!loading && sessions.length === 0 && <p className="bp-empty-inline">The connected server shows no session to this server.</p>}
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
          <ConnectedServerThread sessionID={activeID} streaming={!!summary && isRunningState(summary.state)} />
        ) : (
          <p className="bp-empty">Pick a session, or start one on an instance of the connected server.</p>
        )}
      </section>
    </div>
  )
}

/** Opens a new session on one of the connected server's instances. The session is
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
      <select value={instanceID} onChange={e => setInstanceID(e.target.value)} aria-label="Instance on the connected server">
        <option value="">{enabled.length === 0 ? 'No instance to start on' : 'Start on…'}</option>
        {enabled.map(i => <option key={i.id} value={i.id}>{i.name} ({i.harness_type})</option>)}
      </select>
      <button type="submit" className="bp-submit" disabled={!instanceID}>New</button>
      {error && <div className="bridge-error bp-error">Could not read the connected server&apos;s instances: {error}</div>}
    </form>
  )
}

function ConnectedServerThread({ sessionID, streaming }: { sessionID: string | null; streaming: boolean }) {
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
          placeholder={sessionID ? 'Message the session on the connected server' : 'First message starts the session on the connected server'}
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
