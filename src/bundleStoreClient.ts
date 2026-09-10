import type { FetchFn } from './types'
import type { Bundle, BundleResolution, RepoStoreRepo } from './types-bundles'

// The bundle-store and repo-store reads the Bundles page makes, as typed
// functions over the host's authenticated fetch.
//
// Every call answers a `BundleStoreResult`: the parsed body on success, and on
// failure the server's own `{"error":"…"}` text, verbatim — bundle-store's
// refusals name the bundle and the member, so the page shows them as they
// arrive. When the body carries no `error`, the raw text is the message; when
// there is no body at all, the status is.

export type BundleStoreResult<T> = { ok: true; value: T } | { ok: false; error: string }

async function errorText(res: Response, verb: string): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `${verb}: HTTP ${res.status}`
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    if (typeof parsed?.error === 'string' && parsed.error) return `${verb}: ${parsed.error}`
  } catch {
    // Not JSON; the raw text is the message.
  }
  return `${verb}: ${text}`
}

async function request<T>(fetchFn: FetchFn, verb: string, url: string, init?: RequestInit): Promise<BundleStoreResult<T>> {
  let res: Response
  try {
    res = await fetchFn(url, init)
  } catch (err) {
    return { ok: false, error: `${verb}: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!res.ok) return { ok: false, error: await errorText(res, verb) }
  try {
    return { ok: true, value: (await res.json()) as T }
  } catch (err) {
    return { ok: false, error: `${verb}: response was not JSON (${err instanceof Error ? err.message : String(err)})` }
  }
}

export function listBundles(fetchFn: FetchFn, bundleStoreBasePath: string): Promise<BundleStoreResult<Bundle[] | null>> {
  return request(fetchFn, 'list bundles', `${bundleStoreBasePath}/bundles`)
}

/** Every repo. repo-store applies a LIMIT only when `limit` is sent, so this
 *  sends none: a capped list would pass for the whole one. */
export function listRepos(fetchFn: FetchFn, repoStoreBasePath: string): Promise<BundleStoreResult<RepoStoreRepo[] | null>> {
  return request(fetchFn, 'list repos', `${repoStoreBasePath}/repos`)
}

export function resolveBundles(
  fetchFn: FetchFn, bundleStoreBasePath: string, repoTags: string[], taskTags: string[],
): Promise<BundleStoreResult<BundleResolution>> {
  return request(fetchFn, 'resolve', `${bundleStoreBasePath}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_tags: repoTags, task_tags: taskTags }),
  })
}
