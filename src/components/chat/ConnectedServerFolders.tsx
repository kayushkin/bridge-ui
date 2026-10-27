import { useMemo } from 'react'
import { useConnState, useSessionList } from '@kayushkin/chat-core'
import { connectedServerSessionKey, type ConnectedServerFolder, type ConnectedServerSessionRef } from '../../serverFolders'
import { OnConnectedServer, useConnectedServers } from './ConnectedServers'
import { StatusDot } from './StatusDot'
import styles from './Chat.module.css'

/** The header of one top-level server folder in the chat sidebar: this
 *  server's or a connected one's. A greyed header names why the server cannot
 *  be read, in a word, with the whole sentence in its title. */
export function ServerFolderHeader({
  label,
  title,
  count,
  collapsed,
  onToggle,
  blockedWord,
  onNewSession,
}: {
  label: string
  title: string
  /** Sessions loaded under it, or null when there is nothing to count. */
  count: number | null
  collapsed: boolean
  onToggle: () => void
  blockedWord?: string | null
  /** Starts a new session on this server, when it can take one. */
  onNewSession?: () => void
}) {
  return (
    <div
      className={`bc-folder-header bc-server-folder-header${blockedWord ? ' bc-server-folder-blocked' : ''}`}
      data-server-folder={label}
    >
      <button
        type="button"
        className={styles.folderHeaderMain}
        aria-expanded={!collapsed}
        onClick={onToggle}
        title={title}
      >
        <span className="bc-folder-chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="bc-folder-icon" aria-hidden>🖥</span>
        <span className="bc-folder-name bc-server-folder-name">{label}</span>
        {blockedWord ? (
          <span className="bc-server-folder-state">{blockedWord}</span>
        ) : count !== null ? (
          <span className="bc-folder-count">{count}</span>
        ) : null}
      </button>
      {onNewSession && !blockedWord && (
        <button
          type="button"
          className={styles.projectGroupOpen}
          onClick={onNewSession}
          title={`New session on ${label}`}
          aria-label={`New session on ${label}`}
        >
          +
        </button>
      )}
    </div>
  )
}

/** Every connected server's folder, below this server's. Each readable one
 *  lists its sessions from that server's own store, live; one that cannot be
 *  read lists nothing and says why. */
export function ConnectedServerFolderList({
  open,
  onOpen,
  collapsed,
  onToggle,
  fillsColumn,
}: {
  /** The remote session on screen, so its row reads as selected. */
  open: ConnectedServerSessionRef | null
  /** Open a session on a connected server, or a new one for a null id. */
  onOpen: (ref: ConnectedServerSessionRef) => void
  /** The collapsed server folders, by connection id. Held by the sidebar with
   *  this server's own folder, so one stored set answers for all of them. */
  collapsed: ReadonlySet<string>
  onToggle: (connectionId: string) => void
  /** True while this server's own folder is collapsed: the connected servers
   *  then take the column's height instead of a share of it. */
  fillsColumn: boolean
}) {
  const { folders, connectionsError } = useConnectedServers()

  if (folders.length === 0 && !connectionsError) return null
  return (
    <div className={`bc-server-folders${fillsColumn ? ' bc-server-folders-fill' : ''}`} aria-label="Connected servers">
      {connectionsError && (
        <div className={styles.sidebarError} role="alert">Could not read the connected servers: {connectionsError}</div>
      )}
      {folders.map(folder => (
        <ConnectedServerFolderSection
          key={folder.connectionId}
          folder={folder}
          collapsed={collapsed.has(folder.connectionId)}
          onToggle={() => onToggle(folder.connectionId)}
          open={open?.connectionId === folder.connectionId ? open : null}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function folderTitle(folder: ConnectedServerFolder): string {
  const naming = folder.labelFromServer
    ? `${folder.label}, a connected server`
    : `${folder.label}, a connected server (the name typed when connecting: that server has not reported a name of its own)`
  return folder.blockedReason ? `${naming}. ${folder.blockedReason}` : naming
}

function ConnectedServerFolderSection({
  folder,
  collapsed,
  onToggle,
  open,
  onOpen,
}: {
  folder: ConnectedServerFolder
  collapsed: boolean
  onToggle: () => void
  open: ConnectedServerSessionRef | null
  onOpen: (ref: ConnectedServerSessionRef) => void
}) {
  const { storeOf } = useConnectedServers()
  const readable = folder.blockedReason === null && !!storeOf(folder.connectionId)
  if (!readable) {
    return (
      <div className="bc-server-folder">
        <ServerFolderHeader
          label={folder.label}
          title={folderTitle(folder)}
          count={null}
          collapsed={collapsed}
          onToggle={onToggle}
          blockedWord={folder.blockedWord ?? (folder.blockedReason === null ? 'connecting' : null)}
        />
        {!collapsed && folder.blockedReason && (
          <div className="bc-server-folder-why">{folder.blockedReason}</div>
        )}
      </div>
    )
  }
  return (
    <OnConnectedServer connectionId={folder.connectionId}>
      <ReadableServerFolder folder={folder} collapsed={collapsed} onToggle={onToggle} open={open} onOpen={onOpen} />
    </OnConnectedServer>
  )
}

/** Runs against the connected server's own store (mounted by
 *  `OnConnectedServer`). */
function ReadableServerFolder({
  folder,
  collapsed,
  onToggle,
  open,
  onOpen,
}: {
  folder: ConnectedServerFolder
  collapsed: boolean
  onToggle: () => void
  open: ConnectedServerSessionRef | null
  onOpen: (ref: ConnectedServerSessionRef) => void
}) {
  const { groups, loading, moreSessions, loadingOlderSessions, loadOlderSessions } = useSessionList()
  const connState = useConnState()
  const count = useMemo(() => groups.reduce((n, g) => n + g.sessions.length, 0), [groups])
  return (
    <div className="bc-server-folder">
      <ServerFolderHeader
        label={folder.label}
        title={folderTitle(folder)}
        count={count}
        collapsed={collapsed}
        onToggle={onToggle}
        onNewSession={() => onOpen({ connectionId: folder.connectionId, sessionId: null })}
      />
      {!collapsed && (
        <div className="bc-server-folder-body">
          {connState !== 'open' && count > 0 && (
            <div className={styles.sidebarDisconnected}>
              {connState === 'closed' ? 'Disconnected — list is frozen' : 'Reconnecting — list may be stale'}
            </div>
          )}
          {loading && count === 0 && <div className="bc-session-list-empty">Loading sessions…</div>}
          {!loading && count === 0 && <div className="bc-session-list-empty">No sessions on {folder.label} that this server may see</div>}
          {groups.map(group => group.sessions.length === 0 ? null : (
            <div key={`g:${group.folder}`} className="bc-server-folder-group">
              {group.folder && (
                <div className="bc-folder-header bc-server-folder-subheader">
                  <span className="bc-folder-icon" aria-hidden>📁</span>
                  <span className="bc-folder-name">{group.folder}</span>
                  <span className="bc-folder-count">{group.sessions.length}</span>
                </div>
              )}
              {group.sessions.map(session => {
                const active = open?.sessionId === session.sessionId
                return (
                  <div
                    key={connectedServerSessionKey(folder.connectionId, session.sessionId)}
                    className={`bc-session-item bc-server-session-item${active ? ' bc-session-item-selected' : ''}`}
                    data-connection-id={folder.connectionId}
                    data-session-id={session.sessionId}
                  >
                    <span className="bc-session-status">
                      <StatusDot state={session.state} title={session.state} />
                    </span>
                    <button
                      type="button"
                      className="bc-session-item-main"
                      onClick={() => onOpen({ connectionId: folder.connectionId, sessionId: session.sessionId })}
                      title={`${session.displayName || session.sessionId} — ${session.harness}, on ${folder.label}`}
                    >
                      <span className="bc-session-label">{session.displayName || session.sessionId}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
          {moreSessions && (
            <button
              type="button"
              className="bc-session-show-more"
              onClick={loadOlderSessions}
              disabled={loadingOlderSessions}
              aria-busy={loadingOlderSessions}
            >
              {loadingOlderSessions ? 'Loading older sessions…' : 'Load older sessions'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
