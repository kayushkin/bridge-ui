// Messages between connected bridge servers: what one server asks of the
// other, and what each tells the other when it is done.
//
// Three kinds, each carried over the connection and kept by both servers:
//   - `request`: the other server asks this one to start a session. Its title
//     and prompt are what that session would be told. Nothing runs until a
//     person here approves it, choosing an instance (or handing it to the
//     orchestrator); the session then starts with the prompt and a note of
//     where it came from.
//   - `notice`: the other server says something is ready, naming repos and
//     commits, usually "update to these". Updating waits for approval here.
//   - `status`: what came of a request or a notice, threaded to it.
//
// ⚠️ A message is text another machine wrote. It is drawn as plain text —
// never as markdown, never with an image or link that loads by itself — and an
// approved request's prompt reaches the new session marked as a request from
// that server, never as the operator's own words.
//
// The routes are llm-bridge-server's (`POST /peer-connections/{id}/messages`,
// `GET /peer-messages`, `POST /peer-messages/{id}/approve` and `/decline`).
// These types follow that contract until llm-bridge generates them as
// `msg.PeerMessage*`; then they come from `@kayushkin/llm-bridge-types` and
// this block goes.

export type PeerMessageKind = 'request' | 'notice' | 'status'
export type PeerMessageDirection = 'incoming' | 'outgoing'

/** A repo and a commit a notice names. */
export interface PeerMessageCommit {
  repo: string
  commit: string
}

export interface PeerMessage {
  id: string
  connection_id: string
  direction: PeerMessageDirection
  kind: PeerMessageKind
  /** `pending` until a person here decides an incoming one; an outgoing one
   *  is `queued` until the other server confirms it arrived. The server owns
   *  the list; anything else it sends is drawn as it is. */
  state: string
  title?: string
  prompt?: string
  summary?: string
  commits?: PeerMessageCommit[]
  /** The message this one answers. */
  in_reply_to?: string
  /** The session an approved request started, on the server that approved it. */
  session_id?: string
  /** Why it was declined or failed. */
  reason?: string
  /** Who sent it, as the sending server names them. */
  sent_by?: string
  decided_by?: string
  created_at: string
  delivered_at?: string
  decided_at?: string
}

export interface PeerMessageRequestBody {
  kind: 'request'
  title: string
  prompt: string
  in_reply_to?: string
}

export interface PeerMessageNoticeBody {
  kind: 'notice'
  summary: string
  commits: PeerMessageCommit[]
  in_reply_to?: string
}

export type PeerMessageSendBody = PeerMessageRequestBody | PeerMessageNoticeBody

/** Approve a request into a session on one of this server's instances, or
 *  hand it to the orchestrator; a notice is approved with an empty body. */
export type PeerMessageApproveBody = { instance_id: string } | { handoff: 'orchestrator' } | Record<string, never>

export const PEER_MESSAGES_PATH = '/peer-messages'

/** The signal source the server raises for an incoming message waiting on a
 *  person. Such a signal is drawn by the message's own card, not as a
 *  question. */
export const PEER_MESSAGE_SIGNAL_SOURCE = 'peer_message'

export function peerConnectionMessagesPath(connectionID: string): string {
  return `/peer-connections/${encodeURIComponent(connectionID)}/messages`
}

export function peerMessagesListPath(filter: { connectionID?: string; direction?: PeerMessageDirection; state?: string } = {}): string {
  const query = new URLSearchParams()
  if (filter.connectionID) query.set('connection_id', filter.connectionID)
  if (filter.direction) query.set('direction', filter.direction)
  if (filter.state) query.set('state', filter.state)
  const encoded = query.toString()
  return encoded ? `${PEER_MESSAGES_PATH}?${encoded}` : PEER_MESSAGES_PATH
}

export function peerMessageApprovePath(messageID: string): string {
  return `${PEER_MESSAGES_PATH}/${encodeURIComponent(messageID)}/approve`
}

export function peerMessageDeclinePath(messageID: string): string {
  return `${PEER_MESSAGES_PATH}/${encodeURIComponent(messageID)}/decline`
}

/** Whether an incoming message is waiting on a person here. */
export function peerMessageNeedsDecision(message: PeerMessage): boolean {
  return message.direction === 'incoming' && message.state === 'pending' && message.kind !== 'status'
}

/** Whether a signal is one the server raised for a waiting peer message, which
 *  its card draws instead. */
export function isPeerMessageSignal(signal: { source: string }): boolean {
  return signal.source === PEER_MESSAGE_SIGNAL_SOURCE
}

/** An attention group without the signals raised for peer messages, which
 *  their own cards draw: a request whose every signal is one is dropped, and
 *  the group's count no longer includes them. */
export function withoutPeerMessageSignals<
  S extends { source: string },
  G extends { requests: readonly { signals: readonly S[] }[]; signals: readonly S[] },
>(group: G): G {
  return {
    ...group,
    requests: group.requests.filter(request => !request.signals.every(isPeerMessageSignal)),
    signals: group.signals.filter(signal => !isPeerMessageSignal(signal)),
  }
}

/** A `repo@commit` per line, as typed; blank lines are skipped. A line that is
 *  not `repo@commit` is returned as an error naming it, never guessed at. */
export function parsePeerMessageCommits(text: string): { commits: PeerMessageCommit[]; error: string | null } {
  const commits: PeerMessageCommit[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const at = line.lastIndexOf('@')
    const repo = at > 0 ? line.slice(0, at).trim() : ''
    const commit = at > 0 ? line.slice(at + 1).trim() : ''
    if (!repo || !/^[0-9a-f]{7,40}$/i.test(commit)) {
      return { commits: [], error: `“${line}” is not repo@commit, with a commit of at least seven hex characters` }
    }
    commits.push({ repo, commit })
  }
  return { commits, error: null }
}

export function peerMessageRequestBody(title: string, prompt: string, inReplyTo?: string): PeerMessageRequestBody {
  const body: PeerMessageRequestBody = { kind: 'request', title: title.trim(), prompt: prompt.trim() }
  if (inReplyTo) body.in_reply_to = inReplyTo
  return body
}

export function peerMessageNoticeBody(summary: string, commits: PeerMessageCommit[], inReplyTo?: string): PeerMessageNoticeBody {
  const body: PeerMessageNoticeBody = { kind: 'notice', summary: summary.trim(), commits }
  if (inReplyTo) body.in_reply_to = inReplyTo
  return body
}

/** One piece of a message's text: words as they are, or a web address shown
 *  as text the reader may copy. Nothing in a message is fetched or opened by
 *  drawing it. */
export type UntrustedTextPiece = { kind: 'text'; text: string } | { kind: 'address'; text: string }

const WEB_ADDRESS = /\bhttps?:\/\/[^\s<>"']+/g

/** A message's text, split so the card can draw addresses distinctly without
 *  making them load anything. */
export function untrustedTextPieces(text: string): UntrustedTextPiece[] {
  const pieces: UntrustedTextPiece[] = []
  let last = 0
  for (const match of text.matchAll(WEB_ADDRESS)) {
    const start = match.index ?? 0
    // A closing bracket with no opening one in the address belongs to the
    // text around it, as in markdown's `(https://…)`.
    let address = match[0]
    while (address.endsWith(')') && (address.match(/\(/g)?.length ?? 0) < (address.match(/\)/g)?.length ?? 0)) {
      address = address.slice(0, -1)
    }
    if (start > last) pieces.push({ kind: 'text', text: text.slice(last, start) })
    pieces.push({ kind: 'address', text: address })
    last = start + address.length
  }
  if (last < text.length) pieces.push({ kind: 'text', text: text.slice(last) })
  return pieces
}

/** A connection's messages as threads: each message that answers none starts
 *  one, and its answers follow it oldest first. An answer whose first message
 *  this list does not hold starts its own thread. Threads come newest first. */
export function peerMessageThreads(messages: readonly PeerMessage[]): PeerMessage[][] {
  const byID = new Map(messages.map(message => [message.id, message]))
  const rootOf = (message: PeerMessage): PeerMessage => {
    let current = message
    const seen = new Set<string>()
    while (current.in_reply_to && byID.has(current.in_reply_to) && !seen.has(current.id)) {
      seen.add(current.id)
      current = byID.get(current.in_reply_to)!
    }
    return current
  }
  const threads = new Map<string, PeerMessage[]>()
  for (const message of messages) {
    const root = rootOf(message)
    const thread = threads.get(root.id) ?? []
    thread.push(message)
    threads.set(root.id, thread)
  }
  const byTime = (a: PeerMessage, b: PeerMessage) => a.created_at.localeCompare(b.created_at)
  return [...threads.values()]
    .map(thread => [...thread].sort(byTime))
    .sort((a, b) => b[b.length - 1].created_at.localeCompare(a[a.length - 1].created_at))
}

/** What a message is, in a few words, for a thread row. */
export function peerMessageHeadline(message: PeerMessage, serverName: string): string {
  const from = message.direction === 'incoming' ? serverName : 'This server'
  switch (message.kind) {
    case 'request':
      return `${from} asks to start a session: ${message.title || '(untitled)'}`
    case 'notice':
      return `${from} says this is ready: ${message.summary || peerMessageCommitList(message.commits)}`
    case 'status':
      return `${from}: ${message.summary || message.title || message.state}`
  }
}

export function peerMessageCommitList(commits: readonly PeerMessageCommit[] | undefined): string {
  return (commits ?? []).map(c => `${c.repo}@${c.commit.slice(0, 9)}`).join(', ')
}

const PEER_MESSAGE_REFUSALS: Readonly<Record<string, string>> = {
  peer_messages_not_granted:
    'The other server has not given this one leave to send it messages. Its administrator gives that on its own Peers page.',
  peer_message_not_pending: 'Someone has already decided this message.',
  peer_not_connected: 'The other server is not connected right now. The message waits here and goes when it reconnects.',
  peer_message_not_found: 'This server has no such message.',
  unknown_instance: 'That instance is not one of this server’s.',
  orchestrator_not_configured: 'This server has no orchestrator to hand the request to.',
}

/** Plain words for a refusal a person can act on, else nothing (the caller
 *  shows the server's own message). */
export function peerMessageRefusalText(code: string): string | null {
  return PEER_MESSAGE_REFUSALS[code] ?? null
}
