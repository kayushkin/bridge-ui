// Peers: other llm-bridge-servers this one is connected to, and what each
// lets the other do.
//
// A connection says only how two servers reach each other. An administrator
// on a server with an https address makes a one-time passphrase; the other
// server's administrator enters that address and passphrase. If the entering
// server gives its own https address too, both call each other directly;
// otherwise it dials out and keeps a socket open, and requests both ways
// travel over it. A connection gives no access. Each server then grants the
// other a level on itself, and revokes it, on its own. llm-bridge-server's
// `peers.go` and `peer_connection_proxy.go` are the contract; design note
// d107154a-49ac-471b-a1b7-fc7975de37f3 is the why.
//
// The pure rules the Peers page and a connected server's page draw from.

import {
  PeerAccessLevelGroup,
  PeerTransportDialOut,
  PeerTransportDirect,
  type PeerAccessLevel,
  type PeerConnectRequest,
  type PeerConnection,
  type PeerConnectionInvite,
  type PeerConnectionInviteRequest,
  type PeerConnectionView,
  type PeerGrantRequest,
  type PeerReasonRequest,
  type ServiceSettings,
} from '@kayushkin/llm-bridge-types'
import type { BridgeConfig } from './context'

export const PEER_CONNECTION_INVITES_PATH = '/peer-connection-invites'
export const PEER_CONNECTIONS_PATH = '/peer-connections'
export const PEER_ACCESS_LEVELS_PATH = '/peer-access-levels'

export function peerConnectionPath(connectionID: string): string {
  return `${PEER_CONNECTIONS_PATH}/${encodeURIComponent(connectionID)}`
}

export function peerConnectionRemovePath(connectionID: string): string {
  return `${peerConnectionPath(connectionID)}/remove`
}

export function peerConnectionGrantPath(connectionID: string): string {
  return `${peerConnectionPath(connectionID)}/grant`
}

export function peerConnectionRevokeGrantPath(connectionID: string): string {
  return `${peerConnectionPath(connectionID)}/revoke-grant`
}

export function peerConnectionCheckPath(connectionID: string): string {
  return `${peerConnectionPath(connectionID)}/check`
}

export function peerAccessLevelProvisionPath(levelKey: string): string {
  return `${PEER_ACCESS_LEVELS_PATH}/${encodeURIComponent(levelKey)}/provision`
}

/** Where the connected server answers: every route of it, under this server's
 *  proxy for the connection, which picks direct or the socket itself. */
export function peerConnectionProxyBasePath(basePath: string, connectionID: string): string {
  return `${basePath}${peerConnectionPath(connectionID)}/proxy`
}

/** How long a connection passphrase may wait to be used. These are the
 *  choices offered; the server keeps its own limit and says so past it. */
export const PEER_CONNECTION_INVITE_LIFETIMES: readonly { label: string; seconds: number }[] = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
]

export function peerConnectionInviteRequestBody(expiresInSeconds: number): PeerConnectionInviteRequest {
  return { expires_in_seconds: expiresInSeconds }
}

export interface PeerConnectForm {
  baseURL: string
  passphrase: string
  displayName: string
  nameForThisServer: string
  thisServerBaseURL: string
}

export const EMPTY_PEER_CONNECT_FORM: PeerConnectForm = {
  baseURL: '', passphrase: '', displayName: '', nameForThisServer: '', thisServerBaseURL: '',
}

/** The connect form as typed, trimmed. An empty address for this server is
 *  left out, which is what makes the connection dial out. The server checks
 *  both addresses are https and says why when one is not, so nothing is
 *  checked here. */
export function peerConnectRequestBody(form: PeerConnectForm): PeerConnectRequest {
  const thisServerBaseURL = form.thisServerBaseURL.trim()
  return {
    base_url: form.baseURL.trim(),
    passphrase: form.passphrase.trim(),
    display_name: form.displayName.trim(),
    name_for_this_server: form.nameForThisServer.trim(),
    ...(thisServerBaseURL ? { this_server_base_url: thisServerBaseURL } : {}),
  }
}

/** A grant names a level key; only the `group` level names a group, and a
 *  group named with any other level would be ignored, so it is not sent. */
export function peerGrantRequestBody(levelKey: string, groupPrincipalID: string): PeerGrantRequest {
  return levelKey === PeerAccessLevelGroup
    ? { level: levelKey, group_principal_id: groupPrincipalID.trim() }
    : { level: levelKey }
}

export function peerReasonRequestBody(reason: string): PeerReasonRequest {
  return { reason: reason.trim() }
}

/** A level can be granted once it needs no group, or once its group exists. */
export function peerAccessLevelIsReady(level: PeerAccessLevel): boolean {
  return !level.needs_group || !!level.group_principal_id
}

/** The level's name as the server serves it, or the key when this server no
 *  longer offers that level. */
export function peerAccessLevelName(levels: readonly PeerAccessLevel[] | null, key: string): string {
  return levels?.find(level => level.key === key)?.display_name ?? key
}

/** What the page says about how two servers reach each other. The transport
 *  values come from llm-bridge's constants, not from a copy. */
export function peerTransportDescription(connection: PeerConnection): string {
  if (connection.transport === PeerTransportDirect) return 'direct: each server calls the other at its address'
  if (connection.transport === PeerTransportDialOut) {
    return connection.remote_base_url
      ? 'dial-out: this server keeps a socket open to the other'
      : 'dial-out: the other server keeps a socket open to this one'
  }
  return connection.transport
}

export type PeerConnectionReach = 'removed' | 'direct' | 'socket open' | 'socket closed'

/** Whether requests can travel now. A direct connection has no socket; a
 *  dial-out one works only while its socket is open. */
export function peerConnectionReach(view: PeerConnectionView): PeerConnectionReach {
  if (view.connection.removed_at) return 'removed'
  if (view.connection.transport === PeerTransportDirect) return 'direct'
  return view.socket_connected ? 'socket open' : 'socket closed'
}

export function peerConnectionIsRemoved(view: PeerConnectionView): boolean {
  return !!view.connection.removed_at
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

export type PeerConnectionInviteState = 'waiting' | 'used' | 'expired'

export function peerConnectionInviteState(invite: PeerConnectionInvite, now: Date): PeerConnectionInviteState {
  if (invite.redeemed_at) return 'used'
  return new Date(invite.expires_at).getTime() <= now.getTime() ? 'expired' : 'waiting'
}

/** This server's own https address, from its `public_url` setting, which the
 *  server's `/settings` serves. Empty when it is not set: the page then says
 *  so rather than guess an address from the browser's location. */
export function thisServerPublicURL(settings: ServiceSettings | null): string {
  return settings?.settings.find(setting => setting.key === 'public_url')?.value.trim() ?? ''
}

/** Plain words for the refusals a person can act on, keyed by the code the
 *  server answers with. The server's own message follows, unchanged. */
const PEER_REFUSAL_EXPLANATIONS: Readonly<Record<string, string>> = {
  peer_access_not_delivered:
    'The other server did not take the access, so it was revoked here again. Check that the connection is up and try once more.',
  demo_login_enabled:
    'This server still has demo login on, which lets anyone who reaches it sign in as anyone, so it takes no call from another server. Switch demo login off first.',
  peer_access_not_held:
    'The other server has not given this one any access yet. Its administrator grants a level on its own Peers page.',
  peer_not_connected:
    'The other server is not connected now: its socket to this one is closed. It reconnects by itself when it is running and online.',
}

/** The error text of a refused peer route: llm-bridge-server answers
 *  `{"error":{"code","message"}}`, and the message says what to do. A code a
 *  person can act on gets its plain explanation first. */
export async function peerRouteErrorText(res: Response, verb: string): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `${verb}: HTTP ${res.status}`
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; message?: unknown } | string }
    if (typeof parsed.error === 'string') return `${verb}: ${parsed.error}`
    if (parsed.error && typeof parsed.error.message === 'string') {
      const code = typeof parsed.error.code === 'string' ? parsed.error.code : ''
      const explanation = code ? PEER_REFUSAL_EXPLANATIONS[code] : undefined
      const serverWords = `${parsed.error.message}${code ? ` (${code})` : ''}`
      return explanation ? `${verb}: ${explanation} The server said: ${serverWords}` : `${verb}: ${serverWords}`
    }
  } catch {
    // Not JSON; the raw text is the message.
  }
  return `${verb}: ${text}`
}

/** The config a connected server's page runs with: `basePath` is the
 *  connection's proxy, and every other path is emptied. Every other base path
 *  names one of THIS host's stores or pages, and the other server's ids mean
 *  nothing there — a session id looked up in this host's log-store, or a card
 *  chip resolved against this host's kanban, would answer about the wrong
 *  record. An empty path is the library's "not configured here", which every
 *  page and chip already says out loud. Fields are emptied by type rather than
 *  by name, so a path added to `BridgeConfig` later is emptied too. */
export function peerConnectionBridgeConfig(config: BridgeConfig, connectionID: string): BridgeConfig {
  const emptied = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, typeof value === 'string' ? '' : value]),
  ) as unknown as BridgeConfig
  return {
    ...emptied,
    basePath: peerConnectionProxyBasePath(config.basePath, connectionID),
    renderHarnessExtension: null,
  }
}
