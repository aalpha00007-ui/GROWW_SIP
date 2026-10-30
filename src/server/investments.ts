// "Your investments" on Explore and the Dashboard: current value, 1D returns, total returns, invested
// and XIRR across this investor's demo SIPs and one-time investments, plus one row per holding with
// its goal. Values are units x the latest NAV this visitor sees, the same sum the AI's facts use.
import type { Db } from '../db/client';
import { dayMonthYear, monthYear, percent } from '../pipeline/chunking/format';
import { inr, signedInr } from './money';

interface Flow {
  sip_id: number | null;
  fund_id: number;
  fund: string;
  goal: string | null;
  target_month: string | null;
  stopped: boolean;
  amount: number;
  units: string;
  on_date: string;
}

export interface Holding {
  /** The SIP, or null for one-time investments in a fund. */
  sipId: number | null;
  fund: string;
  /** 'SIP · ₹2,000 a month', 'SIP · stopped' or 'One-time'. */
  kind: string;
  /** 'For: Home down payment · by Mar 2031', or null without a goal. */
  goal: string | null;
  value: string;
  putIn: string;
  /** '-₹810 (-5.8%)'; null when nothing has changed hands. */
  change: string | null;
}

export interface InvestmentsView {
  current: string;
  /** 'For: Home down payment by Mar 2031', one per goal. */
  goals: string[];
  rows: { label: string; value: string; signed: boolean }[];
  /** 'Numbers as of 27 Oct 2026' */
  asOf: string;
  holdings: Holding[];
}

/** Null when nothing is invested yet (the empty state). */
export async function investmentsView(db: Db, investorId: string): Promise<InvestmentsView | null> {
  const flows = (
    await db.query<Flow>(
      `SELECT s.id AS sip_id, s.fund_id, f.name AS fund, g.name AS goal, g.target_month::text, i.amount, i.units::text, i.paid_on::text AS on_date,
         EXISTS (SELECT 1 FROM sip_events e WHERE e.sip_id = s.id AND e.kind = 'cancelled') AS stopped
       FROM instalments i JOIN sips s ON s.id = i.sip_id JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.investor_id = $1 AND i.paid_on IS NOT NULL
       UNION ALL
       SELECT NULL, l.fund_id, f.name, g.name, g.target_month::text, l.amount, l.units::text, (l.created_at AT TIME ZONE 'Asia/Kolkata')::date::text, false
       FROM lumpsums l JOIN funds f ON f.id = l.fund_id LEFT JOIN goals g ON g.id = l.goal_id
       WHERE l.investor_id = $1
       ORDER BY on_date`,
      [investorId],
    )
  ).rows;
  if (flows.length === 0) return null;

  const fundIds = [...new Set(flows.map((f) => f.fund_id))];
  const navs = (
    await db.query<{ fund_id: number; nav: string; nav_date: string; rn: number }>(
      `SELECT fund_id, nav::text, nav_date::text, rn::int FROM (
         SELECT fund_id, nav, nav_date, row_number() OVER (PARTITION BY fund_id ORDER BY nav_date DESC) AS rn
         FROM visible_nav_history($1) WHERE fund_id = ANY($2::int[])
       ) t WHERE rn <= 2`,
      [investorId, fundIds],
    )
  ).rows;
  const latest = new Map(navs.filter((n) => n.rn === 1).map((n) => [n.fund_id, Number(n.nav)]));
  const latestDate = new Map(navs.filter((n) => n.rn === 1).map((n) => [n.fund_id, n.nav_date]));
  const previous = new Map(navs.filter((n) => n.rn === 2).map((n) => [n.fund_id, Number(n.nav)]));
  const asOf = navs.reduce((last, n) => (n.nav_date > last ? n.nav_date : last), '');

  const value = (f: Flow) => Number(f.units) * latest.get(f.fund_id)!;
  const current = sum(flows, value);
  const invested = sum(flows, (f) => f.amount);
  // Units bought at the latest NAV have not moved yet, so only units bought before that day count.
  const oneDay = sum(flows, (f) =>
    f.on_date < latestDate.get(f.fund_id)! ? Number(f.units) * (latest.get(f.fund_id)! - (previous.get(f.fund_id) ?? latest.get(f.fund_id)!)) : 0,
  );
  const rate = xirr([...flows.map((f) => ({ date: f.on_date, amount: -f.amount })), { date: asOf, amount: current }]);

  const goals = [
    ...new Set(flows.filter((f) => f.goal).map((f) => `For: ${f.goal}${f.target_month ? ` by ${monthYear(f.target_month)}` : ''}`)),
  ];

  // One row per SIP, and one per fund for one-time investments.
  const groups = new Map<string, Flow[]>();
  for (const f of flows) {
    const key = f.sip_id !== null ? `sip-${f.sip_id}` : `once-${f.fund_id}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const amounts = (
    await db.query<{ id: number; amount: number }>('SELECT id, amount FROM sips WHERE investor_id = $1', [investorId])
  ).rows;

  return {
    current: inr(current),
    goals,
    rows: [
      { label: '1D returns', value: changeText(oneDay, current - oneDay), signed: true },
      { label: 'Total returns', value: changeText(current - invested, invested), signed: true },
      { label: 'Invested', value: inr(invested), signed: false },
      { label: 'XIRR', value: rate === null ? 'After 30 days' : percent(rate * 100, true), signed: rate !== null },
    ],
    asOf: `Numbers as of ${dayMonthYear(asOf)}`,
    holdings: [...groups.values()].map((group) => {
      const first = group[0];
      const putIn = sum(group, (f) => f.amount);
      const worth = sum(group, value);
      const monthly = amounts.find((a) => a.id === first.sip_id)?.amount;
      return {
        sipId: first.sip_id,
        fund: first.fund,
        kind: first.sip_id === null ? 'One-time' : first.stopped ? 'SIP · stopped' : `SIP · ${inr(monthly ?? 0)} a month`,
        goal: first.goal ? `For: ${first.goal}${first.target_month ? ` · by ${monthYear(first.target_month)}` : ''}` : null,
        value: inr(worth),
        putIn: inr(putIn),
        change: changeText(worth - putIn, putIn),
      };
    }),
  };
}

/** '+₹1,200 (+2.4%)' or '-₹580 (-1.1%)'; the percent is of `base`. */
function changeText(diff: number, base: number): string {
  const pct = base > 0 ? ` (${percent((diff / base) * 100, true)})` : '';
  return `${signedInr(diff)}${pct}`;
}

/**
 * The yearly rate that makes these cash flows add up to zero (money in is negative, today's value
 * positive). Null until the first investment is 30 days old: a rate a year at a time means little sooner.
 */
export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const t0 = Date.parse(flows[0].date);
  const years = flows.map((f) => (Date.parse(f.date) - t0) / 86_400_000 / 365);
  if (Math.max(...years) * 365 < 30) return null;
  const npv = (rate: number) => flows.reduce((total, f, i) => total + f.amount / (1 + rate) ** years[i], 0);
  // NPV falls as the rate rises, so halve the gap between a rate that is too low and one too high.
  let low = -0.99;
  let high = 10;
  if (npv(low) * npv(high) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
