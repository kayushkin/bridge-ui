import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ServiceSetting, ServiceSettings } from '@kayushkin/llm-bridge-types'
import { useBridgeConfig } from '../context'
import {
  serviceSettingsByKind, serviceSettingsSourcesOf, serviceSettingsSummary, serviceSettingsURL, serviceSettingURL,
  serviceSettingValueText, type ServiceSettingsSource,
} from '../serviceSettings'
import { SettingsSection } from './settings/SettingsSection'

/** Service settings: every backend this host proxies, asked to describe its own
 *  configuration (`GET {base}/settings`, llm-bridge's `msg.ServiceSettings`).
 *  A service that answers is drawn from its answer — what each setting is, the
 *  value in force and whether the environment, the service's own record or a
 *  built-in default decided it. Behaviour settings the service stores are
 *  edited here and apply with no restart; addresses, paths and secrets are
 *  shown with their variable name and change only where the process is started.
 *  A service that does not answer is listed as such: that list is what is left
 *  to convert. */
export function BridgeServiceSettings() {
  const config = useBridgeConfig()
  const sources = useMemo(() => serviceSettingsSourcesOf(config), [config])
  return (
    <div className="bh-container bss-sections">
      <header>
        <h2 className="bh-title">Service settings</h2>
        <p className="bh-subtitle">
          Each service describes its own configuration. <strong>Behaviour</strong> settings are stored by the service and
          changed here, with no restart. <strong>Wiring</strong>, <strong>paths</strong> and <strong>secrets</strong> belong to the
          environment the process is started in: they are shown with the variable that sets them, and a secret shows only
          whether it is set.
        </p>
      </header>
      {sources.map(source => <ServicePanel key={source.configKey} source={source} />)}
    </div>
  )
}

type PanelState =
  | { phase: 'loading' }
  | { phase: 'described'; described: ServiceSettings }
  | { phase: 'silent'; status: number }
  | { phase: 'failed'; message: string }

function ServicePanel({ source }: { source: ServiceSettingsSource }) {
  const { fetch: apiFetch } = useBridgeConfig()
  const [state, setState] = useState<PanelState>({ phase: 'loading' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch(serviceSettingsURL(source.basePath))
      .then(async res => {
        if (cancelled) return
        if (!res.ok) { setState({ phase: 'silent', status: res.status }); return }
        const described = await res.json() as ServiceSettings
        // Some other route answering 200 at this path is not a description.
        if (!described || !Array.isArray(described.settings)) { setState({ phase: 'silent', status: res.status }); return }
        setState({ phase: 'described', described })
        setExpanded(true)
      })
      .catch(err => { if (!cancelled) setState({ phase: 'failed', message: err instanceof Error ? err.message : String(err) }) })
    return () => { cancelled = true }
  }, [apiFetch, source.basePath])

  /** One write. The service answers with its whole description, so the page
   *  shows what is now in force rather than what was typed. */
  const save = useCallback(async (key: string, value: string): Promise<string | null> => {
    try {
      const res = await apiFetch(serviceSettingURL(source.basePath, key), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
      })
      if (!res.ok) return `PUT /settings/${key} → ${res.status}: ${(await res.text()).trim()}`
      setState({ phase: 'described', described: await res.json() as ServiceSettings })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }, [apiFetch, source.basePath])

  if (state.phase !== 'described') {
    return (
      <SettingsSection id={`service-settings:${source.serviceName}`} title={source.serviceName} scope="global"
        badges={<span className="bh-flag">{state.phase === 'loading' ? 'asking…' : 'does not describe its settings'}</span>}>
        {state.phase === 'silent' && (
          <span className="bss-help">
            <code>GET {serviceSettingsURL(source.basePath)}</code> answered {state.status}. Its configuration is read from its
            environment and is not visible here yet.
          </span>
        )}
        {state.phase === 'failed' && <div className="bridge-error bss-error">{state.message}</div>}
      </SettingsSection>
    )
  }

  const { described } = state
  return (
    <SettingsSection id={`service-settings:${described.service}`} title={described.service} scope="global"
      storedBy={serviceSettingsSummary(described)}
      collapsible={{ expanded, onToggle: () => setExpanded(v => !v) }}>
      {serviceSettingsByKind(described).map(group => (
        <div key={group.kind} className="bsv-group" data-setting-kind={group.kind}>
          <h4 className="bsv-group-title">{group.kind}</h4>
          {group.description && <p className="bss-help">{group.description}</p>}
          <ul className="bh-list">
            {group.settings.map(setting => <SettingRow key={setting.key} setting={setting} describedSources={described.sources ?? []} onSave={save} />)}
          </ul>
        </div>
      ))}
    </SettingsSection>
  )
}

function SettingRow({ setting, describedSources, onSave }: {
  setting: ServiceSetting
  describedSources: ServiceSettings['sources']
  onSave: (key: string, value: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(setting.value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceMeaning = describedSources.find(s => s.source === setting.source)?.description ?? ''

  const submit = async () => {
    setBusy(true)
    const refusal = await onSave(setting.key, draft)
    setBusy(false)
    setError(refusal)
    if (refusal === null) setEditing(false)
  }

  return (
    <li className="bh-row" data-setting-key={setting.key}>
      <div className="bh-row-head">
        <span className="bh-event">{setting.key}</span>
        <code className="bh-matcher" title="The environment variable the process reads for this setting">{setting.environment_variable}</code>
        <span className={`bh-flag bsv-source-${setting.source}`} title={sourceMeaning}>{setting.source}</span>
        {setting.required && <span className="bh-flag">required</span>}
        {setting.editable && (
          <span className="bh-row-actions">
            <button type="button" className="bp-cancel" disabled={busy}
              onClick={() => { setDraft(setting.value); setError(null); setEditing(v => !v) }}>{editing ? 'Cancel' : 'Change'}</button>
          </span>
        )}
      </div>
      <p className="bss-help bsv-description">{setting.description}</p>
      {!editing && (
        <div className="bsv-value">
          <code className={setting.is_set ? '' : 'bsv-unset'}>{serviceSettingValueText(setting)}</code>
          {setting.default_value && setting.source !== 'default' && <span className="bss-help">default {setting.default_value}</span>}
        </div>
      )}
      {editing && (
        <div className="bsv-edit">
          <input aria-label={`New value for ${setting.key}`} value={draft} spellCheck={false} disabled={busy}
            placeholder={setting.value_type} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submit() }} />
          <span className="bss-help">{setting.value_type}{setting.default_value ? ` · default ${setting.default_value}` : ''}</span>
          <button type="button" className="bi-save-btn" disabled={busy || draft === setting.value} onClick={() => { void submit() }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      {(setting.notes ?? []).map(note => <p key={note} className="bss-help bsv-note">{note}</p>)}
      {error && <div className="bridge-error bss-error">{error}</div>}
    </li>
  )
}
