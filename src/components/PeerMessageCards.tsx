import { useCallback, useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import type { PeerConnectionView } from '@kayushkin/llm-bridge-types'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { PEER_CONNECTIONS_PATH, peerRouteErrorText } from '../peers'
import { connectedServerLabel } from '../serverFolders'
import {
  peerConnectionMessagesPath,
  peerMessageApprovePath,
  peerMessageCommitList,
  peerMessageDeclinePath,
  peerMessageHeadline,
  peerMessageNeedsDecision,
  peerMessageNoticeBody,
  peerMessageRefusalText,
  peerMessageRequestBody,
  peerMessageThreads,
  peerMessagesListPath,
  parsePeerMessageCommits,
  untrustedTextPieces,
  type PeerMessage,
  type PeerMessageApproveBody,
  type PeerMessageSendBody,
} from '../peerMessages'

// The cards for messages from connected bridge servers: a request to start a
// session, a notice that something is ready, and what came of either. Rules
// live in `src/peerMessages.ts`; this file fetches and draws.

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** The server's refusal in plain words when it is one a person can act on,
 *  followed by the server's own text. */
async function peerMessageErrorText(res: Response, verb: string): Promise<string> {
  const text = await peerRouteErrorText(res.clone(), verb)
  try {
    const code = ((await res.json()) as { error?: { code?: string } }).error?.code ?? ''
    const plain = peerMessageRefusalText(code)
    return plain ? `${plain} (${text})` : text
  } catch {
    return text
  }
}

/** Every message the filter names, re-read every 30 seconds and when asked.
 *  `available` is false when this server answers 404: it has no message
 *  routes, which is not "no messages". */
export function usePeerMessages(filter: Parameters<typeof peerMessagesListPath>[0]): {
  messages: PeerMessage[]
  available: boolean
  error: string | null
  reload: () => void
} {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const path = peerMessagesListPath(filter)
  const [messages, setMessages] = useState<PeerMessage[]>([])
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const res = await fetchFn(`${basePath}${path}`)
        if (cancelled) return
        if (res.status === 404) {
          setAvailable(false)
          setMessages([])
          return
        }
        if (!res.ok) {
          setError(await peerMessageErrorText(res, 'read messages from connected servers'))
          return
        }
        setAvailable(true)
        setError(null)
        setMessages((await res.json()) as PeerMessage[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    void read()
    const timer = setInterval(read, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [fetchFn, basePath, path, tick])
  return { messages, available, error, reload }
}

/** Each connection's server name, by connection id, for card headings. */
export function usePeerConnectionNames(): (connectionID: string) => string {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [views, setViews] = useState<PeerConnectionView[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetchFn(`${basePath}${PEER_CONNECTIONS_PATH}`).catch(() => null)
      if (!cancelled && res?.ok) setViews((await res.json()) as PeerConnectionView[])
    })()
    return () => { cancelled = true }
  }, [fetchFn, basePath])
  return useMemo(() => {
    const names = new Map(views.map(view => [view.connection.id, connectedServerLabel(view).label]))
    return (connectionID: string) => names.get(connectionID) ?? 'A connected server'
  }, [views])
}

/** Text another machine wrote, drawn as text: line breaks kept, a web address
 *  shown distinctly but never as a link that loads or opens by itself. */
export function UntrustedText({ text, className }: { text: string; className?: string }): JSX.Element {
  return (
    <div className={`pm-untrusted ${className ?? ''}`}>
      {untrustedTextPieces(text).map((piece, index) =>
        piece.kind === 'address' ? (
          <span key={index} className="pm-address" title="An address from the other server; copy it to open it">
            {piece.text}
          </span>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </div>
  )
}

/** Every incoming request and notice waiting on a person here, newest first,
 *  read once for a surface that shows both a count and the cards. */
export function useWaitingPeerMessages(): {
  waiting: PeerMessage[]
  available: boolean
  error: string | null
  reload: () => void
} {
  const { messages, available, error, reload } = usePeerMessages({ direction: 'incoming', state: 'pending' })
  const waiting = useMemo(
    () => messages.filter(peerMessageNeedsDecision).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [messages],
  )
  return { waiting, available, error, reload }
}

/** "Needs you" for messages from connected servers: a card per waiting
 *  message. Draws nothing when none is waiting and nothing failed. */
export function PeerMessagesNeedingYou({ waiting, error, reload, onSelectSession }: {
  waiting: readonly PeerMessage[]
  error: string | null
  reload: () => void
  onSelectSession: (sessionID: string) => void
}): JSX.Element | null {
  const nameOf = usePeerConnectionNames()
  if (waiting.length === 0 && error === null) return null
  return (
    <section className="pm-needs-you" aria-label="Requests from connected servers">
      {error !== null && <p className="bridge-error pm-error">{error}</p>}
      {waiting.map(message => (
        <PeerMessageCard
          key={message.id}
          message={message}
          serverName={nameOf(message.connection_id)}
          onDecided={reload}
          onSelectSession={onSelectSession}
        />
      ))}
    </section>
  )
}

/** One message from a connected server, with what a person here may do about
 *  it. */
export function PeerMessageCard({ message, serverName, onDecided, onSelectSession }: {
  message: PeerMessage
  serverName: string
  onDecided: () => void
  onSelectSession?: (sessionID: string) => void
}): JSX.Element {
  const decidable = peerMessageNeedsDecision(message)
  return (
    <article className={`pm-card pm-card-${message.kind}`} data-state={message.state}>
      <header className="pm-card-head">
        <span className="pm-kind">{message.kind}</span>
        <span className="pm-headline">
          {message.kind === 'request'
            ? `${serverName} asks to start a session`
            : message.kind === 'notice'
              ? `${serverName} says these are ready`
              : peerMessageHeadline(message, serverName)}
        </span>
        <span className="pm-when">{new Date(message.created_at).toLocaleString()}</span>
      </header>
      {message.kind === 'request' && (
        <>
          <div className="pm-title">{message.title || '(untitled)'}</div>
          <p className="pm-hint">
            What the new session would be told, written by {serverName}. It reaches the session marked as a request
            from that server, not as your words.
          </p>
          <UntrustedText text={message.prompt ?? ''} className="pm-prompt" />
        </>
      )}
      {message.kind === 'notice' && (
        <>
          {message.summary && <UntrustedText text={message.summary} className="pm-summary" />}
          {(message.commits ?? []).length > 0 && (
            <ul className="pm-commits">
              {(message.commits ?? []).map(commit => (
                <li key={`${commit.repo}@${commit.commit}`}>
                  <code>{commit.repo}@{commit.commit}</code>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {message.kind === 'status' && message.summary && <UntrustedText text={message.summary} className="pm-summary" />}
      {message.reason && <p className="pm-reason">Reason: <UntrustedText text={message.reason} /></p>}
      {message.session_id && (
        <p className="pm-session">
          Started{' '}
          {onSelectSession && message.direction === 'incoming' ? (
            <button type="button" className="bc-ctrl-btn" onClick={() => onSelectSession(message.session_id!)}>
              {message.session_id}
            </button>
          ) : (
            <code>{message.session_id}</code>
          )}
        </p>
      )}
      {decidable && <PeerMessageDecision message={message} onDecided={onDecided} onSelectSession={onSelectSession} />}
    </article>
  )
}

function PeerMessageDecision({ message, onDecided, onSelectSession }: {
  message: PeerMessage
  onDecided: () => void
  onSelectSession?: (sessionID: string) => void
}): JSX.Element {
  const { fetch: fetchFn, basePath, orchestratorBasePath } = useBridgeConfig()
  const { instances } = useBridgeInstances()
  const enabled = useMemo(() => instances.filter(instance => instance.enabled), [instances])
  const [instanceID, setInstanceID] = useState('')
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = async (path: string, body: unknown, verb: string): Promise<PeerMessage | null> => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchFn(`${basePath}${path}`, jsonPost(body))
      if (!res.ok) {
        setError(await peerMessageErrorText(res, verb))
        return null
      }
      return (await res.json()) as PeerMessage
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  const approve = async (body: PeerMessageApproveBody) => {
    const decided = await post(peerMessageApprovePath(message.id), body, 'approve the message')
    if (!decided) return
    onDecided()
    if (decided.session_id && onSelectSession) onSelectSession(decided.session_id)
  }

  const decline = async (event: FormEvent) => {
    event.preventDefault()
    if (await post(peerMessageDeclinePath(message.id), { reason: reason.trim() }, 'decline the message')) onDecided()
  }

  return (
    <div className="pm-decision">
      {message.kind === 'request' ? (
        <div className="pm-approve">
          <label>
            Start it on{' '}
            <select value={instanceID} onChange={event => setInstanceID(event.target.value)} disabled={busy}>
              <option value="">Choose an instance…</option>
              {enabled.map(instance => (
                <option key={instance.id} value={instance.id}>
                  {instance.name} ({instance.harness_type})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="bc-ctrl-btn bc-ctrl-btn-active"
            disabled={busy || !instanceID}
            onClick={() => void approve({ instance_id: instanceID })}
          >
            Approve
          </button>
          {orchestratorBasePath && (
            <button type="button" className="bc-ctrl-btn" disabled={busy} onClick={() => void approve({ handoff: 'orchestrator' })}>
              Hand to the orchestrator
            </button>
          )}
        </div>
      ) : (
        <div className="pm-approve">
          <button type="button" className="bc-ctrl-btn bc-ctrl-btn-active" disabled={busy} onClick={() => void approve({})}>
            Update now
          </button>
        </div>
      )}
      {declining ? (
        <form className="pm-decline" onSubmit={decline}>
          <input
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder="Why (sent to the other server)"
            disabled={busy}
          />
          <button type="submit" className="bc-ctrl-btn" disabled={busy || !reason.trim()}>
            {message.kind === 'notice' ? 'Not now' : 'Decline'}
          </button>
          <button type="button" className="bc-ctrl-btn" disabled={busy} onClick={() => setDeclining(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="bc-ctrl-btn" disabled={busy} onClick={() => setDeclining(true)}>
          {message.kind === 'notice' ? 'Not now…' : 'Decline…'}
        </button>
      )}
      {error !== null && <p className="bridge-error pm-error">{error}</p>}
    </div>
  )
}

/** One connection's messages both ways, threaded, with the forms to send a
 *  request or a notice. For the Peers page. */
export function PeerConnectionMessages({ connectionID, serverName }: { connectionID: string; serverName: string }): JSX.Element {
  const { messages, available, error, reload } = usePeerMessages({ connectionID })
  const threads = useMemo(() => peerMessageThreads(messages), [messages])
  if (!available) {
    return <p className="bp-hint">This server has no message routes yet, so it cannot send or show messages.</p>
  }
  return (
    <div className="pm-connection">
      {error !== null && <p className="bridge-error pm-error">{error}</p>}
      {threads.length === 0 ? (
        <p className="bp-hint">No messages with {serverName} yet.</p>
      ) : (
        threads.map(thread => (
          <div key={thread[0].id} className="pm-thread">
            {thread.map(message => (
              <div key={message.id} className={`pm-thread-row pm-${message.direction}`}>
                <PeerMessageCard message={message} serverName={serverName} onDecided={reload} />
                <span className="pm-state">{message.direction === 'incoming' ? 'received' : 'sent'} · {message.state}</span>
              </div>
            ))}
          </div>
        ))
      )}
      <SendPeerMessageForm connectionID={connectionID} serverName={serverName} onSent={reload} />
    </div>
  )
}

type SendKind = 'request' | 'notice'

function SendPeerMessageForm({ connectionID, serverName, onSent }: {
  connectionID: string
  serverName: string
  onSent: () => void
}): JSX.Element {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [kind, setKind] = useState<SendKind>('request')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [summary, setSummary] = useState('')
  const [commitText, setCommitText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    let body: PeerMessageSendBody
    if (kind === 'request') {
      body = peerMessageRequestBody(title, prompt)
    } else {
      const parsed = parsePeerMessageCommits(commitText)
      if (parsed.error) {
        setError(parsed.error)
        return
      }
      body = peerMessageNoticeBody(summary, parsed.commits)
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetchFn(`${basePath}${peerConnectionMessagesPath(connectionID)}`, jsonPost(body))
      if (!res.ok) {
        setError(await peerMessageErrorText(res, `send the ${kind} to ${serverName}`))
        return
      }
      setTitle('')
      setPrompt('')
      setSummary('')
      setCommitText('')
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const parsedCommits = kind === 'notice' ? parsePeerMessageCommits(commitText) : null
  return (
    <form className="pm-send" onSubmit={submit}>
      <div className="pm-send-kind" role="radiogroup" aria-label="What to send">
        <label>
          <input type="radio" checked={kind === 'request'} onChange={() => setKind('request')} /> Ask {serverName} to start a session
        </label>
        <label>
          <input type="radio" checked={kind === 'notice'} onChange={() => setKind('notice')} /> Tell {serverName} something is ready
        </label>
      </div>
      {kind === 'request' ? (
        <>
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Title" disabled={busy} />
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder="What the session should do — what you would type as its first message"
            rows={5}
            disabled={busy}
          />
          <p className="bp-hint">Nothing runs there until a person on {serverName} approves it.</p>
        </>
      ) : (
        <>
          <input value={summary} onChange={event => setSummary(event.target.value)} placeholder="What is ready" disabled={busy} />
          <textarea
            value={commitText}
            onChange={event => setCommitText(event.target.value)}
            placeholder={'repo@commit, one per line\nllm-bridge-server@98bd56d'}
            rows={3}
            disabled={busy}
          />
          {parsedCommits && parsedCommits.commits.length > 0 && (
            <p className="bp-hint">{peerMessageCommitList(parsedCommits.commits)}</p>
          )}
          <p className="bp-hint">{serverName} updates only when a person there approves it.</p>
        </>
      )}
      <button
        type="submit"
        className="bc-ctrl-btn bc-ctrl-btn-active"
        disabled={busy || (kind === 'request' ? !title.trim() || !prompt.trim() : !summary.trim() || !commitText.trim())}
      >
        Send
      </button>
      {error !== null && <p className="bridge-error pm-error">{error}</p>}
    </form>
  )
}
