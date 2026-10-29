import { describe, expect, it } from 'vitest'
import {
  isPeerMessageSignal,
  parsePeerMessageCommits,
  peerConnectionMessagesPath,
  peerMessageApprovePath,
  peerMessageDeclinePath,
  peerMessageHeadline,
  peerMessageNeedsDecision,
  peerMessageNoticeBody,
  peerMessageRefusalText,
  peerMessageRequestBody,
  peerMessageThreads,
  peerMessagesListPath,
  untrustedTextPieces,
  withoutPeerMessageSignals,
  type PeerMessage,
} from '../src/peerMessages'

const message = (over: Partial<PeerMessage>): PeerMessage => ({
  id: 'peer_message_000001',
  connection_id: 'peer_connection_000001',
  direction: 'incoming',
  kind: 'request',
  state: 'pending',
  created_at: '2026-10-29T10:00:00Z',
  ...over,
})

describe('peer message paths', () => {
  it('escapes ids and adds only the filters given', () => {
    expect(peerConnectionMessagesPath('peer_connection_000001')).toBe('/peer-connections/peer_connection_000001/messages')
    expect(peerMessageApprovePath('a/b')).toBe('/peer-messages/a%2Fb/approve')
    expect(peerMessageDeclinePath('m1')).toBe('/peer-messages/m1/decline')
    expect(peerMessagesListPath()).toBe('/peer-messages')
    expect(peerMessagesListPath({ direction: 'incoming', state: 'pending' })).toBe('/peer-messages?direction=incoming&state=pending')
    expect(peerMessagesListPath({ connectionID: 'peer_connection_000001' })).toBe('/peer-messages?connection_id=peer_connection_000001')
  })
})

describe('which messages need a person here', () => {
  it('is an incoming request or notice that is still pending', () => {
    expect(peerMessageNeedsDecision(message({}))).toBe(true)
    expect(peerMessageNeedsDecision(message({ kind: 'notice' }))).toBe(true)
    expect(peerMessageNeedsDecision(message({ kind: 'status' }))).toBe(false)
    expect(peerMessageNeedsDecision(message({ direction: 'outgoing' }))).toBe(false)
    expect(peerMessageNeedsDecision(message({ state: 'approved' }))).toBe(false)
  })
})

describe('signals raised for peer messages', () => {
  it('are taken out of the attention group, request and count alike', () => {
    const peer = { id: 's1', source: 'peer_message' }
    const question = { id: 's2', source: 'hook' }
    const group = {
      requests: [{ requestId: 'r1', signals: [peer] }, { requestId: 'r2', signals: [question] }],
      signals: [peer, question],
    }
    const filtered = withoutPeerMessageSignals(group)
    expect(filtered.requests.map(r => r.requestId)).toEqual(['r2'])
    expect(filtered.signals).toEqual([question])
    expect(isPeerMessageSignal(peer)).toBe(true)
    expect(isPeerMessageSignal(question)).toBe(false)
  })
})

describe('commit rows for a notice', () => {
  it('reads repo@commit per line and skips blank lines', () => {
    expect(parsePeerMessageCommits('llm-bridge-server@98bd56d\n\n llm-bridge-codex@50b8e69 ')).toEqual({
      commits: [
        { repo: 'llm-bridge-server', commit: '98bd56d' },
        { repo: 'llm-bridge-codex', commit: '50b8e69' },
      ],
      error: null,
    })
  })

  it('names a line that is not repo@commit instead of guessing', () => {
    expect(parsePeerMessageCommits('llm-bridge-server').error).toContain('llm-bridge-server')
    expect(parsePeerMessageCommits('repo@xyz').error).toContain('repo@xyz')
    expect(parsePeerMessageCommits('@98bd56d').error).not.toBeNull()
  })
})

describe('request bodies', () => {
  it('trims what was typed and carries the message answered only when there is one', () => {
    expect(peerMessageRequestBody('  Fix it ', ' do the thing\n')).toEqual({ kind: 'request', title: 'Fix it', prompt: 'do the thing' })
    expect(peerMessageNoticeBody('Ready', [{ repo: 'r', commit: 'abcdef1' }], 'peer_message_000002')).toEqual({
      kind: 'notice',
      summary: 'Ready',
      commits: [{ repo: 'r', commit: 'abcdef1' }],
      in_reply_to: 'peer_message_000002',
    })
  })
})

describe('text another server wrote', () => {
  it('splits out web addresses as text, keeping everything else as it is', () => {
    expect(untrustedTextPieces('see https://example.test/x?y=1 now\nand ![img](https://example.test/p.png)')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'address', text: 'https://example.test/x?y=1' },
      { kind: 'text', text: ' now\nand ![img](' },
      { kind: 'address', text: 'https://example.test/p.png' },
      { kind: 'text', text: ')' },
    ])
    expect(untrustedTextPieces('https://example.test/wiki/A_(b)')).toEqual([{ kind: 'address', text: 'https://example.test/wiki/A_(b)' }])
    expect(untrustedTextPieces('<script>alert(1)</script>')).toEqual([{ kind: 'text', text: '<script>alert(1)</script>' }])
  })
})

describe('threads', () => {
  it('puts each answer under the message it answers, oldest first, newest thread first', () => {
    const ask = message({ id: 'a', created_at: '2026-10-29T10:00:00Z' })
    const done = message({ id: 'b', direction: 'outgoing', kind: 'notice', in_reply_to: 'a', created_at: '2026-10-29T12:00:00Z' })
    const updated = message({ id: 'c', kind: 'status', in_reply_to: 'b', created_at: '2026-10-29T13:00:00Z' })
    const other = message({ id: 'd', created_at: '2026-10-29T11:00:00Z' })
    const orphan = message({ id: 'e', in_reply_to: 'not-here', created_at: '2026-10-29T09:00:00Z' })
    const threads = peerMessageThreads([updated, other, ask, orphan, done])
    expect(threads.map(thread => thread.map(m => m.id))).toEqual([['a', 'b', 'c'], ['d'], ['e']])
  })
})

describe('headlines and refusals', () => {
  it('says who wrote it and what it is', () => {
    expect(peerMessageHeadline(message({ title: 'Fix resume' }), 'its-skayushkin')).toBe('its-skayushkin asks to start a session: Fix resume')
    expect(
      peerMessageHeadline(message({ direction: 'outgoing', kind: 'notice', commits: [{ repo: 'r', commit: '0123456789abcdef' }] }), 'x'),
    ).toBe('This server says this is ready: r@012345678')
  })

  it('has plain words only for refusals a person can act on', () => {
    expect(peerMessageRefusalText('peer_messages_not_granted')).toContain('leave')
    expect(peerMessageRefusalText('something_else')).toBeNull()
  })
})
