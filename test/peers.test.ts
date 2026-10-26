import { describe, expect, it } from 'vitest'
import type { PeerInvite, PeerLink } from '@kayushkin/llm-bridge-types'
import { DEFAULT_BRIDGE_ROUTES, type BridgeConfig } from '../src/context'
import {
  liveFirstNewestFirst,
  peerInviteRequestBody,
  peerInviteState,
  peerLinkBridgeConfig,
  peerLinkProxyBasePath,
  peerLinkRemovePath,
  peerLinkRequestBody,
  peerRouteErrorText,
} from '../src/peers'

const invite = (overrides: Partial<PeerInvite> = {}): PeerInvite => ({
  id: 'peer_invite_000001',
  peer_principal_id: 'principal_000020',
  created_by: 'principal_000001',
  created_at: '2026-10-26T10:00:00Z',
  expires_at: '2026-10-26T11:00:00Z',
  ...overrides,
})

const link = (id: string, createdAt: string, removedAt?: string): PeerLink => ({
  id,
  base_url: 'https://bridge.example.com',
  display_name: id,
  remote_peer_principal_id: 'principal_000020',
  remote_peer_token_id: 'peer_token_000001',
  credential_id: 'cred_1',
  created_by: 'principal_000001',
  created_at: createdAt,
  ...(removedAt ? { removed_at: removedAt } : {}),
})

describe('peer paths and bodies', () => {
  it('mounts a linked server under its link, with the id escaped', () => {
    expect(peerLinkProxyBasePath('/api/bridge', 'peer_link_000001')).toBe('/api/bridge/peer-links/peer_link_000001/proxy')
    expect(peerLinkRemovePath('a/b')).toBe('/peer-links/a%2Fb/remove')
  })

  it('sends the link form trimmed and the invite with its lifetime', () => {
    expect(peerLinkRequestBody({ baseURL: ' https://b.example.com/ ', displayName: ' laptop ', passphrase: ' p ' }))
      .toEqual({ base_url: 'https://b.example.com/', display_name: 'laptop', passphrase: 'p' })
    expect(peerInviteRequestBody('principal_000020', 3600)).toEqual({ peer_principal_id: 'principal_000020', expires_in_seconds: 3600 })
  })
})

describe('peerInviteState', () => {
  const now = new Date('2026-10-26T10:30:00Z')
  it('waits until it expires, and a redemption wins over the expiry', () => {
    expect(peerInviteState(invite(), now)).toBe('waiting')
    expect(peerInviteState(invite({ expires_at: '2026-10-26T10:30:00Z' }), now)).toBe('expired')
    expect(peerInviteState(invite({ expires_at: '2026-10-26T10:00:00Z', redeemed_at: '2026-10-26T10:05:00Z' }), now)).toBe('redeemed')
  })
})

describe('liveFirstNewestFirst', () => {
  it('puts live rows above removed ones, each newest first', () => {
    const rows = [
      link('old-live', '2026-10-01T00:00:00Z'),
      link('new-removed', '2026-10-20T00:00:00Z', '2026-10-21T00:00:00Z'),
      link('new-live', '2026-10-10T00:00:00Z'),
    ]
    expect(liveFirstNewestFirst(rows, l => !l.removed_at).map(l => l.id)).toEqual(['new-live', 'old-live', 'new-removed'])
  })
})

describe('peerRouteErrorText', () => {
  it("shows llm-bridge-server's message and code", async () => {
    const res = new Response(JSON.stringify({ error: { code: 'demo_login_enabled', message: 'making a peer invite is refused while demo login is on' } }), { status: 409 })
    expect(await peerRouteErrorText(res, 'Invite')).toBe('Invite: making a peer invite is refused while demo login is on (demo_login_enabled)')
  })
  it('falls to the raw text, then the status', async () => {
    expect(await peerRouteErrorText(new Response('llm-bridge unavailable', { status: 502 }), 'Link')).toBe('Link: llm-bridge unavailable')
    expect(await peerRouteErrorText(new Response('', { status: 403 }), 'Link')).toBe('Link: HTTP 403')
  })
})

describe('peerLinkBridgeConfig', () => {
  const fetchFn = async () => new Response()
  const local = {
    fetch: fetchFn,
    basePath: '/api/bridge',
    kanbanStoreBasePath: '/api/kanban',
    noteboardBasePath: '/api/noteboard',
    resolveEndpoint: '/api/resolve',
    journalPagePath: '/journal',
    renderHarnessExtension: () => null,
    routes: DEFAULT_BRIDGE_ROUTES,
  } as unknown as BridgeConfig

  it("points at the link's proxy and empties every path to this host's stores", () => {
    const peer = peerLinkBridgeConfig(local, 'peer_link_000001')
    expect(peer.basePath).toBe('/api/bridge/peer-links/peer_link_000001/proxy')
    expect(peer.kanbanStoreBasePath).toBe('')
    expect(peer.noteboardBasePath).toBe('')
    expect(peer.resolveEndpoint).toBe('')
    expect(peer.journalPagePath).toBe('')
    expect(peer.renderHarnessExtension).toBeNull()
  })

  it('keeps the host fetch and the routes', () => {
    const peer = peerLinkBridgeConfig(local, 'peer_link_000001')
    expect(peer.fetch).toBe(fetchFn)
    expect(peer.routes).toBe(DEFAULT_BRIDGE_ROUTES)
  })
})
