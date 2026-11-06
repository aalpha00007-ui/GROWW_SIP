// One SIP for its page (PRD F5), Before you stop (F7) and the actions on it. Facts come from
// retrieveFacts; the SIP's status is computed from sip_events, never stored (build spec §5).
import type { Db } from '../db/client';
import type { FactsUnit, SipFacts } from '../pipeline/chunking/facts';
import { dayMonthYear, monthYear, ordinal, percent } from '../pipeline/chunking/format';
import { paidLabel, skipsLabel, toGoLabel, type RowState, type SipSchedule } from '../pipeline/chunking/schedule';
import { inr } from './money';
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
  /** The one source of every count, date and history row (pipeline/chunking/schedule.ts). */
  schedule: SipSchedule;
}

/** This investor's SIP, or null when it does not exist or is someone else's. */
export async function loadSip(db: Db, investorId: string, sipId: number, today: string): Promise<SipState | null> {
  if (!Number.isInteger(sipId) || sipId < 1) return null;
  const lookup = await retrieveFacts(db, investorId, sipId, today);
  if (lookup.status === 'not_found') return null;

  const [row] = (
    await db.query<{ min_sip: number; goal_kind: string | null }>(
      `SELECT f.min_sip, g.kind AS goal_kind
       FROM sips s JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.id = $1 AND s.investor_id = $2`,
      [sipId, investorId],
    )
  ).rows;
  return {
    facts: lookup.facts,
    unit: lookup.unit,
    goalLine: lookup.goalLine,
    goalKind: row.goal_kind,
    status: lookup.status === 'stopped' ? 'stopped' : lookup.schedule.paused ? 'paused' : 'active',
    stoppedOn: lookup.stoppedOn,
    minSip: row.min_sip,
    schedule: lookup.schedule,
  };
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
  /** '1 of 10 instalments paid · 9 instalments to go', the same words as the goal card. */
  paidLabel: string;
  /** '0 past skips · 3 scheduled skips' */
  skipsLabel: string;
  /** '₹1,000 of ₹5,500 planned': contribution progress, which says nothing about reaching a target. Null without a plan. */
  contribution: string | null;
  worstFall: string | null;
  nextDue: string | null;
  controls: { skip: boolean; pause: boolean; amount: boolean; stop: boolean };
  /** "What does this dip mean for my goal?": only while the SIP is worth less than was put in, and not stopped. */
  explainDip: boolean;
  /** 'Skip the 2 Nov 2026 instalment' */
  skipLabel: string | null;
  pauseChoices: { count: number; label: string }[];
  /**
   * Under each option at Before you stop: what it does, in one fixed line from the approved explainers
   * (data/raw/explainers), with this SIP's own date, minimum and value. Plain code, never the AI.
   */
  optionNotes: Record<'skip' | 'lower' | 'pause' | 'keep' | 'cancel', string>;
  amountNow: number;
  minAmount: number;
  maxAmount: number;
  /** 'From ₹500 to ₹1,00,000' */
  amountRange: string;
  history: { date: string; amount: string; label: string; state: RowState }[];
}

export const MAX_AMOUNT = 100_000;

/** The same words in a SIP's history and on the Orders page. */
export const ROW_LABELS: Record<RowState, string> = {
  paid: 'Paid',
  skipped: 'Skipped',
  scheduled_skip: 'Scheduled skip',
  not_collected: 'Not collected',
};

export function sipView(state: SipState, today: string): SipView {
  const { facts, schedule } = state;
  const ahead = schedule.upcoming.slice(0, 3);
  const active = state.status === 'active';
  const notes: string[] = [];
  if (state.status === 'stopped') {
    notes.push(
      `Stopped${state.stoppedOn ? ` on ${dayMonthYear(state.stoppedOn)}` : ''}. No more instalments will be taken. Your units stay invested until you redeem them.`,
    );
  } else {
    const scheduled = schedule.rows.filter((r) => r.state === 'scheduled_skip').reverse();
    const paused = scheduled.filter((r) => r.paused).map((r) => dayMonthYear(r.due));
    const skipped = scheduled.filter((r) => !r.paused).map((r) => dayMonthYear(r.due));
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
    goalHeader: goalHeader(facts, schedule),
    hasGoal: facts.goal !== null,
    goalLine: state.goalLine,
    asOf: `Numbers as of ${dayMonthYear(facts.as_of)}`,
    putIn: inr(facts.invested),
    value: inr(facts.current_value),
    change: changeOf([facts]),
    paidLabel: [paidLabel(schedule), toGoLabel(schedule)].filter(Boolean).join(' · '),
    skipsLabel: skipsLabel(schedule),
    contribution: schedule.hasPlan && schedule.plannedPutIn !== null ? `${inr(schedule.putIn)} of ${inr(schedule.plannedPutIn)} planned` : null,
    worstFall: facts.worst_fall_since_start_pct !== null ? percent(facts.worst_fall_since_start_pct) : null,
    nextDue: facts.next_due_date ? dayMonthYear(facts.next_due_date) : null,
    controls: { skip: active && ahead.length > 0, pause: active && ahead.length > 0, amount: state.status !== 'stopped', stop: state.status !== 'stopped' },
    explainDip: state.status !== 'stopped' && facts.instalments_paid > 0 && Math.round(facts.current_value) < facts.invested,
    skipLabel: ahead[0] ? `Skip the ${dayMonthYear(ahead[0])} instalment` : null,
    pauseChoices: ahead.map((date, i) => ({
      count: i + 1,
      label: i === 0 ? `1 instalment (${dayMonthYear(date)})` : `${i + 1} instalments (${dayMonthYear(ahead[0])} to ${dayMonthYear(date)})`,
    })),
    optionNotes: {
      skip: ahead[0] ? `Misses the ${dayMonthYear(ahead[0])} instalment only. The SIP stays active.` : 'Misses the next instalment only. The SIP stays active.',
      lower: `Future instalments take less, down to ${inr(state.minSip)}. Your units stay invested.`,
      pause: 'Skips the next 1 to 3 instalments, then restarts on its own.',
      keep: 'Nothing changes.',
      cancel:
        facts.instalments_paid > 0
          ? `Ends future instalments. Gives no money back and sells no units: your ${inr(facts.current_value)} stays invested until you redeem it.`
          : 'Ends future instalments. Nothing has been put in yet.',
    },
    amountNow: facts.amount,
    minAmount: state.minSip,
    maxAmount: MAX_AMOUNT,
    amountRange: `From ${inr(state.minSip)} to ${inr(MAX_AMOUNT)}`,
    history: schedule.rows.map((r) => ({
      date: dayMonthYear(r.date),
      amount: r.state === 'paid' && r.amount !== null ? inr(r.amount) : '',
      label: `${ROW_LABELS[r.state]}${r.paused ? ' (paused)' : ''}`,
      state: r.state,
    })),
  };
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

function goalHeader(facts: SipFacts, schedule: SipSchedule): string {
  if (!facts.goal) return 'No goal yet';
  const parts = [`This SIP is for ${facts.goal.name}`];
  const target = facts.goal.target_amount ? [`target ${inr(facts.goal.target_amount)}`] : [];
  if (!facts.goal.target_month) return [...parts, 'no target date', ...target].join(' · ');
  parts.push(`by ${monthYear(facts.goal.target_month)}`);
  if (schedule.goalDatePassed) parts.push('goal date reached');
  const toGo = toGoLabel(schedule);
  if (toGo) parts.push(toGo);
  return [...parts, ...target].join(' · ');
}

/** 'a', 'a and b', 'a, b and c'. */
export function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
