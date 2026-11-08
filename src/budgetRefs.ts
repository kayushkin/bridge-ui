// Rules for budget-store's transaction and marketplace order chips
// (components/chat/BudgetRefChips.tsx). Pure, so test/budgetRefs.test.ts
// can hold them.

import type { BudgetTransaction, MarketplaceOrder } from './types-budget-store'

/** What the transaction did to the operator's accounts: the sum of its
 *  account postings, negative for money spent. */
export function transactionAmountCents(transaction: Pick<BudgetTransaction, 'postings'>): number {
  return transaction.postings.filter((posting) => posting.account_id !== '').reduce((sum, posting) => sum + posting.amount_cents, 0)
}

/** A transaction's name on a chip: its day and the bank's description. */
export function transactionChipLabel(transaction: Pick<BudgetTransaction, 'occurred_on' | 'description'>, length = 32): string {
  const description = transaction.description.trim()
  const short = description.length > length ? `${description.slice(0, length - 1)}…` : description
  return short ? `${transaction.occurred_on} ${short}` : transaction.occurred_on
}

/** An order's name on a chip: who sold it and the order number. */
export function orderChipLabel(order: Pick<MarketplaceOrder, 'seller' | 'marketplace' | 'order_number'>): string {
  const seller = order.seller || order.marketplace
  return order.order_number ? `${seller} ${order.order_number}` : seller
}

/** The host's mail page opened on the order's confirmation email; '' when
 *  the host has no mail page or the order came from no email. */
export function orderMailLink(mailPagePath: string, order: Pick<MarketplaceOrder, 'mail_account_id' | 'mail_message_id'>): string {
  if (!mailPagePath || !order.mail_account_id || !order.mail_message_id) return ''
  return `${mailPagePath}?account=${encodeURIComponent(order.mail_account_id)}&message=${encodeURIComponent(order.mail_message_id)}`
}

/** Every possession the transaction paid for: what its orders' lines link
 *  to and what it links to itself, once each, in that order. */
export function transactionPossessionIds(transaction: Pick<BudgetTransaction, 'marketplace_orders' | 'links'>): string[] {
  const ids: string[] = []
  for (const order of transaction.marketplace_orders ?? []) {
    for (const line of order.lines) {
      for (const id of line.possession_ids) if (!ids.includes(id)) ids.push(id)
    }
  }
  for (const link of transaction.links ?? []) {
    if (link.entity_type === 'possession' && !ids.includes(link.entity_ref)) ids.push(link.entity_ref)
  }
  return ids
}

/** How the store found the order's charge, in words. */
export function orderMatchedByLabel(matchedBy: string): string {
  switch (matchedBy) {
    case 'order_number':
      return 'by the order number in the bank description'
    case 'amount_and_date':
      return 'by amount and date'
    default:
      return 'no charge found'
  }
}
