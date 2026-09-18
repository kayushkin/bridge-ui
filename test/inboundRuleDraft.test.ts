import { describe, expect, it } from 'vitest'
import type { InboundRule } from '@kayushkin/multichat-types'
import {
  emptyInboundRuleDraft, inboundRuleDraftOf, inboundRuleFilterSummary, inboundRuleMatchesEveryMessage,
  inboundRuleWireBodyOf, senderIdentityOptions,
} from '../src/inboundRuleDraft'
import { BRIDGE_PAGES } from '../src/pages'
import type { BridgeConfig } from '../src/context'

const rule = (over: Partial<InboundRule>): InboundRule => ({
  id: 1, name: 'Alvaro about invoices', platform: 'whatsapp', sender_user_id: '@whatsapp_1:chat.example', body_pattern: '(?i)invoice',
  direct_messages_only: true, instance_id: 'inst-cc-local', agent_id: '', prompt_template: '{{.Body}}', enabled: true,
  created_at: '', updated_at: '', ...over,
})

describe('inboundRuleWireBodyOf', () => {
  it('names the empty required field before multichat has to', () => {
    const empty = emptyInboundRuleDraft()
    expect(inboundRuleWireBodyOf(empty)).toEqual({ ok: false, error: 'Name the rule.' })
    expect(inboundRuleWireBodyOf({ ...empty, name: 'x' })).toEqual({ ok: false, error: 'Pick the instance the session starts on.' })
    expect(inboundRuleWireBodyOf({ ...empty, name: 'x', instanceID: 'inst-1' })).toEqual({ ok: false, error: 'Write the prompt the session starts with.' })
  })
  it('starts from direct messages only, as multichat does', () => {
    expect(emptyInboundRuleDraft().directMessagesOnly).toBe(true)
  })
  it('round-trips a stored rule through the draft', () => {
    const stored = rule({ agent_id: 'herald', direct_messages_only: false })
    expect(inboundRuleWireBodyOf(inboundRuleDraftOf(stored))).toEqual({
      ok: true,
      body: {
        name: 'Alvaro about invoices', platform: 'whatsapp', sender_user_id: '@whatsapp_1:chat.example', body_pattern: '(?i)invoice',
        direct_messages_only: false, instance_id: 'inst-cc-local', agent_id: 'herald', prompt_template: '{{.Body}}',
      },
    })
  })
  it('keeps the pattern and the template exactly as typed', () => {
    const result = inboundRuleWireBodyOf({ ...emptyInboundRuleDraft(), name: ' n ', instanceID: ' inst-1 ', bodyPattern: ' ^hi ', promptTemplate: '  {{.Body}}\n' })
    expect(result).toMatchObject({ ok: true, body: { name: 'n', instance_id: 'inst-1', body_pattern: ' ^hi ', prompt_template: '  {{.Body}}\n' } })
  })
})

describe('inboundRuleMatchesEveryMessage', () => {
  it('is true only when no app, sender or pattern is set', () => {
    expect(inboundRuleMatchesEveryMessage(rule({ platform: '', sender_user_id: '', body_pattern: '' }))).toBe(true)
    expect(inboundRuleMatchesEveryMessage(rule({ platform: '', sender_user_id: '', body_pattern: 'x' }))).toBe(false)
    expect(inboundRuleMatchesEveryMessage(rule({ platform: 'signal', sender_user_id: '', body_pattern: '' }))).toBe(false)
  })
})

describe('senderIdentityOptions', () => {
  it('lists every identity once, valued by puppet id and labelled by name and app', () => {
    const options = senderIdentityOptions([
      { display_name: 'Alvaro Lopez', identities: [{ user_id: '@meta_1:x', platform: 'meta' }, { user_id: '@whatsapp_1:x', platform: 'whatsapp' }] },
      { display_name: 'Alvaro Lopez', identities: [{ user_id: '@whatsapp_1:x', platform: 'whatsapp' }] },
      { display_name: '', identities: [{ user_id: '@signal_2:x', platform: 'signal' }] },
    ])
    expect(options).toEqual([
      { userID: '@meta_1:x', label: 'Alvaro Lopez · meta' },
      { userID: '@whatsapp_1:x', label: 'Alvaro Lopez · whatsapp' },
      { userID: '@signal_2:x', label: '@signal_2:x · signal' },
    ])
  })
})

describe('inboundRuleFilterSummary', () => {
  it('says what the rule listens for, naming the sender through the label it is given', () => {
    expect(inboundRuleFilterSummary(rule({}), () => 'Alvaro Lopez · whatsapp'))
      .toBe('a direct message on whatsapp from Alvaro Lopez · whatsapp matching (?i)invoice')
    expect(inboundRuleFilterSummary(rule({ platform: '', sender_user_id: '', body_pattern: '', direct_messages_only: false }), id => id))
      .toBe('a message in any room')
  })
})

describe('the Inbound rules page in the registry', () => {
  it('is listed only when the host proxies multichat', () => {
    const page = BRIDGE_PAGES.find(p => p.route === 'inboundRules')
    expect(page).toBeDefined()
    expect(page?.group).toBe('agents')
    expect(page?.available?.({ multichatBasePath: '' } as BridgeConfig, {} as never)).toBe(false)
    expect(page?.available?.({ multichatBasePath: '/api/multichat' } as BridgeConfig, {} as never)).toBe(true)
  })
})
