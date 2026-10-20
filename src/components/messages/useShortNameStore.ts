import { useCallback } from 'react'
import { useBridgeConfig } from '../../context'
import { shortNameResolvePath, shortNamesPageIsLast, shortNamesPagePath, shortNameStoreRefusal } from '../../messageShortNames'
import type { ShortName, ShortNameResolution } from '../../types-short-name-store'

export type ShortNameLookup = { kind: 'found'; resolution: ShortNameResolution } | { kind: 'missing' }
export type ShortNameWriteResult = { ok: true; name: ShortName } | { ok: false; error: string }

/** Requests to short-name-store through the host's proxy
 *  (`shortNameStoreBasePath`). A read throws the store's refusal in its own
 *  words; a write returns it, for the form that caused it. */
export function useShortNameStore() {
  const { fetch: apiFetch, shortNameStoreBasePath } = useBridgeConfig()

  /** Every current room name in namespace messages, a page at a time. */
  const listRoomNames = useCallback(async (): Promise<ShortName[]> => {
    const all: ShortName[] = []
    for (;;) {
      const path = shortNamesPagePath(all.length)
      const res = await apiFetch(`${shortNameStoreBasePath}${path}`)
      if (!res.ok) throw new Error(`GET ${path} → ${shortNameStoreRefusal(res.status, await res.text())}`)
      const page = await res.json() as ShortName[] | null ?? []
      all.push(...page)
      if (shortNamesPageIsLast(page)) return all
    }
  }, [apiFetch, shortNameStoreBasePath])

  /** What a path names. A 404 is an answer, not a failure. */
  const resolve = useCallback(async (shortPath: string): Promise<ShortNameLookup> => {
    const path = shortNameResolvePath(shortPath)
    const res = await apiFetch(`${shortNameStoreBasePath}${path}`)
    if (res.status === 404) return { kind: 'missing' }
    if (!res.ok) throw new Error(`GET ${path} → ${shortNameStoreRefusal(res.status, await res.text())}`)
    return { kind: 'found', resolution: await res.json() as ShortNameResolution }
  }, [apiFetch, shortNameStoreBasePath])

  const create = useCallback(async (body: Record<string, string>): Promise<ShortNameWriteResult> => {
    try {
      const res = await apiFetch(`${shortNameStoreBasePath}/short-names`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) return { ok: false, error: shortNameStoreRefusal(res.status, await res.text()) }
      return { ok: true, name: await res.json() as ShortName }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [apiFetch, shortNameStoreBasePath])

  return { listRoomNames, resolve, create, configured: !!shortNameStoreBasePath }
}
