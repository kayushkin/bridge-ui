// budget-store's wire types the chips read, hand-written because budget-store
// renders no package yet. Its CONTRACT.md is the source of every shape; render
// a package there and these go.

export interface BudgetPosting {
  id: string
  /** Exactly one of account_id and category_id is set. */
  account_id: string
  category_id: string
  amount_cents: number
  memo: string
  tax_year: number
}

export interface BudgetLink {
  id: string
  from_id: string
  entity_type: string
  entity_ref: string
  note: string
  created_at: number
}

export interface MarketplaceOrderLine {
  id: string
  order_id: string
  line_number: number
  title: string
  item_number: string
  listing_url: string
  quantity: number
  unit_price_cents: number | null
  /** unreviewed, possession, consumable, returned, gift_for_someone_else */
  disposition: string
  /** possession-store ids the line links to */
  possession_ids: string[]
}

export interface MarketplaceOrder {
  id: string
  marketplace: string
  order_number: string
  seller: string
  /** epoch seconds */
  ordered_at: number
  total_cents: number | null
  currency: string
  /** '' until budget-store finds the charge */
  transaction_id: string
  /** order_number, amount_and_date or '' */
  matched_by: string
  /** the order confirmation email: a mailstack account and message id */
  mail_account_id: string
  mail_message_id: string
  extracted_by: string
  created_by: string
  created_at: number
  updated_at: number
  lines: MarketplaceOrderLine[]
}

export interface BudgetTransaction {
  id: string
  occurred_on: string
  status: string
  payee_id: string
  description: string
  memo: string
  postings: BudgetPosting[]
  marketplace_orders?: MarketplaceOrder[]
  links?: BudgetLink[]
}
