import type { Db } from '../../db/client';
import { buildFactsUnit, type FactsUnit, type SipFacts } from '../chunking/facts';
import { monthsBetween, monthYear, rupees } from '../chunking/format';
import { markedDates, sipSchedule, type SipSchedule } from '../chunking/schedule';

export type FactsLookup =
  | { status: 'not_found' }
  /** A stopped SIP still has facts: its units stay invested, so Home and the SIP page show them. */
  | { status: 'ok' | 'stopped'; facts: SipFacts; unit: FactsUnit; goalLine: string; schedule: SipSchedule; stoppedOn: string | null };

/**
 * Step 3, facts retrieval: one read of this investor's SIP with plain SQL, computed and formatted
 * once. A SIP that is not this investor's reads as not found, so ids of others never leak.
 */
export async function retrieveFacts(db: Db, investorId: string, sipId: number, today: string): Promise<FactsLookup> {
  const [sip] = (
    await db.query<{
      fund_id: number; fund_name: string; category: string; exit_load_text: string; amount: number; day_of_month: number;
      started_on: string; goal_name: string | null; target_month: string | null; target_amount: string | null; stopped_on: string | null;
    }>(
      `SELECT s.fund_id, f.name AS fund_name, f.category, f.exit_load_text, s.amount, s.day_of_month, s.started_on::text,
         g.name AS goal_name, g.target_month::text, g.target_amount::text,
         -- The demo date of the stop (detail.on); older rows have only the clock time they were written.
         (SELECT coalesce(e.detail->>'on', (e.created_at AT TIME ZONE 'Asia/Kolkata')::date::text) FROM sip_events e
          WHERE e.sip_id = s.id AND e.kind = 'cancelled' ORDER BY e.id LIMIT 1) AS stopped_on
       FROM sips s JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.id = $1 AND s.investor_id = $2`,
      [sipId, investorId],
    )
  ).rows;
  if (!sip) return { status: 'not_found' };
  const stopped = sip.stopped_on !== null;

  const [paid] = (
    await db.query<{ count: number; units: string; first_paid: string | null; first_nav: string | null }>(
      `SELECT count(*)::int AS count, coalesce(sum(units), 0)::text AS units, min(paid_on)::text AS first_paid,
         -- The price the first instalment was really bought at: its stored NAV, or amount / units.
         (SELECT coalesce(i.nav, i.amount / nullif(i.units, 0))::text FROM instalments i
          WHERE i.sip_id = $1 AND i.paid_on IS NOT NULL ORDER BY i.paid_on, i.due_on LIMIT 1) AS first_nav
       FROM instalments WHERE sip_id = $1 AND paid_on IS NOT NULL`,
      [sipId],
    )
  ).rows;
  const instalments = (
    await db.query<{ id: number; due: string; paidOn: string; amount: number }>(
      'SELECT id, due_on::text AS due, paid_on::text AS "paidOn", amount FROM instalments WHERE sip_id = $1 AND paid_on IS NOT NULL ORDER BY due_on',
      [sipId],
    )
  ).rows;
  const events = (
    await db.query<{ kind: string; detail: { due_on?: string; due_dates?: string[] } }>(
      "SELECT kind, detail FROM sip_events WHERE sip_id = $1 AND kind IN ('skipped', 'paused', 'skip_undone', 'resumed') ORDER BY id",
      [sipId],
    )
  ).rows;

  // visible_nav_history includes this visitor's demo market-fall days (architecture Phase 4).
  const [latest] = (
    await db.query<{ nav: string; nav_date: string }>(
      'SELECT nav::text, nav_date::text FROM visible_nav_history($1) WHERE fund_id = $2 ORDER BY nav_date DESC LIMIT 1',
      [investorId, sip.fund_id],
    )
  ).rows;
  if (!latest) throw new Error(`No NAV history for fund ${sip.fund_id}. Run npm run db:setup.`);

  // The fund's biggest fall from a high in all the NAVs this visitor sees: history for context, never a prediction.
  const [biggest] = (
    await db.query<{ fall: string; nav_date: string }>(
      `SELECT round((nav / peak - 1) * 100, 1)::text AS fall, nav_date::text FROM (
         SELECT nav, nav_date, max(nav) OVER (ORDER BY nav_date) AS peak FROM visible_nav_history($1) WHERE fund_id = $2
       ) t ORDER BY nav / peak, nav_date LIMIT 1`,
      [investorId, sip.fund_id],
    )
  ).rows;

  let worstFall: number | null = null;
  let peakNav: number | null = null;
  // From the first payment: a new SIP pays its first instalment at once, before its first due date. The peak
  // starts at the price that instalment was bought at: it is dated today but bought at the last NAV before
  // today, so a market fall added for today is measured from what was paid, not from itself.
  if (paid.count > 0 && paid.first_paid) {
    const [row] = (
      await db.query<{ worst: string | null; peak: string | null }>(
        `SELECT round(min(nav / greatest(peak, coalesce($4::numeric, peak)) - 1) * 100, 1)::text AS worst,
           max(greatest(peak, coalesce($4::numeric, peak)))::text AS peak FROM (
           SELECT nav, max(nav) OVER (ORDER BY nav_date) AS peak FROM visible_nav_history($1)
           WHERE fund_id = $2 AND nav_date >= $3
         ) t`,
        [investorId, sip.fund_id, paid.first_paid, paid.first_nav],
      )
    ).rows;
    worstFall = row.worst === null ? null : Number(row.worst);
    peakNav = row.peak === null ? null : Number(row.peak);
  }

  // Every count comes from here; nothing about the schedule is stored or worked out anywhere else.
  const schedule = sipSchedule({
    startedOn: sip.started_on,
    dayOfMonth: sip.day_of_month,
    today,
    amount: sip.amount,
    stopped,
    stoppedOn: sip.stopped_on,
    goalMonth: sip.goal_name ? sip.target_month : null,
    paid: instalments,
    marked: markedDates(events),
  });
  const monthsInvested = paid.count > 0 ? Math.max(0, monthsBetween(paid.first_paid!, today) + 1) : 0;

  const facts: SipFacts = {
    sip_id: sipId,
    today,
    as_of: latest.nav_date,
    fund_name: sip.fund_name,
    fund_category: sip.category,
    exit_load: sip.exit_load_text,
    fund_biggest_fall: biggest && Number(biggest.fall) < 0 ? { pct: Number(biggest.fall), date: biggest.nav_date } : null,
    amount: sip.amount,
    months_invested: monthsInvested,
    instalments_paid: schedule.paid,
    instalments_skipped: schedule.pastSkipped,
    scheduled_skips: schedule.scheduledSkips,
    invested: schedule.putIn,
    current_value: Number(paid.units) * Number(latest.nav),
    worst_fall_since_start_pct: worstFall,
    latest_nav: Number(latest.nav),
    peak_nav_since_start: peakNav,
    next_due_date: schedule.nextDue,
    goal: sip.goal_name ? { name: sip.goal_name, target_month: sip.target_month, target_amount: sip.target_amount === null ? null : Number(sip.target_amount) } : null,
    instalments_planned: schedule.plannedPayable,
    instalments_to_go: schedule.remaining,
    planned_put_in: schedule.plannedPutIn,
  };
  return { status: stopped ? 'stopped' : 'ok', facts, unit: buildFactsUnit(facts), goalLine: goalLine(facts, schedule), schedule, stoppedOn: sip.stopped_on };
}

/** The card on top of Before you stop (PRD F7): "You started this for Home down payment · Mar 2031 · 7 of 60 paid · Rs 14,000 put in". */
function goalLine(facts: SipFacts, schedule: SipSchedule): string {
  if (!facts.goal) return 'No goal is set for this SIP';
  const parts = [`You started this for ${facts.goal.name}`];
  if (facts.goal.target_month) parts.push(monthYear(facts.goal.target_month));
  parts.push(schedule.hasPlan ? `${schedule.paid} of ${schedule.plannedPayable} paid` : `${schedule.paid} paid`);
  parts.push(`${rupees(schedule.putIn)} put in`);
  return parts.join(' · ');
}
