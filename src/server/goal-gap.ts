// The gap between what a plan puts in and a goal's target amount, for goal setup and Edit goal. Plain arithmetic on
// instalments: it never includes a return, assumed or expected, and it says what the numbers are, never what to do.
// The planned amount always comes from the shared schedule (pipeline/chunking/schedule.ts), so it matches every screen.
import type { Db } from '../db/client';
import { monthYear } from '../pipeline/chunking/format';
import { sipSchedule, type PaidInstalment, type MarkedDate } from '../pipeline/chunking/schedule';
import { inr } from './money';
import { loadSip } from './sip';
import { parseGoal, TARGET_MAX, TARGET_MIN } from './sip-actions';

export interface GoalGap {
  /** "Your planned instalments add up to ₹X by Mar 2031. That's ₹Y short of your ₹Z target (instalments only, no returns included)." */
  line: string;
  /** "To reach ₹Z from instalments alone, the monthly amount would be about ₹M."; null when no instalment is left to change. */
  monthly: string | null;
}

export function goalGap(p: {
  /** Put in so far plus the remaining payable instalments: the schedule's plannedPutIn. */
  plannedPutIn: number;
  /** Already put in, which doesn't change with the monthly amount. */
  putIn: number;
  /** The instalments still to come. */
  remaining: number;
  target: number;
  /** 'YYYY-MM-01' */
  goalMonth: string;
}): GoalGap {
  const { plannedPutIn: planned, putIn, remaining, target } = p;
  const covered = planned >= target;
  const line = covered
    ? `Your planned instalments add up to ${inr(planned)}, which covers your ${inr(target)} target (instalments only, no returns included).`
    : `Your planned instalments add up to ${inr(planned)} by ${monthYear(p.goalMonth)}. That's ${inr(target - planned)} short of your ${inr(target)} target (instalments only, no returns included).`;
  // Rounded up: "about ₹M" should reach the target, not fall a few rupees under it.
  const needed = target - putIn;
  const monthly = remaining > 0 && needed > 0 ? `To reach ${inr(target)} from instalments alone, the monthly amount would be about ${inr(Math.ceil(needed / remaining))}.` : null;
  return { line, monthly };
}

/** A target the goal editor would accept, or null: a half-typed amount simply shows no gap yet. */
export function validTarget(text: string | null): number | null {
  if (!/^\d{1,9}$/.test(text ?? '')) return null;
  const target = Number(text);
  return target >= TARGET_MIN && target <= TARGET_MAX ? target : null;
}

export type SipGoalPreview = { status: 200; gap: GoalGap | null } | { status: 400 | 404; error: string };

/**
 * GET /api/sips/[id]/goal-preview: the gap for this SIP if its goal moved to this date and target. The schedule is
 * worked out again for that date from the SIP's own history: what was paid, and the skips already made or scheduled.
 */
export async function sipGoalPreview(db: Db, investorId: string, sipId: number, q: { targetMonth: string | null; target: number | null }, today: string): Promise<SipGoalPreview> {
  const sip = await loadSip(db, investorId, sipId, today);
  if (!sip) return { status: 404, error: 'We could not find that SIP.' };
  const parsed = parseGoal({ kind: 'custom', name: 'preview', targetMonth: q.targetMonth }, { today, firstDue: sip.schedule.firstPaid?.due ?? sip.facts.next_due_date ?? today });
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const goalMonth = parsed.goal?.target ?? null;
  if (goalMonth === null || q.target === null) return { status: 200, gap: null };

  const [row] = (await db.query<{ started_on: string; day_of_month: number }>('SELECT started_on::text, day_of_month FROM sips WHERE id = $1', [sipId])).rows;
  const paid: PaidInstalment[] = sip.schedule.rows.flatMap((r) => (r.state === 'paid' ? [{ id: r.id, due: r.due, paidOn: r.date, amount: r.amount ?? 0 }] : []));
  const marked: MarkedDate[] = sip.schedule.rows.flatMap((r) =>
    r.state === 'skipped' || r.state === 'scheduled_skip' ? [{ date: r.due, kind: r.paused ? ('paused' as const) : ('skipped' as const) }] : [],
  );
  const plan = sipSchedule({
    startedOn: row.started_on,
    dayOfMonth: row.day_of_month,
    today,
    amount: sip.facts.amount,
    stopped: sip.status === 'stopped',
    stoppedOn: sip.stoppedOn,
    goalMonth,
    paid,
    marked,
  });
  return { status: 200, gap: goalGap({ plannedPutIn: plan.plannedPutIn!, putIn: plan.putIn, remaining: plan.remaining!, target: q.target, goalMonth }) };
}
