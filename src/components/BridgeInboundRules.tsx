import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InboundDispatch, InboundPromptField, InboundRule } from '@kayushkin/multichat-types'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import {
  emptyInboundRuleDraft, inboundRuleDraftOf, inboundRuleFilterSummary, inboundRuleMatchesEveryMessage,
  inboundRuleWireBodyOf, senderIdentityOptions, type InboundRuleDraft, type SenderIdentityOption,
} from '../inboundRuleDraft'
import type { MultichatUnifiedContact } from '../types-multichat'
import { SettingsSection } from './settings/SettingsSection'

const STORED_BY = 'multichat · inbound_rules'
const RECENT_DISPATCH_LIMIT = 50

type InstanceOption = { id: string; name?: string; harness_type: string }
type Write = (method: string, path: string, body?: unknown) => Promise<string | null>

/** Inbound rules: what starts an agent session when a person messages in
 *  through multichat (WhatsApp, Telegram, Signal, Meta). multichat has stored
 *  and applied them since 2026-09-11 and only curl could write one until this
 *  page. The apps a rule may name and the fields its prompt may use are served
 *  by multichat; the instance is checked by multichat with llm-bridge-server on
 *  every write, and whatever it refuses is shown in its words. */
export function BridgeInboundRules() {
  const { fetch: apiFetch, multichatBasePath } = useBridgeConfig()
  const { instances } = useBridgeInstances()
  const [rules, setRules] = useState<InboundRule[] | null>(null)
  const [platforms, setPlatforms] = useState<string[]>([])
  const [promptFields, setPromptFields] = useState<InboundPromptField[]>([])
  const [dispatches, setDispatches] = useState<InboundDispatch[]>([])
  const [contacts, setContacts] = useState<MultichatUnifiedContact[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [contactsError, setContactsError] = useState<string | null>(null)

  const read = useCallback(async <T,>(path: string): Promise<T> => {
    const res = await apiFetch(`${multichatBasePath}${path}`)
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${(await res.text()).trim()}`)
    return await res.json() as T
  }, [apiFetch, multichatBasePath])

  const reload = useCallback(async () => {
    try {
      const [nextRules, nextDispatches] = await Promise.all([
        read<InboundRule[]>('/inbound-rules'),
        read<InboundDispatch[]>(`/inbound-dispatches?limit=${RECENT_DISPATCH_LIMIT}`),
      ])
      setRules(nextRules ?? [])
      setDispatches(nextDispatches ?? [])
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [read])

  useEffect(() => {
    void reload()
    Promise.all([read<string[]>('/inbound-platforms'), read<InboundPromptField[]>('/inbound-prompt-fields')])
      .then(([nextPlatforms, nextFields]) => { setPlatforms(nextPlatforms ?? []); setPromptFields(nextFields ?? []) })
      .catch(err => setLoadError(err instanceof Error ? err.message : String(err)))
    // The contact list only labels and suggests senders; a rule can still be
    // written by puppet id without it, so its failure does not block the page.
    read<MultichatUnifiedContact[]>('/contacts/unified')
      .then(next => { setContacts(next ?? []); setContactsError(null) })
      .catch(err => setContactsError(err instanceof Error ? err.message : String(err)))
  }, [reload, read])

  /** One write; multichat's refusal comes back as text. */
  const write = useCallback<Write>(async (method, path, body) => {
    try {
      const res = await apiFetch(`${multichatBasePath}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!res.ok) return `${method} ${path} → ${res.status}: ${(await res.text()).trim()}`
      await reload()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }, [apiFetch, multichatBasePath, reload])

  const senders = useMemo(() => senderIdentityOptions(contacts), [contacts])
  const senderLabel = useCallback((userID: string) => senders.find(s => s.userID === userID)?.label ?? userID, [senders])
  const instanceName = useCallback((id: string) => instances.find(i => i.id === id)?.name || id, [instances])
  const ruleName = useCallback((id: number) => rules?.find(r => r.id === id)?.name ?? `rule ${id} (deleted)`, [rules])
  const fieldOptions: RuleFieldOptions = { platforms, promptFields, senders, instances }

  return (
    <div className="bh-container bss-sections">
      <header>
        <h2 className="bh-title">Inbound rules</h2>
        <p className="bh-subtitle">
          When a person messages in through multichat, each enabled rule whose filters all match starts one
          <strong> autonomous session</strong> on the instance it names, with the prompt it renders from the message.
          With no rules nothing happens; there is no default.
        </p>
        <p className="bh-subtitle">
          Nobody is at the keyboard in such a session, and the permission rule <code>multichat-send-message-ask</code> makes
          sending a message ask a person first. So a session started here can read, draft and file work, and cannot reply.
        </p>
      </header>
      {loadError && <div className="bridge-error">{loadError}</div>}
      {contactsError && <div className="bridge-error">Senders are shown by id only: {contactsError}</div>}
      {!rules ? (loadError ? null : <div className="bi-loading">Loading…</div>) : (
        <>
          <InboundRuleComposer options={fieldOptions} onCreate={body => write('POST', '/inbound-rules', body)} />
          <SettingsSection id="inbound-rules:list" title="Rules" scope="global" storedBy={STORED_BY}
            precedence="Rules do not outrank each other: every enabled rule that matches a message starts its own session, once per message.">
            {rules.length === 0 && <span className="bss-help">No rules. Messages are read into multichat and nothing else happens.</span>}
            <ul className="bh-list">
              {rules.map(rule => (
                <InboundRuleRow key={rule.id} rule={rule} options={fieldOptions} senderLabel={senderLabel} instanceName={instanceName} write={write} />
              ))}
            </ul>
          </SettingsSection>
          <SettingsSection id="inbound-rules:dispatches" title="What the rules did" scope="global" storedBy="multichat · inbound_dispatches"
            help={`The newest ${RECENT_DISPATCH_LIMIT}. One row per rule per message; a redelivered message is not acted on twice.`}>
            {dispatches.length === 0 && <span className="bss-help">No rule has fired yet.</span>}
            <ul className="bh-list">
              {dispatches.map(dispatch => (
                <li key={dispatch.id} className="bh-row" data-dispatch-id={dispatch.id}>
                  <div className="bh-row-head">
                    <span className="bh-event">{ruleName(dispatch.rule_id)}</span>
                    <span className="bh-harness">from {senderLabel(dispatch.sender_user_id)}</span>
                    <span className="bh-harness">{new Date(dispatch.created_at).toLocaleString()}</span>
                    {dispatch.error && <span className="bh-flag bh-flag-warn">not started</span>}
                  </div>
                  {dispatch.error && <div className="bridge-error bss-error">{dispatch.error}</div>}
                  <span className="bh-id">{dispatch.bus_session_id}</span>
                </li>
              ))}
            </ul>
          </SettingsSection>
        </>
      )}
    </div>
  )
}

interface RuleFieldOptions {
  platforms: string[]
  promptFields: InboundPromptField[]
  senders: SenderIdentityOption[]
  instances: InstanceOption[]
}

function InboundRuleRow({ rule, options, senderLabel, instanceName, write }: {
  rule: InboundRule
  options: RuleFieldOptions
  senderLabel: (userID: string) => string
  instanceName: (id: string) => string
  write: Write
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<InboundRuleDraft>(() => inboundRuleDraftOf(rule))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const path = `/inbound-rules/${rule.id}`

  const run = async (action: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true)
    const refusal = await action()
    setBusy(false)
    setError(refusal)
    return refusal === null
  }
  const save = async () => {
    const result = inboundRuleWireBodyOf(draft)
    if (!result.ok) { setError(result.error); return }
    if (await run(() => write('PATCH', path, result.body))) setEditing(false)
  }

  return (
    <li className={`bh-row ${rule.enabled ? '' : 'bh-row-disabled'}`} data-inbound-rule-id={rule.id}>
      <div className="bh-row-head">
        <label className="bks-check" title={rule.enabled ? 'Enabled: a matching message starts a session' : 'Disabled: stored, never fires'}>
          <input type="checkbox" checked={rule.enabled} disabled={busy}
            onChange={e => { void run(() => write('PATCH', path, { enabled: e.target.checked })) }} />
        </label>
        <span className="bh-event">{rule.name}</span>
        <span className="bh-harness">{inboundRuleFilterSummary(rule, senderLabel)}</span>
        <span className="bh-scope-id" title={rule.instance_id}>→ {instanceName(rule.instance_id)}{rule.agent_id ? ` as ${rule.agent_id}` : ''}</span>
        {inboundRuleMatchesEveryMessage(rule) && (
          <span className="bh-flag bh-flag-warn" title="No app, sender or pattern is set, so every message a person sends starts a session.">fires on every message</span>
        )}
        <span className="bh-row-actions">
          <button type="button" className="bp-cancel" disabled={busy} onClick={() => { setDraft(inboundRuleDraftOf(rule)); setError(null); setEditing(v => !v) }}>{editing ? 'Cancel' : 'Edit'}</button>
          <button type="button" className="bp-cancel bh-delete" disabled={busy}
            onClick={() => { if (window.confirm(`Delete the rule "${rule.name}"? It is removed from multichat, not disabled.`)) void run(() => write('DELETE', path)) }}>Delete</button>
        </span>
      </div>
      {!editing && <pre className="bh-command">{rule.prompt_template}</pre>}
      {editing && (
        <>
          <InboundRuleFields idPrefix={`rule-${rule.id}`} draft={draft} onChange={setDraft} options={options} />
          <div className="bss-actions">
            <button type="button" className="bi-save-btn" disabled={busy} onClick={() => { void save() }}>{busy ? 'Saving…' : 'Save rule'}</button>
          </div>
        </>
      )}
      {error && <div className="bridge-error bss-error">{error}</div>}
      <span className="bh-id">inbound rule {rule.id}</span>
    </li>
  )
}

function InboundRuleComposer({ options, onCreate }: { options: RuleFieldOptions; onCreate: (body: unknown) => Promise<string | null> }) {
  const [draft, setDraft] = useState<InboundRuleDraft>(emptyInboundRuleDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const submit = async () => {
    const result = inboundRuleWireBodyOf(draft)
    setCreated(false)
    if (!result.ok) { setError(result.error); return }
    setBusy(true)
    const refusal = await onCreate(result.body)
    setBusy(false)
    setError(refusal)
    if (refusal === null) { setCreated(true); setDraft(emptyInboundRuleDraft()) }
  }
  return (
    <SettingsSection id="inbound-rules:new" title="New rule" scope="global" storedBy={STORED_BY}
      help="A new rule is enabled as soon as it is stored and applies to the next message that arrives."
      status={{ busy, error, saved: created }}>
      <InboundRuleFields idPrefix="new-rule" draft={draft} onChange={setDraft} options={options} />
      {inboundRuleMatchesEveryMessage({ platform: draft.platform, sender_user_id: draft.senderUserID.trim(), body_pattern: draft.bodyPattern }) && (
        <span className="bss-help">
          With no app, sender or pattern this rule starts a session for every {draft.directMessagesOnly ? 'direct message' : 'message'} a person sends.
        </span>
      )}
      <div className="bss-actions">
        <button type="button" className="bi-save-btn" disabled={busy} onClick={() => { void submit() }}>{busy ? 'Adding…' : 'Add rule'}</button>
      </div>
    </SettingsSection>
  )
}

function InboundRuleFields({ idPrefix, draft, onChange, options }: {
  idPrefix: string
  draft: InboundRuleDraft
  onChange: (next: InboundRuleDraft) => void
  options: RuleFieldOptions
}) {
  const sendersListID = `${idPrefix}-senders`
  const chosenSender = options.senders.find(s => s.userID === draft.senderUserID.trim())
  return (
    <div className="bh-fields">
      <label className="bks-field">
        <span className="bks-field-label">Name</span>
        <input value={draft.name} placeholder="Alvaro on WhatsApp mentioning the invoice" onChange={e => onChange({ ...draft, name: e.target.value })} />
      </label>
      <label className="bks-field">
        <span className="bks-field-label">App</span>
        <select value={draft.platform} onChange={e => onChange({ ...draft, platform: e.target.value })}>
          <option value="">Any app</option>
          {draft.platform && !options.platforms.includes(draft.platform) && <option value={draft.platform}>{draft.platform} (not served)</option>}
          {options.platforms.map(platform => <option key={platform} value={platform}>{platform}</option>)}
        </select>
      </label>
      <label className="bks-field">
        <span className="bks-field-label">From (multichat user id)</span>
        <input value={draft.senderUserID} list={sendersListID} placeholder="anyone" spellCheck={false}
          onChange={e => onChange({ ...draft, senderUserID: e.target.value })} />
        <datalist id={sendersListID}>{options.senders.map(s => <option key={s.userID} value={s.userID}>{s.label}</option>)}</datalist>
        <span className="bss-help">
          {draft.senderUserID.trim() === '' ? 'Empty matches anyone. Type a name to find a contact; the id is what is stored.'
            : chosenSender ? chosenSender.label : 'Not in the contact list. It is matched exactly as typed.'}
        </span>
      </label>
      <label className="bks-field">
        <span className="bks-field-label">Message matches (RE2 pattern)</span>
        <input value={draft.bodyPattern} placeholder="anything" spellCheck={false} onChange={e => onChange({ ...draft, bodyPattern: e.target.value })} />
        <span className="bss-help">For example <code>(?i)invoice</code>. Empty matches any message.</span>
      </label>
      <label className="bks-field">
        <span className="bks-field-label">Start the session on</span>
        <select value={draft.instanceID} onChange={e => onChange({ ...draft, instanceID: e.target.value })}>
          <option value="">— pick an instance —</option>
          {draft.instanceID && !options.instances.some(i => i.id === draft.instanceID) && <option value={draft.instanceID}>{draft.instanceID} (not listed)</option>}
          {options.instances.map(i => <option key={i.id} value={i.id}>{i.name || i.id} ({i.harness_type})</option>)}
        </select>
      </label>
      <label className="bks-field">
        <span className="bks-field-label">As agent (optional)</span>
        <input value={draft.agentID} placeholder="the instance's own" spellCheck={false} onChange={e => onChange({ ...draft, agentID: e.target.value })} />
      </label>
      <label className="bks-check bir-direct-only">
        <input type="checkbox" checked={draft.directMessagesOnly} onChange={e => onChange({ ...draft, directMessagesOnly: e.target.checked })} />
        <span>Direct messages only (leave group rooms alone)</span>
      </label>
      <label className="bks-field bh-command-field">
        <span className="bks-field-label">Prompt the session starts with (Go template)</span>
        <textarea rows={5} spellCheck={false} value={draft.promptTemplate}
          placeholder={'{{.SenderDisplayName}} wrote on {{.Platform}}: {{.Body}}\n\nDraft a reply and save it to noteboard; do not send anything.'}
          onChange={e => onChange({ ...draft, promptTemplate: e.target.value })} />
        <span className="bir-prompt-fields">
          <span className="bss-help">Fields, click to add:</span>
          {options.promptFields.map(field => (
            <button key={field.name} type="button" className="bir-prompt-field" title={field.type}
              onClick={() => onChange({ ...draft, promptTemplate: `${draft.promptTemplate}{{.${field.name}}}` })}>{field.name}</button>
          ))}
        </span>
      </label>
    </div>
  )
}
