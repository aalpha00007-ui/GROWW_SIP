// What the investor can do to a SIP (PRD F5, F7): skip, pause, change the amount, stop, set the goal.
// Each one is a fact in sip_events; nothing stores a status or a total. Errors are plain English.
import type { Db } from '../db/client';
import { dayMonthYear, monthYear } from '../pipeline/chunking/format';
import { inr } from './money';
import { addMonths, isIsoDate, monthStart } from '../pipeline/loading/dates';
import { findPii } from '../pipeline/retrieval/pii';
import { logEvent } from './events';
import { joinAnd, loadSip, MAX_AMOUNT, type SipState } from './sip';

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
  const [skip, after] = sip.schedule.upcoming;
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
  const dates = sip.schedule.upcoming;
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
    // `on` is the demo date: the schedule works from it, not from the clock time the row was written.
    await tx.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'cancelled', $2)", [sipId, { on: today, ...(aiCheckId ? { ai_check_id: aiCheckId } : {}) }]);
    if (aiCheckId) {
      await tx.query("UPDATE ai_checks SET user_choice = 'cancel' WHERE id = $1 AND investor_id = $2 AND sip_id = $3", [aiCheckId, investorId, sipId]);
    }
    await logEvent(tx, investorId, 'sip_stopped', { sip_id: sipId, after_checkin: Boolean(aiCheckId) });
  });
  return { status: 200, message: 'Your SIP is stopped. No more instalments will be taken. Your units stay invested until you redeem them.' };
}

/**
 * The goal chips (brief phase 4). `key` is what the browser sends; `kind` is what goals.kind stores.
 * Wedding, Car and Travel are named goals of kind 'custom'; "Something else" takes free text in any language.
 */
export const GOAL_KINDS = [
  { key: 'retirement', kind: 'retirement', label: 'Retirement' },
  { key: 'education', kind: 'education', label: "Child's education" },
  { key: 'home', kind: 'home', label: 'Home down payment' },
  { key: 'emergency', kind: 'emergency', label: 'Emergency fund' },
  { key: 'wedding', kind: 'custom', label: 'Wedding' },
  { key: 'car', kind: 'custom', label: 'Car' },
  { key: 'travel', kind: 'custom', label: 'Travel' },
  { key: 'custom', kind: 'custom', label: 'Something else' },
] as const;
export const GOAL_NAME_MAX = 40;
const MAX_YEARS_AHEAD = 50;
/** The optional target amount, in whole rupees. */
export const TARGET_MIN = 1_000;
export const TARGET_MAX = 100_000_000;

/** The chip a stored goal shows as: its own kind, or the named chip a custom goal matches. */
export function goalKey(kind: string, name: string): string {
  return GOAL_KINDS.find((k) => k.kind === kind && (kind !== 'custom' || k.label === name))?.key ?? 'custom';
}

/** A SIP's saved goal as the goal editor's fields, or null without one: the page fills them all in. */
export function goalDraft(sip: SipState): { kind: string; name: string; month: string; year: string; targetAmount: string } | null {
  const goal = sip.facts.goal;
  if (!goal || !sip.goalKind) return null;
  const kind = goalKey(sip.goalKind, goal.name);
  const [year = '', month = ''] = goal.target_month?.split('-') ?? [];
  return { kind, name: kind === 'custom' ? goal.name : '', month, year, targetAmount: goal.target_amount ? String(goal.target_amount) : '' };
}

export interface GoalInput {
  kind: string;
  name: string;
  /** 'YYYY-MM-01', or null for no target month. */
  target: string | null;
  /** Whole rupees, or null when none was given. */
  targetAmount?: number | null;
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
  const body = input as { kind?: unknown; name?: unknown; targetMonth?: unknown; targetAmount?: unknown };
  if (body.kind === 'none') return { ok: true, goal: null };

  const choice = GOAL_KINDS.find((k) => k.key === body.kind);
  if (!choice) return { ok: false, error: 'Choose what this money is for.' };
  // Same kind as now keeps the goal's own name ("Home deposit"); a new kind takes the chip's.
  let name: string = ctx.keep?.kind === choice.kind && choice.kind !== 'custom' ? ctx.keep.name : choice.label;
  if (choice.key === 'custom') {
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
      const afterFirst = first > monthStart(ctx.today) && first <= latest && isIsoDate(first);
      return {
        ok: false,
        error: afterFirst ? `Pick a month after your first instalment in ${monthYear(ctx.firstDue)}.` : `Pick a month after this month, up to ${MAX_YEARS_AHEAD} years ahead.`,
      };
    }
    target = first;
  }

  let targetAmount: number | null = null;
  if (body.targetAmount !== undefined && body.targetAmount !== null) {
    const amount = body.targetAmount;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < TARGET_MIN || amount > TARGET_MAX) {
      return { ok: false, error: `Enter a target amount from ${inr(TARGET_MIN)} to ${inr(TARGET_MAX)}, or leave it empty.` };
    }
    targetAmount = amount;
  }
  return { ok: true, goal: { kind: choice.kind, name, target, targetAmount } };
}

/**
 * Set, change or remove the goal. A field left out of the request keeps what is saved, so changing the date alone can
 * never lose the target. A goal only this SIP uses is changed in place, which keeps any one-time money with it; a goal
 * shared with another SIP becomes a new row, so that SIP's goal stays as it is. goal_saved is logged only here, after
 * the save: opening the editor counts for nothing.
 */
export async function setGoal(db: Db, investorId: string, sipId: number, input: unknown, today: string): Promise<ActionResult> {
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return NOT_FOUND;
  const saved = sip.facts.goal;
  const keep = sip.goalKind && saved ? { kind: sip.goalKind, name: saved.name } : null;
  const body = (input ?? {}) as Record<string, unknown>;
  const merged = {
    ...body,
    targetMonth: 'targetMonth' in body ? body.targetMonth : (saved?.target_month?.slice(0, 7) ?? null),
    targetAmount: 'targetAmount' in body ? body.targetAmount : (saved?.target_amount ?? null),
  };
  const parsed = parseGoal(merged, { today, firstDue: sip.schedule.firstPaid?.due ?? sip.facts.next_due_date ?? today, keep });
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const { goal } = parsed;
  const before = (await db.query<{ goal_id: number | null }>('SELECT goal_id FROM sips WHERE id = $1', [sipId])).rows[0].goal_id;

  await db.transaction(async (tx) => {
    const shared =
      before !== null && (await tx.query('SELECT 1 FROM sips WHERE goal_id = $1 AND id <> $2 LIMIT 1', [before, sipId])).rows.length > 0;
    let goalId: number | null = null;
    if (goal && before !== null && !shared) {
      await tx.query('UPDATE goals SET kind = $2, name = $3, target_month = $4, target_amount = $5 WHERE id = $1', [before, goal.kind, goal.name, goal.target, goal.targetAmount ?? null]);
      goalId = before;
    } else if (goal) {
      goalId = await insertGoal(tx, investorId, goal);
    }
    await tx.query('UPDATE sips SET goal_id = $2 WHERE id = $1', [sipId, goalId]);
    await tx.query("INSERT INTO sip_events (sip_id, kind, detail) VALUES ($1, 'goal_changed', $2)", [sipId, { from_goal_id: before, to_goal_id: goalId }]);
    if (goal) await logEvent(tx, investorId, 'goal_saved', { sip_id: sipId, where: 'edit', kind: goal.kind });
  });
  if (!goal) return { status: 200, message: 'Goal removed. You can add one any time.' };
  return { status: 200, message: `Saved: this SIP is for ${goal.name}${goal.target ? `, by ${monthYear(goal.target)}` : ''}.` };
}

/**
 * A one-time investment's goal: one of the investor's own goals ({goalId}), a new goal from the goal step's
 * chips, or none. A new goal's month only has to come after this month: no instalments are to come.
 */
export async function oneTimeGoal(
  db: Db,
  investorId: string,
  input: unknown,
  today: string,
): Promise<{ ok: true; goalId: number | null; create: GoalInput | null; name: string | null } | { ok: false; error: string }> {
  if (input === undefined || input === null) return { ok: true, goalId: null, create: null, name: null };
  const { goalId } = input as { goalId?: unknown };
  if (goalId !== undefined) {
    const [found] = Number.isInteger(goalId)
      ? (await db.query<{ name: string }>('SELECT name FROM goals WHERE id = $1 AND investor_id = $2', [goalId, investorId])).rows
      : [];
    return found ? { ok: true, goalId: goalId as number, create: null, name: found.name } : { ok: false, error: 'We could not find that goal.' };
  }
  const parsed = parseGoal(input, { today, firstDue: today });
  if (!parsed.ok) return parsed;
  return { ok: true, goalId: null, create: parsed.goal, name: parsed.goal?.name ?? null };
}

/** "Add to one of your goals" for a one-time investment: the goals that already hold money, one per name and month. */
export async function goalChoices(db: Db, investorId: string): Promise<{ id: number; label: string }[]> {
  const { rows } = await db.query<{ id: number; name: string; target_month: string | null }>(
    `SELECT g.id, g.name, g.target_month::text FROM goals g
     WHERE g.investor_id = $1
       AND (EXISTS (SELECT 1 FROM sips s WHERE s.goal_id = g.id) OR EXISTS (SELECT 1 FROM lumpsums l WHERE l.goal_id = g.id))
     ORDER BY g.id`,
    [investorId],
  );
  const seen = new Set<string>();
  return rows.flatMap((g) => {
    const label = `${g.name}${g.target_month ? ` · by ${monthYear(g.target_month)}` : ''}`;
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ id: g.id, label }];
  });
}

export async function insertGoal(db: Db, investorId: string, goal: GoalInput): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO goals (investor_id, kind, name, target_month, target_amount) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [investorId, goal.kind, goal.name, goal.target, goal.targetAmount ?? null],
  );
  return rows[0].id;
}

function notActive(sip: SipState): ActionResult | null {
  if (sip.status === 'stopped') return STOPPED;
  if (sip.status === 'paused') return PAUSED;
  if (sip.schedule.upcoming.length === 0) return { status: 400, error: 'There is no instalment ahead to skip.' };
  return null;
}
