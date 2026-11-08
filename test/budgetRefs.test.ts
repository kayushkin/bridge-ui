import { describe, expect, it } from 'vitest'
import {
  orderChipLabel,
  orderMailLink,
  orderMatchedByLabel,
  transactionAmountCents,
  transactionChipLabel,
  transactionPossessionIds,
} from '../src/budgetRefs'
import { productListingLabel, resolutionSummary } from '../src/possessionRefs'
import type { BudgetTransaction, MarketplaceOrder } from '../src/types-budget-store'

const order: MarketplaceOrder = {
  id: 'marketplace_order_000001', marketplace: 'ebay', order_number: '19-00000-00001', seller: 'seller_one', ordered_at: 1785045968,
  total_cents: 29015, currency: 'USD', transaction_id: 'transaction_000001', matched_by: 'order_number', mail_account_id: 'mail-account',
  mail_message_id: 'abc 123', extracted_by: 'model', created_by: 'principal_000001', created_at: 0, updated_at: 0,
  lines: [{ id: 'marketplace_order_line_000001', order_id: 'marketplace_order_000001', line_number: 1, title: 'Metronome watch', item_number: '206000000001',
    listing_url: 'https://www.ebay.com/itm/206000000001', quantity: 1, unit_price_cents: 26800, disposition: 'possession', possession_ids: ['possession_000002'] }],
}

const transaction: BudgetTransaction = {
  id: 'transaction_000001', occurred_on: '2026-07-26', status: 'posted', payee_id: '', description: 'EBAY O*19-00000-00001 SAN JOSE CA', memo: '',
  postings: [
    { id: 'posting_000001', account_id: 'account_000001', category_id: '', amount_cents: -29015, memo: '', tax_year: 0 },
    { id: 'posting_000002', account_id: '', category_id: 'category_000001', amount_cents: 29015, memo: '', tax_year: 0 },
  ],
  marketplace_orders: [order],
  links: [
    { id: 'link_000001', from_id: 'transaction_000001', entity_type: 'possession', entity_ref: 'possession_000002', note: '', created_at: 0 },
    { id: 'link_000002', from_id: 'transaction_000001', entity_type: 'possession', entity_ref: 'possession_000009', note: '', created_at: 0 },
    { id: 'link_000003', from_id: 'transaction_000001', entity_type: 'trip', entity_ref: 'trip_000001', note: '', created_at: 0 },
  ],
}

describe('budget chips', () => {
  it('counts only the account side of a transaction', () => {
    expect(transactionAmountCents(transaction)).toBe(-29015)
  })
  it('names a transaction by day and a cut description, an order by seller and number', () => {
    expect(transactionChipLabel(transaction, 10)).toBe('2026-07-26 EBAY O*19…')
    expect(orderChipLabel(order)).toBe('seller_one 19-00000-00001')
    expect(orderChipLabel({ ...order, seller: '', order_number: '' })).toBe('ebay')
  })
  it('opens the confirmation on the host mail page, and nowhere without one', () => {
    expect(orderMailLink('/mail', order)).toBe('/mail?account=mail-account&message=abc%20123')
    expect(orderMailLink('', order)).toBe('')
    expect(orderMailLink('/mail', { ...order, mail_message_id: '' })).toBe('')
  })
  it('lists each possession once, lines first', () => {
    expect(transactionPossessionIds(transaction)).toEqual(['possession_000002', 'possession_000009'])
  })
  it('says how a charge was found', () => {
    expect(orderMatchedByLabel('amount_and_date')).toBe('by amount and date')
    expect(orderMatchedByLabel('')).toBe('no charge found')
  })
})

describe('product listing and order answers', () => {
  it('marks the maker’s own page official and names any other source', () => {
    expect(productListingLabel({ listing_url: 'https://maker.example/mw', listing_source: 'manufacturer', listing_publisher: 'Acme' })).toBe('Acme (official)')
    expect(productListingLabel({ listing_url: 'https://shop.example/x', listing_source: 'retailer', listing_publisher: '' })).toBe('shop.example (retailer)')
  })
  it('says what an order-line answer did', () => {
    expect(resolutionSummary({ action: 'order_line_link', possession_id: 'possession_000001', marketplace_order_line_id: 'marketplace_order_line_000001', budget_transaction_id: 'transaction_000001' }))
      .toEqual({ text: 'Came from the order', id: 'transaction_000001' })
    expect(resolutionSummary({ action: 'withdrawn' })).toEqual({ text: 'Withdrawn', id: '' })
  })
})
