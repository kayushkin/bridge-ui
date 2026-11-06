import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatContext } from '@kayushkin/chat-core'
import { BridgeContext, type BridgeConfig } from '../src/context'
import { OwnerQuestionPanel } from '../src/components/chat/PossessionRefChips'
import {
  moneyLabel,
  ownerQuestionAnswerBody,
  ownerQuestionAnswerUrl,
  possessionChipLabel,
  possessionKindFacts,
  possessionKindLabel,
  possessionLinkedIds,
  possessionMakeLabel,
  possessionStoreImageUrl,
  purchaseChipLabel,
  questionChipLabel,
  resolutionSummary,
} from '../src/possessionRefs'
import type { OwnerQuestion, Possession } from '../src/types-possession-store'

const hoodie: Possession = {
  id: 'possession_000001', name: 'black hoodie', brand: 'Acme', model: 'Heavy', serial_number: '',
  description: '', quantity: 1, condition: '', status: 'owned', place_id: null, spot: 'bedroom closet',
  acquired_at: 0, acquired_how: '', purchase_line_id: null, price_cents: 4500, price_currency: 'USD',
  disposed_at: 0, tags: [], created_by: 'principal_000001', created_at: 1, updated_at: 1, deleted_at: 0,
  kind: 'garment',
  garment: {
    id: 'garment_000001', category: 'top', garment_type: 'hoodie', layer: 'mid', primary_color: 'black',
    secondary_colors: [], pattern: 'solid', materials: ['cotton', 'polyester'], size_label: 'L',
    formality: null, warmth: 4,
  },
  outfit_ids: ['outfit_000001'],
  photos: [], cover_photo_id: null,
}

describe('possession chips', () => {
  it('draws pictures through the host, or not at all', () => {
    expect(possessionStoreImageUrl('/api/possessions', 'possessions', 'possession_000001'))
      .toBe('/api/possessions/possessions/possession_000001/image')
    expect(possessionStoreImageUrl('', 'sightings', 'sighting_000001')).toBe('')
    expect(ownerQuestionAnswerUrl('/api/possessions', 'possession_question_000001'))
      .toBe('/api/possessions/owner-questions/possession_question_000001/answer')
  })
  it('never sends who answered: dash signs it', () => {
    expect(JSON.parse(ownerQuestionAnswerBody({ choice: 1 }))).toEqual({ choice: 1 })
    expect(JSON.parse(ownerQuestionAnswerBody({ text: 'my old one' }))).toEqual({ text: 'my old one' })
  })
  it('names a possession, its kind and its make', () => {
    expect(possessionChipLabel(hoodie)).toBe('black hoodie')
    expect(possessionChipLabel({ name: 'sock', quantity: 6 })).toBe('sock ×6')
    expect(possessionKindLabel('computer_part')).toBe('computer part')
    expect(possessionMakeLabel(hoodie)).toBe('Acme Heavy')
    expect(possessionMakeLabel({ brand: '', model: '' })).toBe('')
  })
  it('reads the kind record’s facts off the record, leaving out its id and empty fields', () => {
    const facts = possessionKindFacts(hoodie)
    expect(facts.map((fact) => fact.label)).toEqual([
      'category', 'garment type', 'layer', 'primary color', 'pattern', 'materials', 'size label', 'warmth',
    ])
    expect(facts.find((fact) => fact.label === 'materials')?.text).toBe('cotton, polyester')
    expect(possessionKindFacts({ ...hoodie, kind: '' })).toEqual([])
  })
  it('draws a kind field that holds an id as a chip', () => {
    const computer = { ...hoodie, kind: 'computer', computer: { id: 'computer_000001', form_factor: 'laptop', harness_machine_id: 'm_abc' } }
    expect(possessionKindFacts(computer)).toContainEqual({ label: 'harness machine id', text: '', ids: ['m_abc'] })
  })
  it('lists the records it links to', () => {
    expect(possessionLinkedIds(hoodie)).toEqual([{ label: 'Outfits', ids: ['outfit_000001'] }])
    expect(possessionLinkedIds({ ...hoodie, outfit_ids: [], installed_part_ids: ['computer_part_000002'] }))
      .toEqual([{ label: 'Parts', ids: ['computer_part_000002'] }])
  })
  it('prints money in its currency', () => {
    expect(moneyLabel(4500, 'USD')).toBe('$45.00')
    expect(moneyLabel(null, 'USD')).toBe('')
  })
  it('names a question by its first words and a purchase by its seller', () => {
    expect(questionChipLabel({ question: 'Is this the same black hoodie as the one in the closet?' }))
      .toBe('Is this the same black hoodie…')
    expect(questionChipLabel({ question: 'New?' })).toBe('New?')
    expect(purchaseChipLabel({ seller: 'Acme', order_reference: '112-1', marketplace: 'amazon' })).toBe('Acme 112-1')
  })
  it('says what an answer did', () => {
    expect(resolutionSummary({ action: 'same_as', possession_id: 'possession_000002' }))
      .toEqual({ text: 'The same as', id: 'possession_000002' })
    expect(resolutionSummary({ action: 'reject' })).toEqual({ text: 'Not a possession', id: '' })
  })
})

describe('a question’s panel', () => {
  const question: OwnerQuestion = {
    id: 'possession_question_000001', sighting_id: 'sighting_000001', photo_id: 'photo_000100',
    question: 'Is this monitor one you already have?',
    choices: [
      { label: 'Yes, it is my Dell monitor', resolution: { action: 'same_as', possession_id: 'possession_000002' } },
      { label: 'It is new', resolution: { action: 'accept' } },
    ],
    answer_choice: null, answer_text: '', resolution: null, answered_by: '', asked_at: 1, answered_at: 0,
  }
  const render = (possessionStoreBasePath: string, shown: OwnerQuestion) =>
    renderToStaticMarkup(
      createElement(ChatContext.Provider, { value: { resolve: null } as never },
        createElement(BridgeContext.Provider, { value: { possessionStoreBasePath, fetch: async () => new Response() } as unknown as BridgeConfig },
          createElement(OwnerQuestionPanel, { refId: question.id, question: shown, onAnswered: () => {} }))))

  it('shows the picture, the question, a button per choice and a box for words', () => {
    const html = render('/api/possessions', question)
    expect(html).toContain('src="/api/possessions/owner-questions/possession_question_000001/image"')
    expect(html).toContain('Is this monitor one you already have?')
    expect(html).toContain('>Yes, it is my Dell monitor</button>')
    expect(html).toContain('>It is new</button>')
    expect(html).toContain('<textarea')
    expect(html).not.toContain('disabled=""><')
  })
  it('offers no answer when the host does not carry possession-store', () => {
    const html = render('', question)
    expect(html).toContain('cannot answer')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>It is new<\/button>/)
  })
  it('shows what an answer did instead of the choices once answered', () => {
    const html = render('/api/possessions', {
      ...question, answer_choice: 0, answered_by: 'principal_000001', answered_at: 2,
      resolution: { action: 'same_as', possession_id: 'possession_000002' },
    })
    expect(html).not.toContain('<textarea')
    expect(html).toContain('Yes, it is my Dell monitor')
    expect(html).toContain('The same as')
    expect(html).toContain('possession_000002')
    expect(html).toContain('principal_000001')
  })
})
