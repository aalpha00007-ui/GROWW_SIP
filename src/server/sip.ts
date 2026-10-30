// One SIP for its page (PRD F5), Before you stop (F7) and the actions on it. Facts come from
// retrieveFacts; the SIP's status is computed from sip_events, never stored (build spec §5).
import type { Db } from '../db/client';
import type { FactsUnit, SipFacts } from '../pipeline/chunking/facts';
import { dayMonthYear, monthsBetween, monthYear, ordinal, percent } from '../pipeline/chunking/format';
import { inr } from './money';
import { addMonths, monthStart } from '../pipeline/loading/dates';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { changeOf, type Change } from './home';

export type SipStatus = 'active' | 'paused' | 'stopped';

export interface SipState {
  facts: SipFacts;
  unit: FactsUnit;
  /** "You started this for Home down payment · Mar 2031 · 7 of 60 paid · Rs 14,000 put in" */
  goalLine: string;
  goalKind: string | null;
  status: SipStatus;
  stoppedOn: string | null;
  minSip: number;
  /** Due dates already paid, skipped or paused. */
  handled: Set<string>;
  /** Skipped and paused due dates, oldest first, with how they were marked. */
  marked: { date: string; kind: 'skipped' | 'paused' }[];
  paid: { date: string; amount: number }[];
}

/** This investor's SIP, or null when it does not exist or is someone else's. */
export async function loadSip(db: Db, investorId: string, sipId: number, today: string): Promise<SipState | null> {
  if (!Number.isInteger(sipId) || sipId < 1) return null;
  const lookup = await retrieveFacts(db, investorId, sipId, today);
  if (lookup.status === 'not_found') return null;

  const [row] = (
    await db.query<{ min_sip: number; goal_kind: string | null; stopped_on: string | null }>(
      `SELECT f.min_sip, g.kind AS goal_kind,
         (SELECT (e.created_at AT TIME ZONE 'Asia/Kolkata')::date::text FROM sip_events e
          WHERE e.sip_id = s.id AND e.kind = 'cancelled' ORDER BY e.id LIMIT 1) AS stopped_on
       FROM sips s JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.id = $1 AND s.investor_id = $2`,
      [sipId, investorId],
    )
  ).rows;
  const marked = (
    await db.query<{ kind: 'skipped' | 'paused'; detail: { due_on?: string; due_dates?: string[] } }>(
      "SELECT kind, detail FROM sip_events WHERE sip_id = $1 AND kind IN ('skipped', 'paused') ORDER BY id",
      [sipId],
    )
  ).rows
    .flatMap((e) => (e.kind === 'paused' ? (e.detail.due_dates ?? []) : e.detail.due_on ? [e.detail.due_on] : []).map((date) => ({ date, kind: e.kind })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const paid = (
    await db.query<{ date: string; amount: number }>(
      'SELECT due_on::text AS date, amount FROM instalments WHERE sip_id = $1 AND paid_on IS NOT NULL ORDER BY due_on',
      [sipId],
    )
  ).rows;

  const pausedAhead = marked.some((m) => m.kind === 'paused' && m.date >= today);
  return {
    facts: lookup.facts,
    unit: lookup.unit,
    goalLine: lookup.goalLine,
    goalKind: row.goal_kind,
    status: lookup.status === 'stopped' ? 'stopped' : pausedAhead ? 'paused' : 'active',
    stoppedOn: row.stopped_on,
    minSip: row.min_sip,
    handled: new Set([...paid.map((p) => p.date), ...marked.map((m) => m.date)]),
    marked,
    paid,
  };
}

/** The next `count` instalment dates still to be taken, from the next one on. */
export function upcomingDueDates(state: SipState, count: number): string[] {
  const dates: string[] = [];
  let date = state.facts.next_due_date;
  while (date && dates.length < count) {
    if (!state.handled.has(date)) dates.push(date);
    date = addMonths(date, 1);
  }
  return dates;
}

export interface SipView {
  id: number;
  fund: string;
  category: string;
  /** '₹2,000 a month' */
  amount: string;
  status: SipStatus;
  statusLabel: string;
  /** What is marked ahead, or what a stop means. */
  notes: string[];
  /** 'This SIP is for Home down payment · by Mar 2031 · 53 instalments to go', or 'No goal yet'. */
  goalHeader: string;
  hasGoal: boolean;
  goalLine: string;
  asOf: string;
  putIn: string;
  value: string;
  change: Change | null;
  /** '7 instalments paid · 1 skipped' */
  paidLabel: string;
  worstFall: string | null;
  nextDue: string | null;
  controls: { skip: boolean; pause: boolean; amount: boolean; stop: boolean };
  /** "What does this dip mean for my goal?": once something is put in and the SIP is not stopped. */
  explainDip: boolean;
  /** 'Skip the 2 Nov 2026 instalment' */
  skipLabel: string | null;
  pauseChoices: { count: number; label: string }[];
  amountNow: number;
  minAmount: number;
  maxAmount: number;
  /** 'From ₹500 to ₹1,00,000' */
  amountRange: string;
  history: { date: string; amount: string; label: string }[];
}

export const MAX_AMOUNT = 100_000;

export function sipView(state: SipState, today: string): SipView {
  const { facts } = state;
  const ahead = upcomingDueDates(state, 3);
  const active = state.status === 'active';
  const notes: string[] = [];
  if (state.status === 'stopped') {
    notes.push(
      `Stopped${state.stoppedOn ? ` on ${dayMonthYear(state.stoppedOn)}` : ''}. No more instalments will be taken. Your units stay invested until you redeem them.`,
    );
  } else {
    const paused = state.marked.filter((m) => m.kind === 'paused' && m.date >= today).map((m) => dayMonthYear(m.date));
    const skipped = state.marked.filter((m) => m.kind === 'skipped' && m.date >= today).map((m) => dayMonthYear(m.date));
    if (paused.length) notes.push(`Paused: ${joinAnd(paused)} will be skipped.${facts.next_due_date ? ` Instalments start again on ${dayMonthYear(facts.next_due_date)}.` : ''}`);
    if (skipped.length) notes.push(`${joinAnd(skipped)} will be skipped.`);
  }

  return {
    id: facts.sip_id,
    fund: facts.fund_name,
    category: facts.fund_category,
    amount: `${inr(facts.amount)} a month`,
    status: state.status,
    statusLabel: { active: 'Active', paused: 'Paused', stopped: 'Stopped' }[state.status],
    notes,
    goalHeader: goalHeader(facts, today),
    hasGoal: facts.goal !== null,
    goalLine: state.goalLine,
    asOf: `Numbers as of ${dayMonthYear(facts.as_of)}`,
    putIn: inr(facts.invested),
    value: inr(facts.current_value),
    change: changeOf([facts]),
    paidLabel: `${facts.instalments_paid} ${facts.instalments_paid === 1 ? 'instalment' : 'instalments'} paid · ${facts.instalments_skipped} skipped`,
    worstFall: facts.worst_fall_since_start_pct !== null ? percent(facts.worst_fall_since_start_pct) : null,
    nextDue: facts.next_due_date ? dayMonthYear(facts.next_due_date) : null,
    controls: { skip: active && ahead.length > 0, pause: active && ahead.length > 0, amount: state.status !== 'stopped', stop: state.status !== 'stopped' },
    explainDip: state.status !== 'stopped' && facts.instalments_paid > 0,
    skipLabel: ahead[0] ? `Skip the ${dayMonthYear(ahead[0])} instalment` : null,
    pauseChoices: ahead.map((date, i) => ({
      count: i + 1,
      label: i === 0 ? `1 instalment (${dayMonthYear(date)})` : `${i + 1} instalments (${dayMonthYear(ahead[0])} to ${dayMonthYear(date)})`,
    })),
    amountNow: facts.amount,
    minAmount: state.minSip,
    maxAmount: MAX_AMOUNT,
    amountRange: `From ${inr(state.minSip)} to ${inr(MAX_AMOUNT)}`,
    history: [
      ...state.paid.map((p) => ({ date: p.date, amount: inr(p.amount), label: 'Paid' })),
      ...state.marked.map((m) => ({
        date: m.date,
        amount: '',
        label: `${m.date >= today ? 'Will be skipped' : 'Skipped'}${m.kind === 'paused' ? ' (paused)' : ''}`,
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((h) => ({ ...h, date: dayMonthYear(h.date) })),
  };
}

/** "By when?" picks, as 'YYYY-MM' in this month of a later year (spec §2A: next year, +5, +10, or pick a year). */
export function goalYearChoices(today: string, current: string | null) {
  const at = (years: number) => addMonths(monthStart(today), years * 12).slice(0, 7);
  const label = (value: string) => monthYear(`${value}-01`);
  const quickYears = [
    { value: at(1), label: `Next year · ${label(at(1))}` },
    { value: at(5), label: `In 5 years · ${label(at(5))}` },
    { value: at(10), label: `In 10 years · ${label(at(10))}` },
  ];
  const allYears = Array.from({ length: 40 }, (_, i) => ({ value: at(i + 1), label: label(at(i + 1)) }));
  // A goal set for another month keeps it as a choice, so editing the name never moves the date.
  if (current && !allYears.some((y) => y.value === current)) allYears.unshift({ value: current, label: `${label(current)} (current)` });
  return { quickYears, allYears };
}

/** The SIPs tab: one row per SIP, with its goal (or "Add a goal") and what can be done to it. */
export async function sipList(db: Db, investorId: string, today: string) {
  const { rows } = await db.query<{ id: number; day_of_month: number }>('SELECT id, day_of_month FROM sips WHERE investor_id = $1 ORDER BY id', [investorId]);
  const states = await Promise.all(rows.map((r) => loadSip(db, investorId, r.id, today)));
  return states.flatMap((state, i) => {
    if (!state) return [];
    const { facts } = state;
    const view = sipView(state, today);
    return [
      {
        id: facts.sip_id,
        fund: facts.fund_name,
        amount: inr(facts.amount),
        date: `Monthly on ${ordinal(rows[i].day_of_month)}`,
        next: state.status === 'stopped' ? 'Stopped' : facts.next_due_date ? dayMonthYear(facts.next_due_date) : 'None due',
        status: state.status,
        statusLabel: view.statusLabel,
        goal: facts.goal ? `${facts.goal.name}${facts.goal.target_month ? ` · by ${monthYear(facts.goal.target_month)}` : ''}` : null,
        canPause: view.controls.pause,
        canStop: view.controls.stop,
      },
    ];
  });
}

function goalHeader(facts: SipFacts, today: string): string {
  if (!facts.goal) return 'No goal yet';
  const parts = [`This SIP is for ${facts.goal.name}`];
  if (!facts.goal.target_month) return [...parts, 'no target date'].join(' · ');
  parts.push(`by ${monthYear(facts.goal.target_month)}`);
  if (monthsBetween(today, facts.goal.target_month) < 0) parts.push('goal date reached');
  else if (facts.instalments_planned !== null && facts.next_due_date) {
    const toGo = Math.max(0, facts.instalments_planned - facts.instalments_paid - facts.instalments_skipped);
    parts.push(`${toGo} ${toGo === 1 ? 'instalment' : 'instalments'} to go`);
  }
  return parts.join(' · ');
}

/** 'a', 'a and b', 'a, b and c'. */
export function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
