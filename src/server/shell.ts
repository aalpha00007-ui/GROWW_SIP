// What the app shell shows for the signed-in investor: the demo balance, the cart count, demo
// notifications from their own SIPs, and the search suggestions (made-up funds and stocks only).
import type { Db } from '../db/client';
import { dayMonthYear } from '../pipeline/chunking/format';
import { DEMO_BALANCE } from './auth';
import { homeView } from './home';
import { inr } from './money';

/**
 * ₹1,00,000 at the start, less every instalment and one-time investment made during the demo. A persona's history
 * from before the demo doesn't count. `today` matters only under the regression suite's clock, which can sit before the
 * real date the account was made; anywhere else today is never before it.
 */
export async function demoBalance(db: Db, investorId: string, today: string): Promise<number> {
  const [row] = (
    await db.query<{ spent: number }>(
      `SELECT (
         coalesce((SELECT sum(i.amount) FROM instalments i JOIN sips s ON s.id = i.sip_id JOIN investors v ON v.id = s.investor_id
                   WHERE s.investor_id = $1 AND i.paid_on >= least((v.created_at AT TIME ZONE 'Asia/Kolkata')::date, $2::date)), 0)
         + coalesce((SELECT sum(amount) FROM lumpsums WHERE investor_id = $1), 0)
       )::int AS spent`,
      [investorId, today],
    )
  ).rows;
  return DEMO_BALANCE - row.spent;
}

export interface Notification {
  /** Changes when the news does: a new instalment is unread again, an old one stays read. */
  id: string;
  title: string;
  text: string;
  when: string;
  href: string;
  read: boolean;
}

/** POST /api/notifications/read {ids}: these stay read, across pages and sign-ins. */
export async function markNotificationsRead(db: Db, investorId: string, input: unknown): Promise<{ status: 200; message: string } | { status: 400; error: string }> {
  const ids = (input as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length > 20 || !ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 120)) {
    return { status: 400, error: 'Say which notifications were read.' };
  }
  await db.query(
    'INSERT INTO notification_reads (investor_id, notification_id) SELECT $1, id FROM unnest($2::text[]) AS t(id) ON CONFLICT DO NOTHING',
    [investorId, ids],
  );
  return { status: 200, message: 'Read.' };
}

export interface ShellData {
  balance: string;
  cartCount: number;
  notifications: Notification[];
  suggestions: { label: string; kind: 'Fund' | 'Stock'; href: string }[];
}

export async function shellData(db: Db, investorId: string, today: string): Promise<ShellData> {
  const [home, balance, cart, funds, stocks, lastPaid, reads] = await Promise.all([
    homeView(db, investorId, today),
    demoBalance(db, investorId, today),
    db.query<{ n: number }>('SELECT count(*)::int AS n FROM cart_items WHERE investor_id = $1 AND removed_at IS NULL', [investorId]),
    db.query<{ id: number; name: string }>('SELECT id, name FROM funds ORDER BY id'),
    db.query<{ id: number; name: string }>("SELECT id, name FROM assets WHERE kind = 'stock' ORDER BY id"),
    db.query<{ id: number; amount: number; paid_on: string; fund: string }>(
      `SELECT i.id, i.amount, i.paid_on::text, f.name AS fund FROM instalments i JOIN sips s ON s.id = i.sip_id JOIN funds f ON f.id = s.fund_id
       WHERE s.investor_id = $1 AND i.paid_on IS NOT NULL ORDER BY i.paid_on DESC, i.id DESC LIMIT 1`,
      [investorId],
    ),
    db.query<{ notification_id: string }>('SELECT notification_id FROM notification_reads WHERE investor_id = $1', [investorId]),
  ]);

  const next = home.comingUp[0];
  const paid = lastPaid.rows[0];
  const goal = home.goals.find((g) => g.barPct !== null) ?? home.goals[0];
  const read = new Set(reads.rows.map((r) => r.notification_id));
  const notifications: Notification[] = [
    next
      ? { id: `due-${next.sipId}-${next.due}`, title: 'Instalment due', text: `${next.amount} for ${next.fund} on ${next.date}.`, when: 'Today', href: `/sips/${next.sipId}` }
      : { id: 'first-sip', title: 'Start your first SIP', text: 'Pick a made-up fund and say what it is for.', when: 'Today', href: '/explore' },
    paid
      ? // Opens this very instalment, never a page that doesn't show it.
        { id: `paid-${paid.id}`, title: 'Instalment paid', text: `${inr(paid.amount)} into ${paid.fund} on ${dayMonthYear(paid.paid_on)}.`, when: 'Earlier', href: `/orders?instalment=${paid.id}#instalment-${paid.id}` }
      : { id: 'balance', title: 'Demo balance ready', text: `You have ${inr(balance)} of demo money to invest.`, when: 'Earlier', href: '/explore' },
    goal
      ? { id: `goal-${goal.id}-${goal.paidLabel}`, title: 'Goal milestone', text: `${goal.name}: ${goal.paidLabel}.`, when: 'Earlier', href: '/dashboard#your-goals' }
      : { id: 'set-goal', title: 'Set a goal', text: 'Tell us what a SIP is for when you start it.', when: 'Earlier', href: '/explore' },
    { id: 'new', title: 'New: goals on your SIPs', text: 'When the market falls, we show your goal next to your SIP.', when: 'This week', href: '/dashboard' },
    { id: 'welcome', title: 'Welcome to the Groww prototype', text: 'A case-study prototype: demo money, made-up funds, no advice.', when: 'This week', href: '/help' },
  ].map((n) => ({ ...n, read: read.has(n.id) }));

  return {
    balance: inr(balance),
    cartCount: cart.rows[0].n,
    notifications,
    suggestions: [
      ...funds.rows.map((f) => ({ label: f.name, kind: 'Fund' as const, href: `/fund/${f.id}` })),
      ...stocks.rows.map((s) => ({ label: s.name, kind: 'Stock' as const, href: '/stocks' })),
    ],
  };
}
