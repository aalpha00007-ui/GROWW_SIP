// The Orders page: every instalment across all of an investor's SIPs, and their one-time orders, as one ledger. Its
// rows are the schedule's own (pipeline/chunking/schedule.ts), so it can't disagree with a SIP's page.
import type { Db } from '../db/client';
import { dayMonthYear, demoDate } from '../pipeline/chunking/format';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import type { RowState } from '../pipeline/chunking/schedule';
import { inr } from './money';
import { ROW_LABELS } from './sip';

export interface OrderRow {
  key: string;
  /** The page anchor a notification links to: 'instalment-123'. Only a paid instalment has one. */
  anchor: string | null;
  /** The instalment's id, for the row a notification opened. */
  instalmentId: number | null;
  date: string;
  /** For sorting: 'YYYY-MM-DD'. */
  sortDate: string;
  fund: string;
  sipId: number | null;
  /** '₹2,000', or '—' where no amount is recorded (a past skip was never charged). */
  amount: string;
  status: string;
  state: RowState | 'one_time';
}

export interface OrdersView {
  demoDate: string;
  rows: OrderRow[];
  /** A due date passed with no payment and no skip, so the page says why. */
  hasNotCollected: boolean;
}

export async function ordersView(db: Db, investorId: string, today: string): Promise<OrdersView> {
  const sips = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id', [investorId])).rows;
  const lookups = await Promise.all(sips.map((s) => retrieveFacts(db, investorId, s.id, today)));
  const instalments: OrderRow[] = lookups.flatMap((lookup) => {
    if (lookup.status === 'not_found') return [];
    const { facts, schedule } = lookup;
    return schedule.rows.map((r, i) => ({
      key: `${facts.sip_id}-${r.due}-${r.state}-${i}`,
      anchor: r.id ? `instalment-${r.id}` : null,
      instalmentId: r.id ?? null,
      date: dayMonthYear(r.date),
      sortDate: r.date,
      fund: facts.fund_name,
      sipId: facts.sip_id,
      amount: r.amount === null ? '—' : inr(r.amount),
      status: `${ROW_LABELS[r.state]}${r.paused ? ' (paused)' : ''}`,
      state: r.state,
    }));
  });
  const oneTime: OrderRow[] = (
    await db.query<{ id: number; day: string; fund: string; amount: number }>(
      `SELECT l.id, (l.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day, f.name AS fund, l.amount
       FROM lumpsums l JOIN funds f ON f.id = l.fund_id WHERE l.investor_id = $1`,
      [investorId],
    )
  ).rows.map((l) => ({
    key: `one-time-${l.id}`,
    anchor: null,
    instalmentId: null,
    date: dayMonthYear(l.day),
    sortDate: l.day,
    fund: l.fund,
    sipId: null,
    amount: inr(l.amount),
    status: 'One-time',
    state: 'one_time' as const,
  }));
  const rows = [...instalments, ...oneTime].sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.key.localeCompare(b.key));
  return { demoDate: demoDate(dayMonthYear(today)), rows, hasNotCollected: rows.some((r) => r.state === 'not_collected') };
}
