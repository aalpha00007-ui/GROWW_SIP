import type { Db } from '../../db/client';
import { buildFactsUnit, type FactsUnit, type SipFacts } from '../chunking/facts';
import { monthsBetween, monthYear, rupees } from '../chunking/format';
import { addDays, addMonths, firstDueDate, monthlyDueDates, monthStart } from '../loading/dates';

export type FactsLookup =
  | { status: 'not_found' }
  /** A stopped SIP still has facts: its units stay invested, so Home and the SIP page show them. */
  | { status: 'ok' | 'stopped'; facts: SipFacts; unit: FactsUnit; goalLine: string };

/**
 * Step 3, facts retrieval: one read of this investor's SIP with plain SQL, computed and formatted
 * once. A SIP that is not this investor's reads as not found, so ids of others never leak.
 */
export async function retrieveFacts(db: Db, investorId: string, sipId: number, today: string): Promise<FactsLookup> {
  const [sip] = (
    await db.query<{
      fund_id: number; fund_name: string; category: string; amount: number; day_of_month: number;
      started_on: string; goal_name: string | null; target_month: string | null; stopped: boolean;
    }>(
      `SELECT s.fund_id, f.name AS fund_name, f.category, s.amount, s.day_of_month, s.started_on::text,
         g.name AS goal_name, g.target_month::text,
         EXISTS (SELECT 1 FROM sip_events e WHERE e.sip_id = s.id AND e.kind = 'cancelled') AS stopped
       FROM sips s JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.id = $1 AND s.investor_id = $2`,
      [sipId, investorId],
    )
  ).rows;
  if (!sip) return { status: 'not_found' };

  const [paid] = (
    await db.query<{ count: number; invested: number; units: string; first_due: string | null; due_dates: string[] | null }>(
      `SELECT count(*)::int AS count, coalesce(sum(amount), 0)::int AS invested, coalesce(sum(units), 0)::text AS units,
         min(due_on)::text AS first_due, array_agg(due_on::text) AS due_dates
       FROM instalments WHERE sip_id = $1 AND paid_on IS NOT NULL`,
      [sipId],
    )
  ).rows;
  // Skip next marks one due date; Pause marks the next 1-3. Either way the instalment is skipped.
  const skipped = (
    await db.query<{ kind: string; detail: { due_on?: string; due_dates?: string[] } }>(
      "SELECT kind, detail FROM sip_events WHERE sip_id = $1 AND kind IN ('skipped', 'paused') ORDER BY id",
      [sipId],
    )
  ).rows.flatMap((e) => (e.kind === 'paused' ? (e.detail.due_dates ?? []) : [e.detail.due_on ?? null]));

  // visible_nav_history includes this visitor's demo market-fall days (architecture Phase 4).
  const [latest] = (
    await db.query<{ nav: string; nav_date: string }>(
      'SELECT nav::text, nav_date::text FROM visible_nav_history($1) WHERE fund_id = $2 ORDER BY nav_date DESC LIMIT 1',
      [investorId, sip.fund_id],
    )
  ).rows;
  if (!latest) throw new Error(`No NAV history for fund ${sip.fund_id}. Run npm run db:setup.`);

  let worstFall: number | null = null;
  if (paid.count > 0 && paid.first_due) {
    const [row] = (
      await db.query<{ worst: string | null }>(
        `SELECT round(min(nav / peak - 1) * 100, 1)::text AS worst FROM (
           SELECT nav, max(nav) OVER (ORDER BY nav_date) AS peak FROM visible_nav_history($1)
           WHERE fund_id = $2 AND nav_date >= $3
         ) t`,
        [investorId, sip.fund_id, paid.first_due],
      )
    ).rows;
    worstFall = row.worst === null ? null : Number(row.worst);
  }

  // Schedule facts come from the SIP's start and day; nothing about them is stored.
  const firstDue = firstDueDate(sip.started_on, sip.day_of_month);
  const handled = new Set([...(paid.due_dates ?? []), ...skipped.filter((d): d is string => d !== null)]);
  let nextDue: string | null = null;
  if (!sip.stopped) {
    nextDue = firstDue;
    while (nextDue < today || handled.has(nextDue)) nextDue = addMonths(nextDue, 1);
  }
  const monthsInvested = paid.count > 0 ? Math.max(0, monthsBetween(firstDue, today) + 1) : 0;
  const planned = sip.target_month
    ? monthlyDueDates(sip.started_on, sip.day_of_month, addDays(addMonths(monthStart(sip.target_month), 1), -1)).length
    : null;

  const facts: SipFacts = {
    sip_id: sipId,
    today,
    as_of: latest.nav_date,
    fund_name: sip.fund_name,
    fund_category: sip.category,
    amount: sip.amount,
    months_invested: monthsInvested,
    instalments_paid: paid.count,
    instalments_skipped: skipped.length,
    invested: paid.invested,
    current_value: Number(paid.units) * Number(latest.nav),
    worst_fall_since_start_pct: worstFall,
    next_due_date: nextDue,
    goal: sip.goal_name ? { name: sip.goal_name, target_month: sip.target_month } : null,
    instalments_planned: planned,
  };
  return { status: sip.stopped ? 'stopped' : 'ok', facts, unit: buildFactsUnit(facts), goalLine: goalLine(facts) };
}

/** The card on top of Before you stop (PRD F7): "You started this for Home down payment · Mar 2031 · 7 of 60 paid · Rs 14,000 put in". */
function goalLine(facts: SipFacts): string {
  if (!facts.goal) return 'No goal is set for this SIP';
  const parts = [`You started this for ${facts.goal.name}`];
  if (facts.goal.target_month) parts.push(monthYear(facts.goal.target_month));
  parts.push(facts.instalments_planned !== null ? `${facts.instalments_paid} of ${facts.instalments_planned} paid` : `${facts.instalments_paid} paid`);
  parts.push(`${rupees(facts.invested)} put in`);
  return parts.join(' · ');
}
