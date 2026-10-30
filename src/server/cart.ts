// The cart (Mutual Funds -> Cart): SIPs and one-time investments saved from the order card. Removing an
// item marks it removed instead of deleting it, so the row stays as a record of what was tried.
import type { Db } from '../db/client';
import { ordinal } from '../pipeline/chunking/format';
import { checkSip } from './funds';
import { inr } from './money';
import { MAX_AMOUNT } from './sip';
import { GOAL_KINDS, parseGoal } from './sip-actions';
import { firstDueDate } from '../pipeline/loading/dates';
import { monthYear } from '../pipeline/chunking/format';

function goalText(goal: { kind: string; name?: string; targetMonth?: string | null }): string {
  const label = goal.kind === 'custom' ? (goal.name ?? 'Something else') : (GOAL_KINDS.find((k) => k.key === goal.kind)?.label ?? goal.kind);
  return `For: ${label}${goal.targetMonth ? ` · by ${monthYear(`${goal.targetMonth}-01`)}` : ''}`;
}

/** POST /api/cart {fundId, kind: 'sip' | 'one_time', amount, day?, goal?}: a SIP may carry the goal set in the order card. */
export async function addToCart(
  db: Db,
  investorId: string,
  input: unknown,
  today: string,
): Promise<{ status: 200; message: string } | { status: 400 | 404; error: string }> {
  const body = (input ?? {}) as { fundId?: unknown; kind?: unknown; amount?: unknown; day?: unknown; goal?: unknown };
  const [fund] = (await db.query<{ id: number; name: string; min_sip: number }>('SELECT id, name, min_sip FROM funds WHERE id = $1', [Number.isInteger(body.fundId) ? body.fundId : 0])).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  if (body.kind !== 'sip' && body.kind !== 'one_time') return { status: 400, error: 'Choose a monthly SIP or a one-time investment.' };
  // A one-time investment has no date, so check its amount against a date that always passes.
  const checked = checkSip(body.amount, body.kind === 'sip' ? body.day : 1, fund.min_sip);
  if (checked) return checked;
  // The goal is checked now and checked again when the SIP starts from the cart.
  const goal = body.kind === 'sip' ? parseGoal(body.goal, { today, firstDue: firstDueDate(today, body.day as number) }) : ({ ok: true, goal: null } as const);
  if (!goal.ok) return { status: 400, error: goal.error };
  await db.query('INSERT INTO cart_items (investor_id, fund_id, kind, amount, day_of_month, goal) VALUES ($1, $2, $3, $4, $5, $6)', [
    investorId,
    fund.id,
    body.kind,
    body.amount,
    body.kind === 'sip' ? body.day : null,
    goal.goal ? body.goal : null,
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
  amountValue: number;
  day: number | null;
  /** The goal saved with the item, as the APIs take it, and how it reads: 'For: Retirement · by Mar 2056'. */
  goal: { body: unknown; text: string } | null;
}

export async function cartView(db: Db, investorId: string): Promise<{ items: CartItem[]; total: string; maxAmount: number }> {
  const { rows } = await db.query<{
    id: number; fund_id: number; fund: string; kind: 'sip' | 'one_time'; amount: number; day_of_month: number | null;
    goal: { kind: string; name?: string; targetMonth?: string | null } | null;
  }>(
    `SELECT c.id, c.fund_id, f.name AS fund, c.kind, c.amount, c.day_of_month, c.goal FROM cart_items c JOIN funds f ON f.id = c.fund_id
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
      amountValue: r.amount,
      day: r.day_of_month,
      goal: r.goal ? { body: r.goal, text: goalText(r.goal) } : null,
    })),
    total: inr(rows.reduce((sum, r) => sum + r.amount, 0)),
    maxAmount: MAX_AMOUNT,
  };
}
