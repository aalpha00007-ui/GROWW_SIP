// What the investor can do to a SIP (PRD F5, F7): skip, pause, change the amount, stop, set the goal.
// Each one is a fact in sip_events; nothing stores a status or a total. Errors are plain English.
import type { Db } from '../db/client';
import { dayMonthYear, monthYear } from '../pipeline/chunking/format';
import { inr } from './money';
import { addMonths, isIsoDate, monthStart } from '../pipeline/loading/dates';
import { findPii } from '../pipeline/retrieval/pii';
import { goalYearChoices, joinAnd, loadSip, MAX_AMOUNT, upcomingDueDates, type SipState } from './sip';

export type ActionResult = { status: 200; message: string } | { status: 400 | 404; error: string };

const NOT_FOUND = { status: 404, error: 'We could not find that SIP.' } as const;
const STOPPED = { status: 400, error: 'This SIP is already stopped.' } as const;
const PAUSED = { status: 400, error: 'This SIP is paused. Skip and pause work again once the pause ends.' } as const;

/** Skip next: the next instalment is not taken; the SIP carries on after it. */
export async function skipNext(db: Db, investorId: string, sipId: number, today: string): Promise<ActionResult> {
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return NOT_FOUND;
  const blocked = notActive(sip);
  if (blocked) return blocked;
  const [skip, after] = upcomingDueDates(sip, 2);
  await db.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'skipped', $2)", [sipId, { due_on: skip }]);
  return { status: 200, message: `Skipped the ${dayMonthYear(skip)} instalment.${after ? ` The next one is on ${dayMonthYear(after)}.` : ''}` };
}

/** Pause: skip the next 1 to 3 instalments in one go (build spec §2E). */
export async function pauseSip(db: Db, investorId: string, sipId: number, count: unknown, today: string): Promise<ActionResult> {
  if (count !== 1 && count !== 2 && count !== 3) return { status: 400, error: 'Pause for 1, 2 or 3 instalments.' };
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return NOT_FOUND;
  const blocked = notActive(sip);
  if (blocked) return blocked;
  const dates = upcomingDueDates(sip, count + 1);
  const paused = dates.slice(0, count);
  await db.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'paused', $2)", [sipId, { count, due_dates: paused }]);
  const restart = dates[count];
  return {
    status: 200,
    message: `Paused: ${joinAnd(paused.map(dayMonthYear))} will be skipped.${restart ? ` Instalments start again on ${dayMonthYear(restart)}.` : ''}`,
  };
}

/** Change amount: from the next instalment on. Lowering is one of the options at Before you stop. */
export async function changeAmount(db: Db, investorId: string, sipId: number, amount: unknown, today: string): Promise<ActionResult> {
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return NOT_FOUND;
  if (sip.status === 'stopped') return STOPPED;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < sip.minSip || amount > MAX_AMOUNT) {
    return { status: 400, error: `Enter a whole amount from ${inr(sip.minSip)} to ${inr(MAX_AMOUNT)}.` };
  }
  if (amount === sip.facts.amount) return { status: 400, error: `Your SIP is already ${inr(amount)} a month.` };
  await db.transaction(async (tx) => {
    await tx.query('UPDATE sips SET amount = $2 WHERE id = $1', [sipId, amount]);
    await tx.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'amount_changed', $2)", [sipId, { from: sip.facts.amount, to: amount }]);
  });
  const next = sip.facts.next_due_date;
  return { status: 200, message: `Your SIP is now ${inr(amount)} a month${next ? `, from the ${dayMonthYear(next)} instalment` : ''}.` };
}

/**
 * Stop (the UI says "Stop anyway"): no more instalments. Units stay invested. One tap, never blocked
 * by the check-in (PRD §3.4); an aiCheckId records that the investor chose it after the card.
 */
export async function stopSip(db: Db, investorId: string, sipId: number, aiCheckId: unknown, today: string): Promise<ActionResult> {
  if (aiCheckId !== undefined && aiCheckId !== null && !Number.isInteger(aiCheckId)) return { status: 400, error: 'That check-in id is not valid.' };
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return NOT_FOUND;
  if (sip.status === 'stopped') return STOPPED;
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'cancelled', $2)", [sipId, aiCheckId ? { ai_check_id: aiCheckId } : {}]);
    if (aiCheckId) {
      await tx.query("UPDATE ai_checks SET user_choice = 'cancel' WHERE id = $1 AND investor_id = $2 AND sip_id = $3", [aiCheckId, investorId, sipId]);
    }
  });
  return { status: 200, message: 'Your SIP is stopped. No more instalments will be taken. Your units stay invested until you redeem them.' };
}

export const GOAL_KINDS = [
  { kind: 'home', label: 'Home' },
  { kind: 'education', label: 'Education' },
  { kind: 'retirement', label: 'Retirement' },
  { kind: 'emergency', label: 'Emergency fund' },
  { kind: 'custom', label: 'Something else' },
] as const;
export const GOAL_NAME_MAX = 40;
const MAX_YEARS_AHEAD = 50;

/** What the goal chips offer: the kinds, the name limit and the "By when?" years. */
export function goalOptions(today: string, currentTarget: string | null) {
  return { kinds: GOAL_KINDS.map((k) => ({ kind: k.kind, label: k.label })), nameMax: GOAL_NAME_MAX, ...goalYearChoices(today, currentTarget) };
}

export interface GoalInput {
  kind: string;
  name: string;
  /** 'YYYY-MM-01', or null for no target month. */
  target: string | null;
}

/**
 * Checks a goal from the chips (spec §2A), for the SIP box and the goal page alike. kind 'none' ("Not
 * sure yet") or no goal at all reads as null. `keep` is the goal now: the same kind keeps its own name.
 */
export function parseGoal(
  input: unknown,
  ctx: { today: string; firstDue: string; keep?: { kind: string; name: string } | null },
): { ok: true; goal: GoalInput | null } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, goal: null };
  const body = input as { kind?: unknown; name?: unknown; targetMonth?: unknown };
  if (body.kind === 'none') return { ok: true, goal: null };

  const choice = GOAL_KINDS.find((k) => k.kind === body.kind);
  if (!choice) return { ok: false, error: 'Choose what this money is for.' };
  // Same kind as now keeps the goal's own name ("Home down payment"); a new kind takes the chip's.
  let name: string = ctx.keep?.kind === choice.kind ? ctx.keep.name : choice.label;
  if (choice.kind === 'custom') {
    name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > GOAL_NAME_MAX) return { ok: false, error: `Name the goal in 1 to ${GOAL_NAME_MAX} characters.` };
    if (findPii(name).found.length > 0) return { ok: false, error: "Please don't put personal details in a goal name." };
  }

  let target: string | null = null;
  if (body.targetMonth !== undefined && body.targetMonth !== null) {
    const first = typeof body.targetMonth === 'string' ? `${body.targetMonth}-01` : '';
    const latest = addMonths(monthStart(ctx.today), MAX_YEARS_AHEAD * 12);
    // The target must come after the first instalment and not be in the past.
    if (!isIsoDate(first) || first <= monthStart(ctx.today) || first <= monthStart(ctx.firstDue) || first > latest) {
      return { ok: false, error: `Pick a target month from next month up to ${MAX_YEARS_AHEAD} years ahead.` };
    }
    target = first;
  }
  return { ok: true, goal: { kind: choice.kind, name, target } };
}

/** Set, change or remove the goal. A goal is a new row, so a goal shared with another SIP stays as it is for that SIP. */
export async function setGoal(db: Db, investorId: string, sipId: number, input: unknown, today: string): Promise<ActionResult> {
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return NOT_FOUND;
  const keep = sip.goalKind && sip.facts.goal ? { kind: sip.goalKind, name: sip.facts.goal.name } : null;
  const parsed = parseGoal(input ?? {}, { today, firstDue: sip.paid[0]?.date ?? sip.facts.next_due_date ?? today, keep });
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const { goal } = parsed;
  const before = (await db.query<{ goal_id: number | null }>('SELECT goal_id FROM sips WHERE id = $1', [sipId])).rows[0].goal_id;

  await db.transaction(async (tx) => {
    const goalId = goal ? await insertGoal(tx, investorId, goal) : null;
    await tx.query('UPDATE sips SET goal_id = $2 WHERE id = $1', [sipId, goalId]);
    await tx.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'goal_changed', $2)", [sipId, { from_goal_id: before, to_goal_id: goalId }]);
  });
  if (!goal) return { status: 200, message: 'Goal removed. You can add one any time.' };
  return { status: 200, message: `Saved: this SIP is for ${goal.name}${goal.target ? `, by ${monthYear(goal.target)}` : ''}.` };
}

export async function insertGoal(db: Db, investorId: string, goal: GoalInput): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO goals (investor_id, kind, name, target_month) VALUES ($1, $2, $3, $4) RETURNING id',
    [investorId, goal.kind, goal.name, goal.target],
  );
  return rows[0].id;
}

function notActive(sip: SipState): ActionResult | null {
  if (sip.status === 'stopped') return STOPPED;
  if (sip.status === 'paused') return PAUSED;
  if (upcomingDueDates(sip, 1).length === 0) return { status: 400, error: 'There is no instalment ahead to skip.' };
  return null;
}
