import { useCallback } from 'react'
import type { JSX } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useActiveSession } from '@kayushkin/chat-core'
import { useBridgeConfig } from '../context'
import SignalsPage from './chat/SignalsPage'
import styles from './chat/Chat.module.css'

/**
 * The signals page: every open signal across every session, on a route of its own.
 *
 * It used to be a view inside the chat, drawn in the thread pane's place with the
 * session list beside it and the active session still open behind it — in the
 * URL, highlighted in the list, and named in the phone's top bar. Signals belong
 * to no one session, so this page draws none. It offers a way back to the session
 * the chat last had open, and a card's session name opens that session in the chat.
 */
export function BridgeSignals(): JSX.Element {
  const { routes } = useBridgeConfig()
  const navigate = useNavigate()
  // The chat store lives above the router, so the session the chat last had open
  // is still its active one here. Read, never changed: this page selects nothing.
  const { id: lastSessionId, summary: lastSession } = useActiveSession()

  const chatHrefFor = useCallback(
    (sessionId: string) => `${routes.chat}?session=${encodeURIComponent(sessionId)}`,
    [routes.chat],
  )
  const openSession = useCallback((sessionId: string) => navigate(chatHrefFor(sessionId)), [navigate, chatHrefFor])

  const backControl = lastSessionId ? (
    <Link className="bc-ctrl-btn" to={chatHrefFor(lastSessionId)}>
      Back to {lastSession?.displayName || 'last session'}
    </Link>
  ) : (
    <Link className="bc-ctrl-btn" to={routes.chat}>
      Back to chat
    </Link>
  )

  return (
    <div className={styles.signalsRoute}>
      <SignalsPage onSelectSession={openSession} backControl={backControl} />
    </div>
  )
}
