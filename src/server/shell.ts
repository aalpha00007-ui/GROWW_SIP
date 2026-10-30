// What the app shell shows for the signed-in investor: the demo balance, the cart count, six demo
// notifications from their own SIPs, and the search suggestions (made-up funds and stocks only).
import type { Db } from '../db/client';
import { dayMonthYear } from '../pipeline/chunking/format';
import { DEMO_BALANCE } from './auth';
import { homeView } from './home';
import { inr } from './money';

/** ₹1,00,000 at the start, less every instalment and one-time investment made during the demo. */
export async function demoBalance(db: Db, investorId: string): Promise<number> {
  const [row] = (
    await db.query<{ spent: number }>(
      `SELECT (
         coalesce((SELECT sum(i.amount) FROM instalments i JOIN sips s ON s.id = i.sip_id JOIN investors v ON v.id = s.investor_id
                   WHERE s.investor_id = $1 AND i.paid_on >= (v.created_at AT TIME ZONE 'Asia/Kolkata')::date), 0)
         + coalesce((SELECT sum(amount) FROM lumpsums WHERE investor_id = $1), 0)
       )::int AS spent`,
      [investorId],
    )
  ).rows;
  return DEMO_BALANCE - row.spent;
}

export interface Notification {
  id: string;
  title: string;
  text: string;
  when: string;
  href: string;
}

export interface ShellData {
  balance: string;
  cartCount: number;
  notifications: Notification[];
  suggestions: { label: string; kind: 'Fund' | 'Stock'; href: string }[];
}

export async function shellData(db: Db, investorId: string, today: string): Promise<ShellData> {
  const [home, balance, cart, funds, stocks, demo, lastPaid] = await Promise.all([
    homeView(db, investorId, today),
    demoBalance(db, investorId),
    db.query<{ n: number }>('SELECT count(*)::int AS n FROM cart_items WHERE investor_id = $1 AND removed_at IS NULL', [investorId]),
    db.query<{ id: number; name: string }>('SELECT id, name FROM funds ORDER BY id'),
    db.query<{ id: number; name: string }>("SELECT id, name FROM assets WHERE kind = 'stock' ORDER BY id"),
    db.query<{ day: string | null }>('SELECT max(nav_date)::text AS day FROM demo_nav_history WHERE investor_id = $1', [investorId]),
    db.query<{ amount: number; paid_on: string; fund: string }>(
      `SELECT i.amount, i.paid_on::text, f.name AS fund FROM instalments i JOIN sips s ON s.id = i.sip_id JOIN funds f ON f.id = s.fund_id
       WHERE s.investor_id = $1 AND i.paid_on IS NOT NULL ORDER BY i.paid_on DESC, i.id DESC LIMIT 1`,
      [investorId],
    ),
  ]);

  const next = home.comingUp[0];
  const paid = lastPaid.rows[0];
  const goal = home.goals.find((g) => g.barPct !== null) ?? home.goals[0];
  const fallDay = demo.rows[0].day;
  const notifications: Notification[] = [
    next
      ? { id: 'due', title: 'Instalment due', text: `${next.amount} for ${next.fund} on ${next.date}.`, when: 'Today', href: `/sips/${next.sipId}` }
      : { id: 'due', title: 'Start your first SIP', text: 'Pick a made-up fund and say what it is for.', when: 'Today', href: '/explore' },
    fallDay
      ? { id: 'fall', title: 'Demo market fell', text: `A simulated fall on ${dayMonthYear(fallDay)}. See it next to your goals.`, when: 'Today', href: '/dashboard' }
      : { id: 'fall', title: 'Try a market fall', text: 'Simulate a market fall to see a dip next to your goal.', when: 'Today', href: '/explore' },
    paid
      ? { id: 'paid', title: 'Instalment paid', text: `${inr(paid.amount)} into ${paid.fund} on ${dayMonthYear(paid.paid_on)}.`, when: 'Earlier', href: '/orders' }
      : { id: 'paid', title: 'Demo balance ready', text: `You have ${inr(balance)} of demo money to invest.`, when: 'Earlier', href: '/explore' },
    goal
      ? { id: 'goal', title: 'Goal milestone', text: `${goal.name}: ${goal.paidLabel}.`, when: 'Earlier', href: '/dashboard#your-goals' }
      : { id: 'goal', title: 'Set a goal', text: 'Tell us what a SIP is for when you start it.', when: 'Earlier', href: '/explore' },
    { id: 'new', title: 'New: goals on your SIPs', text: 'When the market falls, we show your goal next to your SIP.', when: 'This week', href: '/dashboard' },
    { id: 'welcome', title: 'Welcome to the Groww prototype', text: 'A case-study prototype: demo money, made-up funds, no advice.', when: 'This week', href: '/help' },
  ];

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
