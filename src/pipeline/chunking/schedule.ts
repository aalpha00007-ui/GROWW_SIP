// One source of truth for a SIP's schedule. The goal card, the SIP page, the dashboard, the notifications, the
// history summary, the Orders page and the AI's facts all read this, and none of them counts on its own, so no two
// screens can disagree and the AI can't disagree with the screen.
//
// It works on real dates, never on "planned - paid - skipped": a skip after the goal date, or a due date that passed
// unpaid, would make that subtraction wrong. Every due date up to the goal date lands in exactly one bucket:
//   paid + past skips + scheduled skips + not collected + remaining = every due date
// (a scheduled skip after the goal date is still a scheduled skip, but is not one of those due dates).
import { addDays, addMonths, firstDueDate, monthStart } from '../loading/dates';
import { monthsBetween } from './format';

export type MarkKind = 'skipped' | 'paused';

export interface MarkedDate {
  date: string;
  kind: MarkKind;
}

export interface MarkEvent {
  kind: string;
  detail: { due_on?: string; due_dates?: string[] };
}

/**
 * The due dates skipped or paused, oldest first, from the SIP's events in the order they happened. Skip next marks
 * one date and Pause the next 1 to 3; Undo (skip_undone) and Resume now (resumed) take dates back off.
 */
export function markedDates(events: MarkEvent[]): MarkedDate[] {
  const marks = new Map<string, MarkKind>();
  for (const { kind, detail } of events) {
    if (kind === 'skipped' && detail.due_on) marks.set(detail.due_on, 'skipped');
    if (kind === 'paused') for (const date of detail.due_dates ?? []) marks.set(date, 'paused');
    if (kind === 'skip_undone' && detail.due_on) marks.delete(detail.due_on);
    if (kind === 'resumed') for (const date of detail.due_dates ?? []) marks.delete(date);
  }
  return [...marks].map(([date, kind]) => ({ date, kind })).sort((a, b) => a.date.localeCompare(b.date));
}

export interface PaidInstalment {
  /** Null only in hand-made test data. */
  id?: number;
  /** The due date it covers. */
  due: string;
  /** When it was paid: a new SIP's first instalment is paid at the start, before its due date. */
  paidOn: string;
  amount: number;
}

export interface ScheduleInput {
  startedOn: string;
  dayOfMonth: number;
  today: string;
  /** The instalment now, in rupees: what each instalment still to come will take. */
  amount: number;
  stopped: boolean;
  stoppedOn?: string | null;
  /** The goal's target month as 'YYYY-MM-01'; null without a goal or a date. */
  goalMonth: string | null;
  paid: PaidInstalment[];
  marked: MarkedDate[];
}

/** paid, a past skip, a skip still ahead, or a due date that passed with neither a payment nor a skip. */
export type RowState = 'paid' | 'skipped' | 'scheduled_skip' | 'not_collected';

export interface ScheduleRow {
  /** The date to show: when it was paid, or the due date. */
  date: string;
  due: string;
  state: RowState;
  /** Paid: what was paid. Scheduled skip: what it would have taken. Null otherwise: it isn't recorded. */
  amount: number | null;
  paused: boolean;
  /** The instalment's id, for a paid row. */
  id?: number;
}

export interface SipSchedule {
  paid: number;
  /** Skips whose due date has passed. Scheduled skips are never counted here. */
  pastSkipped: number;
  /** Skips still ahead, today's included. A stopped SIP has none: nothing more is due. */
  scheduledSkips: number;
  /** Due dates that passed with no payment and no skip: the demo doesn't collect instalments on its own. */
  notCollected: number;
  /** Payable instalments left up to the goal date; null with no goal date. */
  remaining: number | null;
  /** paid + remaining: the instalments this plan really pays. Null with no goal date. */
  plannedPayable: number | null;
  nextDue: string | null;
  /** The next few payable dates, nearest first: what Skip next and Pause work on. */
  upcoming: string[];
  /** 'YYYY-MM-01', or null. */
  goalDate: string | null;
  goalDatePassed: boolean;
  /** A goal date still ahead on a SIP that isn't stopped: only then do "of N" and "to go" mean anything. */
  hasPlan: boolean;
  /** Rupees put in. Contribution progress is putIn of plannedPutIn. */
  putIn: number;
  /** putIn plus what the remaining instalments will put in; null with no goal date. Never a value forecast. */
  plannedPutIn: number | null;
  /** putIn / plannedPutIn from 0 to 1, or null. Says nothing about whether the goal's target is reached. */
  contribution: number | null;
  /** True while a pause still has dates ahead. */
  paused: boolean;
  /** The next payable date if a pause ended now, or null when not paused. */
  resumeDate: string | null;
  firstPaid: PaidInstalment | null;
  lastPaid: PaidInstalment | null;
  /** Every dated row, newest first: the history summary and the Orders page. */
  rows: ScheduleRow[];
}

/** How many payable dates `upcoming` holds: a pause of 3, and the date instalments start again. */
const UPCOMING = 4;

export function sipSchedule(input: ScheduleInput): SipSchedule {
  const { today, stopped, amount } = input;
  const paidDates = new Set(input.paid.map((p) => p.due));
  const cutoff = stopped ? (input.stoppedOn ?? today) : null;
  // Once stopped, nothing is due after the stop date, so a skip marked for after it never happens.
  const marks = input.marked.filter((m) => cutoff === null || m.date < cutoff);
  const marked = new Map(marks.map((m) => [m.date, m.kind]));
  const first = firstDueDate(input.startedOn, input.dayOfMonth);
  const open = (date: string) => !paidDates.has(date) && !marked.has(date);

  const notCollected: string[] = [];
  let date = first;
  for (; date < today; date = addMonths(date, 1)) {
    if (open(date) && (cutoff === null || date < cutoff)) notCollected.push(date);
  }
  // `date` is now the first due date on or after today.

  const upcoming: string[] = [];
  if (!stopped) {
    for (let d = date; upcoming.length < UPCOMING; d = addMonths(d, 1)) if (open(d)) upcoming.push(d);
  }

  const goalDate = input.goalMonth;
  const goalEnd = goalDate ? addDays(addMonths(monthStart(goalDate), 1), -1) : null;
  let remaining: number | null = null;
  if (goalEnd !== null) {
    remaining = 0;
    if (!stopped) for (let d = date; d <= goalEnd; d = addMonths(d, 1)) if (open(d)) remaining += 1;
  }

  const putIn = input.paid.reduce((total, p) => total + p.amount, 0);
  const plannedPutIn = remaining === null ? null : putIn + remaining * amount;
  const goalDatePassed = goalDate !== null && monthsBetween(today, goalDate) < 0;
  const paused = marks.some((m) => m.kind === 'paused' && m.date >= today);
  const byPaidOn = [...input.paid].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.due.localeCompare(b.due));

  const rows: ScheduleRow[] = [
    ...input.paid.map((p) => ({ date: p.paidOn, due: p.due, state: 'paid' as const, amount: p.amount, paused: false, id: p.id })),
    ...marks.map((m) => {
      const ahead = m.date >= today;
      return { date: m.date, due: m.date, state: ahead ? ('scheduled_skip' as const) : ('skipped' as const), amount: ahead ? amount : null, paused: m.kind === 'paused' };
    }),
    ...notCollected.map((d) => ({ date: d, due: d, state: 'not_collected' as const, amount: null, paused: false })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.due.localeCompare(a.due));

  // Resuming gives back only what the pause took: a date on its own Skip next stays skipped.
  let resumeDate: string | null = null;
  if (paused) {
    let d = date;
    while (paidDates.has(d) || marked.get(d) === 'skipped') d = addMonths(d, 1);
    resumeDate = d;
  }

  return {
    paid: input.paid.length,
    pastSkipped: marks.filter((m) => m.date < today).length,
    scheduledSkips: marks.filter((m) => m.date >= today).length,
    notCollected: notCollected.length,
    remaining,
    plannedPayable: remaining === null ? null : input.paid.length + remaining,
    nextDue: upcoming[0] ?? null,
    upcoming,
    goalDate,
    goalDatePassed,
    hasPlan: goalDate !== null && !goalDatePassed && !stopped,
    putIn,
    plannedPutIn,
    contribution: plannedPutIn ? putIn / plannedPutIn : null,
    paused,
    resumeDate,
    firstPaid: byPaidOn[0] ?? null,
    lastPaid: byPaidOn[byPaidOn.length - 1] ?? null,
    rows,
  };
}

/** Several SIPs on one goal, counted as one plan. A stopped SIP counts what it paid, and plans nothing more. */
export function combineSchedules(all: SipSchedule[]) {
  const sum = (value: (s: SipSchedule) => number) => all.reduce((total, s) => total + value(s), 0);
  const hasPlan = all.some((s) => s.hasPlan);
  return {
    paid: sum((s) => s.paid),
    pastSkipped: sum((s) => s.pastSkipped),
    scheduledSkips: sum((s) => s.scheduledSkips),
    notCollected: sum((s) => s.notCollected),
    remaining: hasPlan ? sum((s) => s.remaining ?? 0) : null,
    plannedPayable: hasPlan ? sum((s) => s.plannedPayable ?? 0) : null,
    putIn: sum((s) => s.putIn),
    plannedPutIn: hasPlan ? sum((s) => s.plannedPutIn ?? 0) : null,
    hasPlan,
  };
}

type Counts = Pick<SipSchedule, 'paid' | 'pastSkipped' | 'scheduledSkips' | 'remaining' | 'plannedPayable' | 'hasPlan'>;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** '1 of 10 instalments paid', or '4 instalments paid' when there is no plan to count against. */
export function paidLabel(s: Counts): string {
  return s.hasPlan ? `${s.paid} of ${s.plannedPayable} instalments paid` : `${count(s.paid, 'instalment', 'instalments')} paid`;
}

/** '9 instalments to go', or null when there is no plan. */
export function toGoLabel(s: Counts): string | null {
  return s.hasPlan ? `${count(s.remaining ?? 0, 'instalment', 'instalments')} to go` : null;
}

/** '0 past skips · 3 scheduled skips': a skip still ahead is never told as one already made. */
export function skipsLabel(s: Counts): string {
  return `${count(s.pastSkipped, 'past skip', 'past skips')} · ${count(s.scheduledSkips, 'scheduled skip', 'scheduled skips')}`;
}
