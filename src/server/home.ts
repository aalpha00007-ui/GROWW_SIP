// Home (PRD F4, F12): one card per goal, the "no goal yet" row, the coming-up instalments and a
// mutual-fund summary. Every SIP number comes from retrieveFacts, the same facts the AI answers from; a
// goal card adds the one-time investments made for that goal. Formatted here: the page prints these strings
// and does no maths (spec §5).
import type { Db } from '../db/client';
import type { SipFacts } from '../pipeline/chunking/facts';
import { dayMonthYear, duration, monthsBetween, monthYear, percent } from '../pipeline/chunking/format';
import { inr, signedInr } from './money';
import { retrieveFacts } from '../pipeline/retrieval/facts';

export type Direction = 'up' | 'down' | 'flat';

/** A change vs what was put in: '-₹810 (-5.8%)'. The page adds the arrow and colour from `direction`. */
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
  /** '7 of 60 instalments paid', '4 instalments paid' without a target month, or '1 one-time investment'. */
  paidLabel: string;
  /** Width of the paid-of-planned bar, 0-100; null without a target month. */
  barPct: number | null;
  /** '₹14,000' */
  putIn: string;
  /** What will have been put in by the target month if the SIPs carry on, one-time money included: '₹1,20,000'. Never a value forecast. */
  planned: string | null;
  value: string;
  /** Null before the first instalment is paid. */
  change: Change | null;
  sips: { id: number; label: string }[];
  /** 'Kestrel Nifty 50 Index Fund · ₹5,000 one-time' */
  oneTime: string[];
  /** The SIP "What does this dip mean for my goal?" explains: the one with the most put in. Null before anything is put in. */
  dipSipId: number | null;
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
  /** For Products & Tools: SIPs not stopped, and goals with a SIP. */
  activeSips: number;
  goalCount: number;
}

interface SipRow {
  id: number;
  goal_id: number | null;
  goal_name: string | null;
  target_month: string | null;
}

/** A one-time investment made for a goal, valued at the latest NAV this visitor sees (demo falls included). */
interface OneTimeRow {
  goal_id: number;
  goal_name: string;
  target_month: string | null;
  fund: string;
  amount: number;
  value: number;
}

export async function homeView(db: Db, investorId: string, today: string): Promise<HomeView> {
  const { rows } = await db.query<SipRow>(
    `SELECT s.id, s.goal_id, g.name AS goal_name, g.target_month::text
     FROM sips s LEFT JOIN goals g ON g.id = s.goal_id
     WHERE s.investor_id = $1 ORDER BY s.goal_id NULLS LAST, s.id`,
    [investorId],
  );
  const lookups = await Promise.all(rows.map((r) => retrieveFacts(db, investorId, r.id, today)));
  // A stopped SIP stays: its units are still invested, so they count in the goal and the summary.
  const sips = rows.flatMap((row, i) => {
    const lookup = lookups[i];
    return lookup.status === 'not_found' ? [] : [{ row, facts: lookup.facts, stopped: lookup.status === 'stopped' }];
  });

  const [demo] = (
    await db.query<{ days: number }>('SELECT count(DISTINCT nav_date)::int AS days FROM demo_nav_history WHERE investor_id = $1', [investorId])
  ).rows;
  const oneTime = (
    await db.query<OneTimeRow>(
      `SELECT l.goal_id, g.name AS goal_name, g.target_month::text, f.name AS fund, l.amount,
         (l.units * (SELECT v.nav FROM visible_nav_history($1) v WHERE v.fund_id = l.fund_id ORDER BY v.nav_date DESC LIMIT 1))::float8 AS value
       FROM lumpsums l JOIN goals g ON g.id = l.goal_id JOIN funds f ON f.id = l.fund_id
       WHERE l.investor_id = $1 ORDER BY l.id`,
      [investorId],
    )
  ).rows;

  const byGoal = new Map<number, GoalSip[]>();
  for (const sip of sips) {
    if (sip.row.goal_id === null) continue;
    byGoal.set(sip.row.goal_id, [...(byGoal.get(sip.row.goal_id) ?? []), sip]);
  }
  // A goal can hold only one-time money; its card comes after the goals with SIPs.
  for (const o of oneTime) if (!byGoal.has(o.goal_id)) byGoal.set(o.goal_id, []);
  // A stopped SIP needs no goal, so only active ones count as "no goal yet".
  const noGoal = sips.filter((s) => s.row.goal_id === null && !s.stopped);
  const asOf = sips.reduce<string | null>((latest, s) => (latest && latest > s.facts.as_of ? latest : s.facts.as_of), null);

  return {
    asOf: asOf ? `Numbers as of ${dayMonthYear(asOf)}` : null,
    demoNote: demo.days > 0 ? `Includes ${demo.days} simulated market ${demo.days === 1 ? 'fall' : 'falls'}` : null,
    summary: sips.length ? summary(sips.map((s) => s.facts)) : null,
    goals: [...byGoal.entries()].map(([id, group]) => goalCard(id, group, oneTime.filter((o) => o.goal_id === id), today)),
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
      .map(({ facts, due }) => ({ sipId: facts.sip_id, date: dayMonthYear(due), fund: facts.fund_name, amount: inr(facts.amount) })),
    activeSips: sips.filter((s) => !s.stopped).length,
    goalCount: byGoal.size,
  };
}

interface GoalSip {
  row: SipRow;
  facts: SipFacts;
  stopped: boolean;
}

function goalCard(id: number, group: GoalSip[], oneTime: OneTimeRow[], today: string): GoalCard {
  const { goal_name, target_month } = group[0]?.row ?? oneTime[0];
  const all = group.map((g) => g.facts);
  const paid = sum(all, (f) => f.instalments_paid);
  const oneTimeIn = sum(oneTime, (o) => o.amount);
  // A stopped SIP plans nothing more: it counts what was paid. With every SIP stopped there is no plan to show.
  const planning = target_month !== null && group.some((g) => !g.stopped);
  const planned = planning ? sum(group, (g) => (g.stopped ? g.facts.instalments_paid : (g.facts.instalments_planned ?? 0))) : null;
  // Instalments still to come, counted the way the facts unit counts them, plus the one-time money already in.
  const plannedPutIn = planning
    ? oneTimeIn +
      sum(group, ({ facts: f, stopped }) => f.invested + (stopped ? 0 : Math.max(0, (f.instalments_planned ?? 0) - f.instalments_paid - f.instalments_skipped) * f.amount))
    : null;
  const main = [...all].sort((a, b) => b.invested - a.invested || a.sip_id - b.sip_id)[0];
  const putIn = sum(all, (f) => f.invested) + oneTimeIn;
  const value = sum(all, (f) => f.current_value) + sum(oneTime, (o) => o.value);
  const change = changeBetween(putIn, value);

  return {
    id,
    name: goal_name!,
    targetMonth: target_month ? `by ${monthYear(target_month)}` : null,
    timeToGo: timeToGo(today, target_month),
    paidLabel:
      group.length === 0
        ? `${oneTime.length} one-time ${oneTime.length === 1 ? 'investment' : 'investments'}`
        : planned !== null
          ? `${paid} of ${planned} instalments paid`
          : `${paid} ${paid === 1 ? 'instalment' : 'instalments'} paid`,
    barPct: planned ? Math.min(100, Math.round((paid / planned) * 1000) / 10) : null,
    putIn: inr(putIn),
    planned: plannedPutIn !== null ? inr(plannedPutIn) : null,
    value: inr(value),
    change,
    sips: group.map(({ facts: f, stopped }) => ({ id: f.sip_id, label: `${f.fund_name} · ${stopped ? 'stopped' : `${inr(f.amount)} a month`}` })),
    oneTime: oneTime.map((o) => `${o.fund} · ${inr(o.amount)} one-time`),
    // Only a goal that is down has a dip to explain, and the explainer reads a SIP's facts.
    dipSipId: change?.direction === 'down' && main ? main.sip_id : null,
  };
}

function summary(all: SipFacts[]): NonNullable<HomeView['summary']> {
  return {
    value: inr(sum(all, (f) => f.current_value)),
    putIn: inr(sum(all, (f) => f.invested)),
    change: changeOf(all),
    sipCount: all.length === 1 ? '1 SIP' : `${all.length} SIPs`,
  };
}

/** The change vs put in across these SIPs; null before anything is put in. */
export function changeOf(all: SipFacts[]): Change | null {
  return changeBetween(
    sum(all, (f) => f.invested),
    sum(all, (f) => f.current_value),
  );
}

/** The change from what was put in to what it is worth; null before anything is put in. */
function changeBetween(invested: number, value: number): Change | null {
  if (invested === 0) return null;
  const diff = value - invested;
  const whole = Math.round(diff);
  return {
    text: `${signedInr(diff)} (${percent((diff / invested) * 100, true)})`,
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
