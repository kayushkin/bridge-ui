import { describe, expect, it } from 'vitest'
import { patchBoard, putPriorityLadder } from '../src/kanbanStoreClient'
import type { FetchFn } from '../src/types'

describe('kanbanStoreClient', () => {
  it('PATCHes exactly the patch it is given to the board’s URL', async () => {
    let seen: { url: string; method?: string; body?: unknown } | null = null
    const fetchFn = (async (url: string, init?: RequestInit) => {
      seen = { url, method: init?.method, body: JSON.parse(String(init?.body)) }
      return new Response(JSON.stringify({ id: 'b1' }), { status: 200 })
    }) as unknown as FetchFn
    const result = await patchBoard(fetchFn, '/api/kanban', 'b1', { default_instance_id: '' })
    expect(result.ok).toBe(true)
    expect(seen).toEqual({ url: '/api/kanban/api/boards/b1', method: 'PATCH', body: { default_instance_id: '' } })
  })

  it('returns kanban-store’s refusal verbatim, so the page shows the owner’s words', async () => {
    const refusal = 'default_bundle_id: not found in bundle-store: bundle-store refused id "docker" ({"error":"invalid id"}) — send bundle-store\'s numeric id, not the bundle\'s name'
    const fetchFn = (async () => new Response(JSON.stringify({ error: refusal }), { status: 400 })) as unknown as FetchFn
    const result = await patchBoard(fetchFn, '/api/kanban', 'b1', { default_bundle_id: 'docker' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(refusal)
  })

  it('reports an owner that could not be asked as an error, not as success', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ error: 'llm-bridge-server check of default_instance_id failed: connection refused' }), { status: 502 })) as unknown as FetchFn
    const result = await putPriorityLadder(fetchFn, '/api/kanban', 'b1', { levels: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('connection refused')
  })
})
