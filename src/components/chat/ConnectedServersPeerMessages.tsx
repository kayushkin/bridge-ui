import { useEffect, useMemo, useState, type JSX } from 'react'
import type { PeerConnectionView } from '@kayushkin/llm-bridge-types'
import { BridgeContext, useBridgeConfig } from '../../context'
import { PEER_CONNECTIONS_PATH, peerConnectionBridgeConfig, peerRouteErrorText } from '../../peers'
import { connectedServerLabel, connectionsThisServerAdministers } from '../../serverListings'
import { PeerMessagesNeedingYou, useWaitingPeerMessages } from '../PeerMessageCards'
import styles from './Chat.module.css'

// The Signals page's sections for the servers this one administers: each
// server's own waiting requests and notices, read and decided through this
// server's proxy for the connection. Each section runs the same cards as this
// server's own, under that server's config (`peerConnectionBridgeConfig`), so
// a card reads, approves and declines on the other server, and its Start it on
// list is that server's instances.

/** How often the connection list is read again, as the chat's list does. */
const CONNECTIONS_POLL_MS = 30_000

/** One section per connected server this one administers. Each reports how
 *  many messages wait there, by connection id, for the page's count. */
export function ConnectedServersPeerMessages({ onWaitingCount, onSelectSession }: {
  onWaitingCount: (connectionID: string, waiting: number) => void
  onSelectSession: (connectionID: string, sessionID: string) => void
}): JSX.Element | null {
  const config = useBridgeConfig()
  const { fetch: fetchFn, basePath } = config
  const [views, setViews] = useState<PeerConnectionView[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const res = await fetchFn(`${basePath}${PEER_CONNECTIONS_PATH}`)
        if (cancelled) return
        // A server with no peer routes has no connected servers to list.
        if (res.status === 404) {
          setViews([])
          return
        }
        if (!res.ok) {
          setError(await peerRouteErrorText(res, 'read the connected servers'))
          return
        }
        setError(null)
        setViews(connectionsThisServerAdministers((await res.json()) as PeerConnectionView[]))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    void read()
    const timer = setInterval(read, CONNECTIONS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [fetchFn, basePath])

  if (views.length === 0 && error === null) return null
  return (
    <>
      {error !== null && <p className={styles.inboxError}>Couldn’t read the connected servers: {error}</p>}
      {views.map(view => (
        <ConnectedServerPeerMessages
          key={view.connection.id}
          view={view}
          onWaitingCount={onWaitingCount}
          onSelectSession={onSelectSession}
        />
      ))}
    </>
  )
}

function ConnectedServerPeerMessages({ view, onWaitingCount, onSelectSession }: {
  view: PeerConnectionView
  onWaitingCount: (connectionID: string, waiting: number) => void
  onSelectSession: (connectionID: string, sessionID: string) => void
}): JSX.Element {
  const config = useBridgeConfig()
  const connectionID = view.connection.id
  const serverConfig = useMemo(() => peerConnectionBridgeConfig(config, connectionID), [config, connectionID])
  return (
    <BridgeContext.Provider value={serverConfig}>
      <WaitingOnConnectedServer
        connectionID={connectionID}
        label={connectedServerLabel(view).label}
        onWaitingCount={onWaitingCount}
        onSelectSession={onSelectSession}
      />
    </BridgeContext.Provider>
  )
}

/** Runs under the connected server's config, so every read and decision goes
 *  to that server. */
function WaitingOnConnectedServer({ connectionID, label, onWaitingCount, onSelectSession }: {
  connectionID: string
  label: string
  onWaitingCount: (connectionID: string, waiting: number) => void
  onSelectSession: (connectionID: string, sessionID: string) => void
}): JSX.Element | null {
  const { waiting, error, reload } = useWaitingPeerMessages()
  useEffect(() => {
    onWaitingCount(connectionID, waiting.length)
  }, [onWaitingCount, connectionID, waiting.length])
  useEffect(() => () => onWaitingCount(connectionID, 0), [onWaitingCount, connectionID])

  if (waiting.length === 0 && error === null) return null
  return (
    <section className={styles.signalsPageSection}>
      <h3 className={styles.signalsPageSectionTitle}>Waiting on {label} · {waiting.length}</h3>
      <PeerMessagesNeedingYou
        waiting={waiting}
        error={error}
        reload={reload}
        onSelectSession={sessionID => onSelectSession(connectionID, sessionID)}
      />
    </section>
  )
}
