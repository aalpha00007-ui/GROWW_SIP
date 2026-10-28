// Home (PRD F4, F12): one card per goal, the "no goal yet" row, the coming-up instalments and a
// mutual-fund summary. Every number comes from retrieveFacts, the same facts the AI answers from,
// and is formatted here: the page prints these strings and does no maths (spec §5).
import type { Db } from '../db/client';
import type { SipFacts } from '../pipeline/chunking/facts';
import { dayMonthYear, duration, monthsBetween, monthYear, percent, rupees, signedRupees } from '../pipeline/chunking/format';
import { retrieveFacts } from '../pipeline/retrieval/facts';

export type Direction = 'up' | 'down' | 'flat';

/** A change vs what was put in: '-Rs 810 (-5.8%)'. The page adds the arrow and colour from `direction`. */
export interface Change {
  text: string;
  direction: Direction;
}

export interface GoalCard {
  id: number;
  name: string;
  /** 'by Mar 2031', or null when the goal has no target month. */
  targetMonth: string | null;
  /** '4 years 5 months to go', 'This month', 'Goal date reached' or 'No target date'. */
  timeToGo: string;
  /** '7 of 60 instalments paid', or '4 instalments paid' without a target month. */
  paidLabel: string;
  /** Width of the paid-of-planned bar, 0-100; null without a target month. */
  barPct: number | null;
  /** 'Rs 14,000' */
  putIn: string;
  /** What will have been put in by the target month if the SIPs carry on: 'Rs 1,20,000'. Never a value forecast. */
  planned: string | null;
  value: string;
  /** Null before the first instalment is paid. */
  change: Change | null;
  sips: { id: number; label: string }[];
  /** The SIP "What does this dip mean for my goal?" explains: the one with the most put in. */
  dipSipId: number;
}

export interface HomeView {
  /** 'Numbers as of 27 Oct 2026'; null when the investor has no SIPs. */
  asOf: string | null;
  /** 'Includes 1 simulated market fall'; null when there is none. */
  demoNote: string | null;
  summary: { value: string; putIn: string; change: Change | null; sipCount: string } | null;
  goals: GoalCard[];
  noGoal: { text: string; funds: string[]; href: string } | null;
  comingUp: { sipId: number; date: string; fund: string; amount: string }[];
}

interface SipRow {
  id: number;
  goal_id: number | null;
  goal_name: string | null;
  target_month: string | null;
}

export async function homeView(db: Db, investorId: string, today: string): Promise<HomeView> {
  const { rows } = await db.query<SipRow>(
    `SELECT s.id, s.goal_id, g.name AS goal_name, g.target_month::text
     FROM sips s LEFT JOIN goals g ON g.id = s.goal_id
     WHERE s.investor_id = $1 ORDER BY s.goal_id NULLS LAST, s.id`,
    [investorId],
  );
  const lookups = await Promise.all(rows.map((r) => retrieveFacts(db, investorId, r.id, today)));
  // No SIP can be stopped yet; once the stop flow exists, a stopped SIP's units still count here.
  const sips = rows.flatMap((row, i) => {
    const lookup = lookups[i];
    return lookup.status === 'ok' ? [{ row, facts: lookup.facts }] : [];
  });

  const [demo] = (
    await db.query<{ days: number }>('SELECT count(DISTINCT nav_date)::int AS days FROM demo_nav_history WHERE investor_id = $1', [investorId])
  ).rows;

  const byGoal = new Map<number, { row: SipRow; facts: SipFacts }[]>();
  for (const sip of sips) {
    if (sip.row.goal_id === null) continue;
    byGoal.set(sip.row.goal_id, [...(byGoal.get(sip.row.goal_id) ?? []), sip]);
  }
  const noGoal = sips.filter((s) => s.row.goal_id === null);
  const asOf = sips.reduce<string | null>((latest, s) => (latest && latest > s.facts.as_of ? latest : s.facts.as_of), null);

  return {
    asOf: asOf ? `Numbers as of ${dayMonthYear(asOf)}` : null,
    demoNote: demo.days > 0 ? `Includes ${demo.days} simulated market ${demo.days === 1 ? 'fall' : 'falls'}` : null,
    summary: sips.length ? summary(sips.map((s) => s.facts)) : null,
    goals: [...byGoal.entries()].map(([id, group]) => goalCard(id, group, today)),
    noGoal: noGoal.length
      ? {
          text: noGoal.length === 1 ? '1 SIP has no goal yet' : `${noGoal.length} SIPs have no goal yet`,
          funds: noGoal.map((s) => s.facts.fund_name),
          href: noGoal.length === 1 ? `/sips/${noGoal[0].row.id}/goal` : '/sips',
        }
      : null,
    comingUp: sips
      .flatMap(({ facts }) => (facts.next_due_date ? [{ facts, due: facts.next_due_date }] : []))
      .sort((a, b) => a.due.localeCompare(b.due) || a.facts.sip_id - b.facts.sip_id)
      .map(({ facts, due }) => ({ sipId: facts.sip_id, date: dayMonthYear(due), fund: facts.fund_name, amount: rupees(facts.amount) })),
  };
}

function goalCard(id: number, group: { row: SipRow; facts: SipFacts }[], today: string): GoalCard {
  const { goal_name, target_month } = group[0].row;
  const all = group.map((g) => g.facts);
  const paid = sum(all, (f) => f.instalments_paid);
  const planned = target_month ? sum(all, (f) => f.instalments_planned ?? 0) : null;
  // Instalments still to come, counted the way the facts unit counts them.
  const plannedPutIn = target_month
    ? sum(all, (f) => f.invested + Math.max(0, (f.instalments_planned ?? 0) - f.instalments_paid - f.instalments_skipped) * f.amount)
    : null;
  const main = [...all].sort((a, b) => b.invested - a.invested || a.sip_id - b.sip_id)[0];

  return {
    id,
    name: goal_name!,
    targetMonth: target_month ? `by ${monthYear(target_month)}` : null,
    timeToGo: timeToGo(today, target_month),
    paidLabel: planned !== null ? `${paid} of ${planned} instalments paid` : `${paid} ${paid === 1 ? 'instalment' : 'instalments'} paid`,
    barPct: planned ? Math.min(100, Math.round((paid / planned) * 1000) / 10) : null,
    putIn: rupees(sum(all, (f) => f.invested)),
    planned: plannedPutIn !== null ? rupees(plannedPutIn) : null,
    value: rupees(sum(all, (f) => f.current_value)),
    change: change(all),
    sips: all.map((f) => ({ id: f.sip_id, label: `${f.fund_name} · ${rupees(f.amount)} a month` })),
    dipSipId: main.sip_id,
  };
}

function summary(all: SipFacts[]): NonNullable<HomeView['summary']> {
  return {
    value: rupees(sum(all, (f) => f.current_value)),
    putIn: rupees(sum(all, (f) => f.invested)),
    change: change(all),
    sipCount: all.length === 1 ? '1 SIP' : `${all.length} SIPs`,
  };
}

function change(all: SipFacts[]): Change | null {
  const invested = sum(all, (f) => f.invested);
  if (invested === 0) return null;
  const diff = sum(all, (f) => f.current_value) - invested;
  const whole = Math.round(diff);
  return {
    text: `${signedRupees(diff)} (${percent((diff / invested) * 100, true)})`,
    direction: whole > 0 ? 'up' : whole < 0 ? 'down' : 'flat',
  };
}

/** The same wording as the facts the AI reads (goalLines in chunking/facts.ts). */
function timeToGo(today: string, targetMonth: string | null): string {
  if (!targetMonth) return 'No target date';
  const left = monthsBetween(today, targetMonth);
  if (left < 0) return 'Goal date reached';
  return left === 0 ? 'This month' : `${duration(left)} to go`;
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
