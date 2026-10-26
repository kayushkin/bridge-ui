// Peers: other llm-bridge-servers linked to the one this UI runs over.
//
// A link has two ends and each server keeps only its own. On the issuing end
// an administrator makes an invite for a principal of kind `peer` and hands
// its one-time passphrase to the other server's operator; the tokens that
// invites turned into are listed there and revoked there. On the calling end
// that operator posts the passphrase as a link, and from then on reaches the
// other server through `{basePath}/peer-links/{id}/proxy/…`, as the peer
// principal the token acts as there. llm-bridge-server's `peers.go` and
// `peer_link_proxy.go` are the contract; design note
// d107154a-49ac-471b-a1b7-fc7975de37f3 is the why.
//
// The pure rules the Peers page and a linked server's page draw from.

import type {
  PeerInvite,
  PeerInviteRequest,
  PeerLink,
  PeerLinkRequest,
  PeerReasonRequest,
  PeerToken,
} from '@kayushkin/llm-bridge-types'
import type { BridgeConfig } from './context'

export const PEER_INVITES_PATH = '/peer-invites'
export const PEER_TOKENS_PATH = '/peer-tokens'
export const PEER_LINKS_PATH = '/peer-links'

export function peerTokenRevokePath(tokenID: string): string {
  return `${PEER_TOKENS_PATH}/${encodeURIComponent(tokenID)}/revoke`
}

export function peerLinkCheckPath(linkID: string): string {
  return `${PEER_LINKS_PATH}/${encodeURIComponent(linkID)}/check`
}

export function peerLinkRemovePath(linkID: string): string {
  return `${PEER_LINKS_PATH}/${encodeURIComponent(linkID)}/remove`
}

/** Where the linked server answers: every route of it, under this server's
 *  proxy for the link. */
export function peerLinkProxyBasePath(basePath: string, linkID: string): string {
  return `${basePath}${PEER_LINKS_PATH}/${encodeURIComponent(linkID)}/proxy`
}

/** How long an invite may wait to be redeemed. The server takes any number of
 *  seconds up to a week and refuses more; these are the choices offered. */
export const PEER_INVITE_LIFETIMES: readonly { label: string; seconds: number }[] = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
]

export function peerInviteRequestBody(peerPrincipalID: string, expiresInSeconds: number): PeerInviteRequest {
  return { peer_principal_id: peerPrincipalID, expires_in_seconds: expiresInSeconds }
}

/** The link form as typed, trimmed. The server checks the URL is https and
 *  says why when it is not, so nothing is checked here. */
export function peerLinkRequestBody(form: { baseURL: string; displayName: string; passphrase: string }): PeerLinkRequest {
  return { base_url: form.baseURL.trim(), display_name: form.displayName.trim(), passphrase: form.passphrase.trim() }
}

export function peerReasonRequestBody(reason: string): PeerReasonRequest {
  return { reason: reason.trim() }
}

export type PeerInviteState = 'waiting' | 'redeemed' | 'expired'

/** An invite is redeemed once; until then it waits, and after its expiry it
 *  can no longer be redeemed. */
export function peerInviteState(invite: PeerInvite, now: Date): PeerInviteState {
  if (invite.redeemed_at) return 'redeemed'
  return new Date(invite.expires_at).getTime() <= now.getTime() ? 'expired' : 'waiting'
}

export function peerTokenIsRevoked(token: PeerToken): boolean {
  return !!token.revoked_at
}

export function peerLinkIsRemoved(link: PeerLink): boolean {
  return !!link.removed_at
}

/** The live rows first, each part newest first, so what still works is at
 *  the top and what was taken away stays visible below it. */
export function liveFirstNewestFirst<T extends { created_at: string }>(rows: readonly T[], isLive: (row: T) => boolean): T[] {
  return [...rows].sort((a, b) => {
    const liveOrder = Number(isLive(b)) - Number(isLive(a))
    if (liveOrder !== 0) return liveOrder
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** The error text of a refused peer route: llm-bridge-server answers
 *  `{"error":{"code","message"}}`, and the message says what to do. */
export async function peerRouteErrorText(res: Response, verb: string): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `${verb}: HTTP ${res.status}`
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; message?: unknown } | string }
    if (typeof parsed.error === 'string') return `${verb}: ${parsed.error}`
    if (parsed.error && typeof parsed.error.message === 'string') {
      return `${verb}: ${parsed.error.message}${typeof parsed.error.code === 'string' ? ` (${parsed.error.code})` : ''}`
    }
  } catch {
    // Not JSON; the raw text is the message.
  }
  return `${verb}: ${text}`
}

/** The config a linked server's page runs with: `basePath` is the link's
 *  proxy, and every other path is emptied. Every other base path names one of
 *  THIS host's stores or pages, and the linked server's ids mean nothing there
 *  — a session id looked up in this host's log-store, or a card chip resolved
 *  against this host's kanban, would answer about the wrong record. An empty
 *  path is the library's "not configured here", which every page and chip
 *  already says out loud. Fields are emptied by type rather than by name, so a
 *  path added to `BridgeConfig` later is emptied too. */
export function peerLinkBridgeConfig(config: BridgeConfig, linkID: string): BridgeConfig {
  const emptied = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, typeof value === 'string' ? '' : value]),
  ) as unknown as BridgeConfig
  return {
    ...emptied,
    basePath: peerLinkProxyBasePath(config.basePath, linkID),
    renderHarnessExtension: null,
  }
}
