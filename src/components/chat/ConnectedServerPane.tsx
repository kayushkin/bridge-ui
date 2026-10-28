import { useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { isRunningState, useActiveSession, usePendingSession } from '@kayushkin/chat-core'
import { useBridgeConfig } from '../../context'
import type { ConnectedServerSessionRef } from '../../serverFolders'
import { ConnectedServerThread, NewSessionControl } from '../BridgePeerConnection'
import { OnConnectedServer, useConnectedServers } from './ConnectedServers'

/** A connected server's session in the chat's thread pane, in place of this
 *  server's: its history, a composer that sends to that server, and Stop.
 *  For a null session id it is a new session: pick one of that server's
 *  instances, and the first message starts it there.
 *
 *  Reads the same store the sidebar's folder for that server reads, so the
 *  row clicked and the thread shown cannot disagree. */
export function ConnectedServerPane({
  sessionRef,
  onSessionChange,
  onClose,
}: {
  sessionRef: ConnectedServerSessionRef
  /** The session this pane now shows, when it changed here: a new session
   *  that its first message created. */
  onSessionChange: (ref: ConnectedServerSessionRef) => void
  onClose: () => void
}) {
  const { folders, connectionsLoaded, storeOf } = useConnectedServers()
  const { routes } = useBridgeConfig()
  const folder = folders.find(f => f.connectionId === sessionRef.connectionId)

  let blocked: string | null = null
  if (!folder) {
    blocked = connectionsLoaded
      ? `This server has no connection ${sessionRef.connectionId}. It may have been removed; the Peers page lists the ones there are.`
      : 'Reading the connected servers…'
  } else if (folder.blockedReason) {
    blocked = folder.blockedReason
  } else if (!storeOf(folder.connectionId)) {
    blocked = `Connecting to ${folder.label}…`
  }

  return (
    <div className="bc-workspace bc-workspace-focused bc-connected-server-pane">
      <header className="bc-connected-server-head">
        <span className="bc-connected-server-name" title={folder ? `A session on ${folder.label}, a connected server` : undefined}>
          🖥 {folder ? folder.label : sessionRef.connectionId}
        </span>
        {folder && <Link to={`${routes.peers}/${encodeURIComponent(folder.connectionId)}`} className="bc-connected-server-peers-link">Connection</Link>}
        <button type="button" className="bp-cancel" onClick={onClose} aria-label="Close the connected server's session">Close</button>
      </header>
      {blocked ? (
        <div className="bc-connected-server-blocked">{blocked}</div>
      ) : (
        <OnConnectedServer connectionId={sessionRef.connectionId}>
          <ConnectedServerSessionView sessionRef={sessionRef} serverName={folder ? folder.label : sessionRef.connectionId} onSessionChange={onSessionChange} />
        </OnConnectedServer>
      )}
    </div>
  )
}

/** Runs against the connected server's store. */
function ConnectedServerSessionView({
  sessionRef,
  serverName,
  onSessionChange,
}: {
  sessionRef: ConnectedServerSessionRef
  serverName: string
  onSessionChange: (ref: ConnectedServerSessionRef) => void
}) {
  // A session chip in the thread opens that server's session through the URL,
  // as the sidebar does, rather than selecting it in the store under the URL.
  const openSession = useCallback(
    (sessionId: string) => onSessionChange({ connectionId: sessionRef.connectionId, sessionId }),
    [onSessionChange, sessionRef.connectionId],
  )
  const { id: activeId, select, summary } = useActiveSession()
  const pending = usePendingSession()
  const wantedId = sessionRef.sessionId

  // Open the session the URL names in that server's store.
  useEffect(() => {
    if (wantedId && wantedId !== activeId) select(wantedId)
  }, [wantedId, activeId, select])

  // A new session: the store's active id when the pane opened is not the new
  // one, so only an id that appears after it counts as the session the first
  // message created.
  const activeIdAtOpen = useRef(activeId)
  useEffect(() => {
    if (wantedId) { activeIdAtOpen.current = activeId; return }
    if (activeId && activeId !== activeIdAtOpen.current) {
      onSessionChange({ connectionId: sessionRef.connectionId, sessionId: activeId })
    }
  }, [wantedId, activeId, onSessionChange, sessionRef.connectionId])

  if (!wantedId) {
    return (
      <div className="bc-connected-server-new">
        <NewSessionControl />
        {pending ? (
          <ConnectedServerThread sessionID={null} streaming={false} connectionId={sessionRef.connectionId} serverName={serverName} openSession={openSession} />
        ) : (
          <p className="bp-empty">Pick one of this server&apos;s instances; the first message starts the session there.</p>
        )}
      </div>
    )
  }
  if (activeId !== wantedId) return <div className="bc-connected-server-blocked">Opening the session…</div>
  return (
    <ConnectedServerThread
      sessionID={wantedId}
      streaming={!!summary && isRunningState(summary.state)}
      connectionId={sessionRef.connectionId}
      serverName={serverName}
      openSession={openSession}
    />
  )
}
