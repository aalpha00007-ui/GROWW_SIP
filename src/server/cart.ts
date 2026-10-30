// The cart (Mutual Funds -> Cart): SIPs and one-time investments saved from the order card. Removing an
// item marks it removed instead of deleting it, so the row stays as a record of what was tried.
import type { Db } from '../db/client';
import { ordinal } from '../pipeline/chunking/format';
import { checkSip } from './funds';
import { inr } from './money';
import { MAX_AMOUNT } from './sip';

/** POST /api/cart {fundId, kind: 'sip' | 'one_time', amount, day?} */
export async function addToCart(db: Db, investorId: string, input: unknown): Promise<{ status: 200; message: string } | { status: 400 | 404; error: string }> {
  const body = (input ?? {}) as { fundId?: unknown; kind?: unknown; amount?: unknown; day?: unknown };
  const [fund] = (await db.query<{ id: number; name: string; min_sip: number }>('SELECT id, name, min_sip FROM funds WHERE id = $1', [Number.isInteger(body.fundId) ? body.fundId : 0])).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  if (body.kind !== 'sip' && body.kind !== 'one_time') return { status: 400, error: 'Choose a monthly SIP or a one-time investment.' };
  // A one-time investment has no date, so check its amount against a date that always passes.
  const checked = checkSip(body.amount, body.kind === 'sip' ? body.day : 1, fund.min_sip);
  if (checked) return checked;
  await db.query('INSERT INTO cart_items (investor_id, fund_id, kind, amount, day_of_month) VALUES ($1, $2, $3, $4, $5)', [
    investorId,
    fund.id,
    body.kind,
    body.amount,
    body.kind === 'sip' ? body.day : null,
  ]);
  return { status: 200, message: `${fund.name} is in your cart.` };
}

/** POST /api/cart/[id]/remove */
export async function removeFromCart(db: Db, investorId: string, itemId: number): Promise<{ status: 200; message: string } | { status: 404; error: string }> {
  const { rows } = await db.query(
    'UPDATE cart_items SET removed_at = now() WHERE id = $1 AND investor_id = $2 AND removed_at IS NULL RETURNING id',
    [Number.isInteger(itemId) ? itemId : 0, investorId],
  );
  return rows.length ? { status: 200, message: 'Removed from your cart.' } : { status: 404, error: 'That item is not in your cart.' };
}

export interface CartItem {
  id: number;
  fundId: number;
  fund: string;
  kind: 'sip' | 'one_time';
  /** 'Monthly SIP · on the 4th' or 'One-time' */
  label: string;
  amount: string;
}

export async function cartView(db: Db, investorId: string): Promise<{ items: CartItem[]; total: string; maxAmount: number }> {
  const { rows } = await db.query<{ id: number; fund_id: number; fund: string; kind: 'sip' | 'one_time'; amount: number; day_of_month: number | null }>(
    `SELECT c.id, c.fund_id, f.name AS fund, c.kind, c.amount, c.day_of_month FROM cart_items c JOIN funds f ON f.id = c.fund_id
     WHERE c.investor_id = $1 AND c.removed_at IS NULL ORDER BY c.id`,
    [investorId],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      fundId: r.fund_id,
      fund: r.fund,
      kind: r.kind,
      label: r.kind === 'sip' ? `Monthly SIP · on the ${ordinal(r.day_of_month ?? 1)}` : 'One-time',
      amount: inr(r.amount),
    })),
    total: inr(rows.reduce((sum, r) => sum + r.amount, 0)),
    maxAmount: MAX_AMOUNT,
  };
}
