// Chips for budget-store's transactions and marketplace orders. A
// transaction's panel shows what it paid for: each eBay order with its
// seller, the email that confirmed it, and each line with its listing and
// the possessions it bought, every id drawn as a chip of its own. The rules
// are in src/budgetRefs.ts.

import type { JSX, ReactNode } from 'react';
import { useBridgeConfig } from '../../context';
import {
  orderChipLabel,
  orderMailLink,
  orderMatchedByLabel,
  transactionAmountCents,
  transactionChipLabel,
  transactionPossessionIds,
} from '../../budgetRefs';
import { moneyLabel } from '../../possessionRefs';
import type { BudgetTransaction, MarketplaceOrder } from '../../types-budget-store';
import { AnchoredPanel, RefChip, RefRow, useAnchoredPanel } from './RefChip';

/** The chip button and its panel. */
function BudgetChip({
  refId,
  refKind,
  label,
  glyph,
  badge,
  className,
  panelLabel,
  children,
}: {
  refId: string;
  refKind: string;
  label: string;
  glyph: string;
  badge?: string;
  className?: string;
  panelLabel: string;
  children: ReactNode;
}): JSX.Element {
  const { open, toggle, wrapRef, panelRef, panelStyle } = useAnchoredPanel();
  return (
    <span className="ref-chip-wrap" ref={wrapRef} data-ref-kind={refKind} data-ref-id={refId}>
      <button
        type="button"
        className={`${className ?? 'ref-chip'} ref-chip-item${open ? ' ref-chip-open' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        title={`${label} (${refId})`}
      >
        <span className="ref-chip-glyph" aria-hidden>
          {glyph}
        </span>
        <span className="ref-chip-label">{label}</span>
        {badge && <span className="ref-chip-badge">{badge}</span>}
        <span className="ref-chip-caret-inline" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <AnchoredPanel panelRef={panelRef} panelStyle={panelStyle} label={panelLabel} refId={refId} refKind={refKind}>
          {children}
        </AnchoredPanel>
      )}
    </span>
  );
}

function IdChips({ ids }: { ids: string[] }): JSX.Element {
  return (
    <span className="ref-chip-possession-ids">
      {ids.map((id) => (
        <RefChip key={id} kind="uuid" refId={id} />
      ))}
    </span>
  );
}

function LinkRow({ label, href, text }: { label: string; href: string; text: string }): JSX.Element | null {
  if (!href) return null;
  return (
    <div className="ref-chip-panel-row">
      <span className="ref-chip-panel-label">{label}</span>
      <span className="ref-chip-panel-value">
        <a href={href} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      </span>
    </div>
  );
}

/** One order inside a panel: who sold it, when, the total, the email that
 *  confirmed it, and each line with its listing and possessions. */
export function MarketplaceOrderDetails({ order }: { order: MarketplaceOrder }): JSX.Element {
  const { mailPagePath } = useBridgeConfig();
  const mail = orderMailLink(mailPagePath ?? '', order);
  return (
    <div className="ref-chip-panel-section" data-marketplace-order={order.id}>
      <div className="ref-chip-panel-title">
        {order.marketplace} order {order.order_number || '(no number shown)'}
      </div>
      <div className="ref-chip-panel-row">
        <span className="ref-chip-panel-label">Order</span>
        <span className="ref-chip-panel-value">
          <RefChip kind="uuid" refId={order.id} />
        </span>
      </div>
      {order.seller && <RefRow label="Seller" value={order.seller} />}
      <RefRow label="Ordered" value={new Date(order.ordered_at * 1000).toLocaleDateString()} />
      {order.total_cents != null && <RefRow label="Total" value={moneyLabel(order.total_cents, order.currency)} />}
      <LinkRow label="Email" href={mail} text="Order confirmation" />
      {!mail && order.mail_message_id && <RefRow label="Email" value={`${order.mail_account_id}: ${order.mail_message_id}`} />}
      {order.lines.map((line) => (
        <div key={line.id} className="ref-chip-panel-row" data-marketplace-order-line={line.id}>
          <span className="ref-chip-panel-label">{line.quantity > 1 ? `${line.quantity} ×` : 'Bought'}</span>
          <span className="ref-chip-panel-value">
            {line.title}
            {line.unit_price_cents != null && ` (${moneyLabel(line.unit_price_cents, order.currency)})`}
            {line.listing_url && (
              <>
                {' '}
                <a href={line.listing_url} target="_blank" rel="noopener noreferrer">
                  {order.marketplace} listing {line.item_number}
                </a>
              </>
            )}
            {line.disposition !== 'unreviewed' && ` — ${line.disposition}`} <IdChips ids={line.possession_ids} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function BudgetTransactionRefChip({
  refId,
  transaction,
  className,
}: {
  refId: string;
  transaction: BudgetTransaction;
  className?: string;
}): JSX.Element {
  const amount = transactionAmountCents(transaction);
  const orders = transaction.marketplace_orders ?? [];
  const possessions = transactionPossessionIds(transaction);
  const label = orders.length > 0 ? `${orderChipLabel(orders[0])} ${moneyLabel(-amount, 'USD')}` : transactionChipLabel(transaction);
  return (
    <BudgetChip
      refId={refId}
      refKind="budget_transaction"
      label={label}
      glyph="💵"
      badge={transaction.status !== 'posted' ? transaction.status : undefined}
      className={className}
      panelLabel="Transaction details"
    >
      <div className="ref-chip-panel-title">{transaction.description || refId}</div>
      <RefRow label="Id" value={refId} />
      <RefRow label="Date" value={transaction.occurred_on} />
      <RefRow label="Amount" value={moneyLabel(amount, 'USD')} />
      {transaction.memo && <RefRow label="Memo" value={transaction.memo} />}
      {possessions.length > 0 && (
        <div className="ref-chip-panel-row">
          <span className="ref-chip-panel-label">Bought</span>
          <span className="ref-chip-panel-value">
            <IdChips ids={possessions} />
          </span>
        </div>
      )}
      {orders.map((order) => (
        <MarketplaceOrderDetails key={order.id} order={order} />
      ))}
    </BudgetChip>
  );
}

export function MarketplaceOrderRefChip({
  refId,
  order,
  className,
}: {
  refId: string;
  order: MarketplaceOrder;
  className?: string;
}): JSX.Element {
  return (
    <BudgetChip
      refId={refId}
      refKind="budget_marketplace_order"
      label={orderChipLabel(order)}
      glyph="🧾"
      className={className}
      panelLabel="Order details"
    >
      <MarketplaceOrderDetails order={order} />
      <div className="ref-chip-panel-row">
        <span className="ref-chip-panel-label">Charge</span>
        <span className="ref-chip-panel-value">
          {order.transaction_id ? <RefChip kind="uuid" refId={order.transaction_id} /> : null} {orderMatchedByLabel(order.matched_by)}
        </span>
      </div>
    </BudgetChip>
  );
}
