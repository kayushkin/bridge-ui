import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { PeerInvite, PeerInviteCreated, PeerLink, PeerSelf, PeerToken } from '@kayushkin/llm-bridge-types'
import { useBridgeConfig } from '../context'
import { usePrincipals } from '../usePrincipals'
import {
  PEER_INVITES_PATH,
  PEER_INVITE_LIFETIMES,
  PEER_LINKS_PATH,
  PEER_TOKENS_PATH,
  liveFirstNewestFirst,
  peerInviteRequestBody,
  peerInviteState,
  peerLinkCheckPath,
  peerLinkIsRemoved,
  peerLinkRemovePath,
  peerLinkRequestBody,
  peerReasonRequestBody,
  peerRouteErrorText,
  peerTokenIsRevoked,
  peerTokenRevokePath,
} from '../peers'

// Other llm-bridge-servers, both directions: the servers this one holds a
// link to, and the invites and tokens that let other servers act here. Every
// route is an operator route, so a person who is not an administrator sees the
// server's 403 in each section. Rules in `src/peers.ts`.

function formatWhen(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleString() : ''
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Reads one peer list, and re-reads it when asked. */
function usePeerList<T>(path: string): { rows: T[] | null; error: string | null; reload: () => void } {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [rows, setRows] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    void (async () => {
      try {
        const res = await fetchFn(`${basePath}${path}`)
        if (!res.ok) { setError(await peerRouteErrorText(res, `GET ${path}`)); return }
        setRows(((await res.json()) as T[] | null) ?? [])
        setError(null)
      } catch (err) {
        setError(`GET ${path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }, [fetchFn, basePath, path])
  useEffect(() => { reload() }, [reload])
  return { rows, error, reload }
}

export function BridgePeers() {
  const links = usePeerList<PeerLink>(PEER_LINKS_PATH)
  const tokens = usePeerList<PeerToken>(PEER_TOKENS_PATH)
  const invites = usePeerList<PeerInvite>(PEER_INVITES_PATH)
  const principals = usePrincipals()
  const principalName = useCallback(
    (id: string) => principals.byId.get(id)?.display_name ?? id,
    [principals.byId],
  )
  return (
    <div className="bp-container bg-container pr-container">
      <header className="bg-head">
        <h2 className="bg-title">Peers</h2>
        <p className="bp-hint">
          Other llm-bridge-servers. Each direction is its own link: a server reaches another with a token that the other
          server issued, and acts there as one principal of kind <code>peer</code>, which may do only what its grants,
          its groups or its administrator flag allow.
        </p>
      </header>

      <section className="pr-section" aria-label="Servers this one reaches">
        <h3 className="pr-section-title">Servers this one reaches</h3>
        <p className="bp-hint">
          Ask the other server&apos;s operator for an invite passphrase, then link to it here. The token it issues is kept
          in auth-store, and the link opens that server&apos;s sessions.
        </p>
        <LinkForm onLinked={links.reload} />
        {links.error && <div className="bridge-error bp-error">{links.error}</div>}
        <LinksTable links={links.rows} onChanged={links.reload} />
      </section>

      <section className="pr-section" aria-label="Servers that reach this one">
        <h3 className="pr-section-title">Servers that reach this one</h3>
        <p className="bp-hint">
          Make an invite for a principal of kind <code>peer</code> and hand its passphrase to the other server&apos;s
          operator. A peer that holds no grant may do nothing, so grant it what it needs on the Grants page.
        </p>
        <InviteForm
          peerPrincipals={principals.list.filter(p => p.kind === 'peer' && !p.disabled_at)}
          principalStoreEnabled={principals.enabled}
          principalStoreError={principals.error}
          onInvited={invites.reload}
        />
        {tokens.error && <div className="bridge-error bp-error">{tokens.error}</div>}
        <TokensTable tokens={tokens.rows} principalName={principalName} onChanged={tokens.reload} />
        {invites.error && <div className="bridge-error bp-error">{invites.error}</div>}
        <InvitesTable invites={invites.rows} principalName={principalName} />
      </section>
    </div>
  )
}

function LinkForm({ onLinked }: { onLinked: () => void }) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [form, setForm] = useState({ baseURL: '', displayName: '', passphrase: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetchFn(`${basePath}${PEER_LINKS_PATH}`, jsonPost(peerLinkRequestBody(form)))
      if (!res.ok) { setError(await peerRouteErrorText(res, 'Link')); return }
      setForm({ baseURL: '', displayName: '', passphrase: '' })
      onLinked()
    } catch (err) {
      setError(`Link: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="bg-form" onSubmit={submit} aria-label="Link to a server">
      <label className="bg-filter pr-url-field">
        <span>Address</span>
        <input type="text" placeholder="https://bridge.example.com" value={form.baseURL} onChange={e => setForm({ ...form, baseURL: e.target.value })} required />
      </label>
      <label className="bg-filter">
        <span>Name</span>
        <input type="text" placeholder="laptop bridge" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required />
      </label>
      <label className="bg-filter">
        <span>Passphrase</span>
        <input type="password" autoComplete="off" value={form.passphrase} onChange={e => setForm({ ...form, passphrase: e.target.value })} required />
      </label>
      <button type="submit" className="bp-submit bg-submit" disabled={busy}>{busy ? 'Linking…' : 'Link'}</button>
      {error && <div className="bridge-error bp-error bg-form-error">{error}</div>}
    </form>
  )
}

function LinksTable({ links, onChanged }: { links: PeerLink[] | null; onChanged: () => void }) {
  const { routes } = useBridgeConfig()
  const sorted = useMemo(() => liveFirstNewestFirst(links ?? [], l => !peerLinkIsRemoved(l)), [links])
  return (
    <table className="bg-table pr-table">
      <thead>
        <tr><th>Server</th><th>Acts there as</th><th>Linked</th><th></th></tr>
      </thead>
      <tbody>
        {links === null && <tr><td colSpan={4} className="bp-empty-inline">Loading…</td></tr>}
        {links !== null && links.length === 0 && <tr><td colSpan={4} className="bp-empty-inline">This server holds no link.</td></tr>}
        {sorted.map(link => {
          const removed = peerLinkIsRemoved(link)
          return (
            <tr key={link.id} className={removed ? 'bg-row-revoked' : ''} data-peer-link-id={link.id}>
              <td>
                {removed ? link.display_name : <Link to={`${routes.peerLink}/${encodeURIComponent(link.id)}`}>{link.display_name}</Link>}
                <div className="bp-hint">{link.base_url}</div>
              </td>
              <td title="The other server's principal-store id">
                <code>{link.remote_peer_principal_id}</code>
                <div className="bp-hint">token <code>{link.remote_peer_token_id}</code></div>
              </td>
              <td className="bg-when">
                {formatWhen(link.created_at)}
                {removed && <span className="bp-badge bp-badge-disabled" title={link.remove_reason}>removed {formatWhen(link.removed_at)}</span>}
              </td>
              <td className="bg-actions">
                {!removed && <CheckLink link={link} />}
                {!removed && <ReasonAction label="Remove" path={peerLinkRemovePath(link.id)} onDone={onChanged} doneNote={answer => (answer as { note?: string }).note ?? ''} />}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Asks the other server who the link's token acts as there. */
function CheckLink({ link }: { link: PeerLink }) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [result, setResult] = useState<{ ok: true; self: PeerSelf } | { ok: false; error: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true)
    try {
      const res = await fetchFn(`${basePath}${peerLinkCheckPath(link.id)}`, jsonPost({}))
      if (!res.ok) { setResult({ ok: false, error: await peerRouteErrorText(res, 'Check') }); return }
      setResult({ ok: true, self: (await res.json()) as PeerSelf })
    } catch (err) {
      setResult({ ok: false, error: `Check: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="pr-check">
      <button type="button" className="bp-cancel" disabled={busy} onClick={() => { void check() }}>{busy ? 'Checking…' : 'Check'}</button>
      {result?.ok === true && (
        <span className="bp-hint pr-check-result">
          works: acts as <code>{result.self.peer_principal_id}</code>{result.self.is_administrator ? ', an administrator' : ''}
        </span>
      )}
      {result?.ok === false && <span className="bridge-error bp-error pr-check-result">{result.error}</span>}
    </span>
  )
}

/** A button that asks for a reason, then posts it. The reason stays on the row. */
function ReasonAction({ label, path, onDone, doneNote }: {
  label: string
  path: string
  onDone: () => void
  doneNote?: (answer: unknown) => string
}) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetchFn(`${basePath}${path}`, jsonPost(peerReasonRequestBody(reason)))
      if (!res.ok) { setError(await peerRouteErrorText(res, label)); return }
      setNote(doneNote ? doneNote(await res.json()) : '')
      setOpen(false)
      onDone()
    } catch (err) {
      setError(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }
  if (note) return <span className="bp-hint pr-reason-note">{note}</span>
  if (!open) return <button type="button" className="bp-cancel" onClick={() => setOpen(true)}>{label}</button>
  return (
    <form className="pr-reason" onSubmit={submit}>
      <input type="text" className="bp-input" placeholder="Why" value={reason} onChange={e => setReason(e.target.value)} required autoFocus />
      <button type="submit" className="bp-cancel" disabled={busy}>{busy ? `${label}…` : label}</button>
      <button type="button" className="bp-cancel" onClick={() => setOpen(false)}>Cancel</button>
      {error && <div className="bridge-error bp-error">{error}</div>}
    </form>
  )
}

function InviteForm({ peerPrincipals, principalStoreEnabled, principalStoreError, onInvited }: {
  peerPrincipals: { id: string; display_name: string }[]
  principalStoreEnabled: boolean
  principalStoreError: string | null
  onInvited: () => void
}) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [principalID, setPrincipalID] = useState('')
  const [lifetime, setLifetime] = useState(PEER_INVITE_LIFETIMES[0].seconds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<PeerInviteCreated | null>(null)
  if (!principalStoreEnabled) {
    return <p className="bp-hint">principal-store is not proxied here, so there is no peer principal to invite.</p>
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setCreated(null)
    try {
      const res = await fetchFn(`${basePath}${PEER_INVITES_PATH}`, jsonPost(peerInviteRequestBody(principalID, lifetime)))
      if (!res.ok) { setError(await peerRouteErrorText(res, 'Invite')); return }
      setCreated((await res.json()) as PeerInviteCreated)
      onInvited()
    } catch (err) {
      setError(`Invite: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="bg-form" onSubmit={submit} aria-label="Invite a server">
      {principalStoreError && <div className="bridge-error bp-error bg-form-error">Could not read principal-store: {principalStoreError}</div>}
      <label className="bg-filter">
        <span>Acts here as</span>
        <select value={principalID} onChange={e => setPrincipalID(e.target.value)} required>
          <option value="">{peerPrincipals.length === 0 ? 'No peer principal: make one on Principals' : 'Pick a peer principal'}</option>
          {peerPrincipals.map(p => <option key={p.id} value={p.id}>{p.display_name} ({p.id})</option>)}
        </select>
      </label>
      <label className="bg-filter">
        <span>Redeem within</span>
        <select value={lifetime} onChange={e => setLifetime(Number(e.target.value))}>
          {PEER_INVITE_LIFETIMES.map(l => <option key={l.seconds} value={l.seconds}>{l.label}</option>)}
        </select>
      </label>
      <button type="submit" className="bp-submit bg-submit" disabled={busy || !principalID}>{busy ? 'Inviting…' : 'Make invite'}</button>
      {error && <div className="bridge-error bp-error bg-form-error">{error}</div>}
      {created && (
        <div className="bg-form-outcome pr-passphrase">
          <span>Passphrase for <code>{created.invite.id}</code>, shown only this once. Give it to the other server&apos;s operator; it works once, until {formatWhen(created.invite.expires_at)}.</span>
          <code className="pr-passphrase-value">{created.passphrase}</code>
          <button type="button" className="bp-cancel" onClick={() => { void navigator.clipboard.writeText(created.passphrase) }}>Copy</button>
        </div>
      )}
    </form>
  )
}

function TokensTable({ tokens, principalName, onChanged }: {
  tokens: PeerToken[] | null
  principalName: (id: string) => string
  onChanged: () => void
}) {
  const sorted = useMemo(() => liveFirstNewestFirst(tokens ?? [], t => !peerTokenIsRevoked(t)), [tokens])
  return (
    <table className="bg-table pr-table" aria-label="Peer tokens">
      <thead>
        <tr><th>Token</th><th>Acts here as</th><th>Issued</th><th></th></tr>
      </thead>
      <tbody>
        {tokens === null && <tr><td colSpan={4} className="bp-empty-inline">Loading…</td></tr>}
        {tokens !== null && tokens.length === 0 && <tr><td colSpan={4} className="bp-empty-inline">No server holds a token for this one.</td></tr>}
        {sorted.map(token => {
          const revoked = peerTokenIsRevoked(token)
          return (
            <tr key={token.id} className={revoked ? 'bg-row-revoked' : ''} data-peer-token-id={token.id}>
              <td><code>{token.id}</code><div className="bp-hint">from <code>{token.peer_invite_id}</code></div></td>
              <td title={token.peer_principal_id}>{principalName(token.peer_principal_id)}</td>
              <td className="bg-when">
                {formatWhen(token.created_at)}
                {revoked && <span className="bp-badge bp-badge-disabled" title={token.revoke_reason}>revoked {formatWhen(token.revoked_at)}</span>}
              </td>
              <td className="bg-actions">
                {!revoked && <ReasonAction label="Revoke" path={peerTokenRevokePath(token.id)} onDone={onChanged} />}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function InvitesTable({ invites, principalName }: { invites: PeerInvite[] | null; principalName: (id: string) => string }) {
  const now = new Date()
  const sorted = useMemo(() => liveFirstNewestFirst(invites ?? [], i => peerInviteState(i, new Date()) === 'waiting'), [invites])
  return (
    <table className="bg-table pr-table" aria-label="Peer invites">
      <thead>
        <tr><th>Invite</th><th>For</th><th>Made by</th><th>State</th></tr>
      </thead>
      <tbody>
        {invites === null && <tr><td colSpan={4} className="bp-empty-inline">Loading…</td></tr>}
        {invites !== null && invites.length === 0 && <tr><td colSpan={4} className="bp-empty-inline">No invite has been made.</td></tr>}
        {sorted.map(invite => {
          const state = peerInviteState(invite, now)
          return (
            <tr key={invite.id} className={state === 'waiting' ? '' : 'bg-row-revoked'} data-peer-invite-id={invite.id}>
              <td><code>{invite.id}</code><div className="bp-hint">{formatWhen(invite.created_at)}</div></td>
              <td title={invite.peer_principal_id}>{principalName(invite.peer_principal_id)}</td>
              <td title={invite.created_by}>{principalName(invite.created_by)}</td>
              <td>
                {state === 'waiting' && <>waiting until {formatWhen(invite.expires_at)}</>}
                {state === 'redeemed' && <>redeemed {formatWhen(invite.redeemed_at)} as <code>{invite.peer_token_id}</code></>}
                {state === 'expired' && <>expired {formatWhen(invite.expires_at)}</>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
