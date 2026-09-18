import type { InboundRule } from '@kayushkin/multichat-types'
import type { MultichatUnifiedContact } from './types-multichat'

/** An inbound rule as the editor holds it: every field a string or a boolean,
 *  so an input never holds `undefined`. `inboundRuleWireBodyOf` turns it into
 *  what `POST /inbound-rules` and `PATCH /inbound-rules/{id}` take. */
export interface InboundRuleDraft {
  name: string
  platform: string
  senderUserID: string
  bodyPattern: string
  directMessagesOnly: boolean
  instanceID: string
  agentID: string
  promptTemplate: string
}

export function emptyInboundRuleDraft(): InboundRuleDraft {
  return {
    name: '', platform: '', senderUserID: '', bodyPattern: '',
    // multichat's own default: a rule hears direct messages only unless told otherwise.
    directMessagesOnly: true,
    instanceID: '', agentID: '', promptTemplate: '',
  }
}

export function inboundRuleDraftOf(rule: InboundRule): InboundRuleDraft {
  return {
    name: rule.name,
    platform: rule.platform,
    senderUserID: rule.sender_user_id,
    bodyPattern: rule.body_pattern,
    directMessagesOnly: rule.direct_messages_only,
    instanceID: rule.instance_id,
    agentID: rule.agent_id,
    promptTemplate: rule.prompt_template,
  }
}

export type InboundRuleWireBody = Pick<InboundRule,
  'name' | 'platform' | 'sender_user_id' | 'body_pattern' | 'direct_messages_only' | 'instance_id' | 'agent_id' | 'prompt_template'>

export type InboundRuleDraftResult = { ok: true; body: InboundRuleWireBody } | { ok: false; error: string }

/** The required-field checks multichat makes, made first so the form says
 *  which field is empty. Everything else — the pattern (RE2, which a browser
 *  cannot judge), the template's fields, whether the instance exists — is
 *  multichat's call, and its refusal is shown verbatim. */
export function inboundRuleWireBodyOf(draft: InboundRuleDraft): InboundRuleDraftResult {
  const name = draft.name.trim()
  const instanceID = draft.instanceID.trim()
  if (!name) return { ok: false, error: 'Name the rule.' }
  if (!instanceID) return { ok: false, error: 'Pick the instance the session starts on.' }
  if (!draft.promptTemplate.trim()) return { ok: false, error: 'Write the prompt the session starts with.' }
  return {
    ok: true,
    body: {
      name,
      platform: draft.platform,
      sender_user_id: draft.senderUserID.trim(),
      // A pattern and a template are kept as typed: leading space can be meant.
      body_pattern: draft.bodyPattern,
      direct_messages_only: draft.directMessagesOnly,
      instance_id: instanceID,
      agent_id: draft.agentID.trim(),
      prompt_template: draft.promptTemplate,
    },
  }
}

/** True when the rule names no app, no sender and no pattern: it then starts
 *  a session for every message a person sends (every direct message, when
 *  `direct_messages_only` is set). multichat allows this; the page says so. */
export function inboundRuleMatchesEveryMessage(rule: Pick<InboundRule, 'platform' | 'sender_user_id' | 'body_pattern'>): boolean {
  return !rule.platform && !rule.sender_user_id && !rule.body_pattern
}

export interface SenderIdentityOption {
  userID: string
  label: string
}

/** Every app identity of every contact, as options for the sender picker. The
 *  value is the puppet id — the thing the rule stores and matches on — and the
 *  display name is carried for the label only. */
export function senderIdentityOptions(contacts: readonly MultichatUnifiedContact[]): SenderIdentityOption[] {
  const options: SenderIdentityOption[] = []
  const seen = new Set<string>()
  for (const contact of contacts) {
    for (const identity of contact.identities ?? []) {
      if (!identity.user_id || seen.has(identity.user_id)) continue
      seen.add(identity.user_id)
      options.push({ userID: identity.user_id, label: `${contact.display_name || identity.user_id} · ${identity.platform}` })
    }
  }
  return options
}

/** One line saying what the rule listens for, for the collapsed row. */
export function inboundRuleFilterSummary(rule: Pick<InboundRule, 'platform' | 'sender_user_id' | 'body_pattern' | 'direct_messages_only'>, senderLabel: (userID: string) => string): string {
  const parts: string[] = []
  parts.push(rule.direct_messages_only ? 'a direct message' : 'a message in any room')
  if (rule.platform) parts.push(`on ${rule.platform}`)
  if (rule.sender_user_id) parts.push(`from ${senderLabel(rule.sender_user_id)}`)
  if (rule.body_pattern) parts.push(`matching ${rule.body_pattern}`)
  return parts.join(' ')
}
