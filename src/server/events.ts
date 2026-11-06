// The case study's funnel (brief phase 4): one app_events row per thing an investor did, with the
// investor's id and the time. No free text and no personal data, only ids and choices in `detail`.
import type { Db } from '../db/client';

// Nothing is logged for opening an editor: a goal or an amount counts once it is saved. goal_step_shown, from before
// that rule, stays allowed in the table so old rows keep their meaning, and is left out of the report.
export const EVENTS = [
  'goal_saved', 'goal_skipped', 'sip_started',
  'dip_context_viewed', 'ai_question_asked', 'stop_checkin_opened', 'sip_stopped', 'sip_kept', 'goal_tooltip_dismissed',
] as const;
export type AppEvent = (typeof EVENTS)[number];

/** What the browser may log itself: what was shown or tapped. Everything else is logged by its server action. */
const FROM_BROWSER: AppEvent[] = ['goal_tooltip_dismissed', 'sip_kept', 'stop_checkin_opened', 'dip_context_viewed'];

/**
 * Who a row of activity came from, so the counts are of real use only:
 * - 'qa': the eval's and our test visitors (tagged by name), and any username listed in QA_USERNAMES;
 * - 'demo': a persona copy, which anyone can open in a click and which says nothing about real behaviour;
 * - 'real': a signed-up account.
 * Worked out on read, so it applies to every row already stored. `i` must be the investors table.
 */
export function visitorKind(usernames: string[] = qaUsernames()): { sql: string; params: unknown[] } {
  return {
    sql: `CASE
      WHEN i.display_name LIKE ANY(ARRAY['% · eval', '% · CLI test'])
        OR EXISTS (SELECT 1 FROM accounts qa WHERE qa.investor_id = i.id AND qa.username = ANY($1::text[])) THEN 'qa'
      WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.investor_id = i.id) THEN 'demo'
      ELSE 'real' END`,
    params: [usernames],
  };
}

export const qaUsernames = (env: Record<string, string | undefined> = process.env) =>
  (env.QA_USERNAMES ?? '').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);

export async function logEvent(db: Db, investorId: string, event: AppEvent, detail: Record<string, unknown> = {}): Promise<void> {
  await db.query('INSERT INTO app_events (investor_id, event, detail) VALUES ($1, $2, $3)', [investorId, event, detail]);
}

/** POST /api/events {event, sipId?, choice?, where?}: the few events only the browser sees. */
export async function logBrowserEvent(db: Db, investorId: string, input: unknown): Promise<{ status: 200; message: string } | { status: 400; error: string }> {
  const body = (input ?? {}) as { event?: unknown; sipId?: unknown; choice?: unknown; where?: unknown };
  const event = FROM_BROWSER.find((e) => e === body.event);
  if (!event) return { status: 400, error: 'Unknown event.' };
  const detail: Record<string, unknown> = {};
  if (Number.isInteger(body.sipId)) detail.sip_id = body.sipId;
  if (typeof body.choice === 'string' && /^[a-z_]{1,20}$/.test(body.choice)) detail.choice = body.choice;
  if (typeof body.where === 'string' && /^[a-z_]{1,20}$/.test(body.where)) detail.where = body.where;
  // A dip seen next to its goal counts once a day, however often the page is opened.
  if (event === 'dip_context_viewed') await logEventOncePerDay(db, investorId, event, detail);
  else await logEvent(db, investorId, event, detail);
  return { status: 200, message: 'Logged.' };
}

/** Logs the event at most once a day per investor: for page views, such as a dip seen next to a goal. */
export async function logEventOncePerDay(db: Db, investorId: string, event: AppEvent, detail: Record<string, unknown> = {}): Promise<void> {
  await db.query(
    `INSERT INTO app_events (investor_id, event, detail)
     SELECT $1, $2, $3 WHERE NOT EXISTS (
       SELECT 1 FROM app_events WHERE investor_id = $1 AND event = $2
         AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
     )`,
    [investorId, event, detail],
  );
}

/** Has this investor already closed the "New: tell us what this SIP is for" tooltip? */
export async function tooltipDismissed(db: Db, investorId: string): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM app_events WHERE investor_id = $1 AND event = 'goal_tooltip_dismissed' LIMIT 1", [investorId]);
  return rows.length > 0;
}

export interface EventReport {
  counts: { event: AppEvent; events: number; investors: number }[];
  /** How many investors were left out of the counts, by kind. */
  leftOut: { demo: number; qa: number };
  sipsStarted: number;
  startedWithGoal: number;
  /** SIPs started with a goal, of all SIPs started: null before any start. */
  goalSaveRate: number | null;
}

/** `npm run events`: counts per event and the goal-save rate, from real accounts only. Says nothing about retention. */
export async function eventReport(db: Db): Promise<EventReport> {
  const kind = visitorKind();
  const { rows } = await db.query<{ event: AppEvent; events: number; investors: number }>(
    `SELECT e.event, count(*)::int AS events, count(DISTINCT e.investor_id)::int AS investors
     FROM app_events e JOIN investors i ON i.id = e.investor_id
     WHERE (${kind.sql}) = 'real'
     GROUP BY e.event`,
    kind.params,
  );
  const [starts] = (
    await db.query<{ started: number; with_goal: number }>(
      `SELECT count(*)::int AS started, count(*) FILTER (WHERE (e.detail->>'with_goal')::boolean)::int AS with_goal
       FROM app_events e JOIN investors i ON i.id = e.investor_id
       WHERE e.event = 'sip_started' AND (${kind.sql}) = 'real'`,
      kind.params,
    )
  ).rows;
  const leftOut = (
    await db.query<{ kind: string; n: number }>(
      `SELECT k.kind, count(*)::int AS n FROM (
         SELECT DISTINCT e.investor_id, (${kind.sql}) AS kind FROM app_events e JOIN investors i ON i.id = e.investor_id
       ) k GROUP BY k.kind`,
      kind.params,
    )
  ).rows;
  return {
    counts: EVENTS.map((event) => rows.find((r) => r.event === event) ?? { event, events: 0, investors: 0 }),
    leftOut: { demo: leftOut.find((k) => k.kind === 'demo')?.n ?? 0, qa: leftOut.find((k) => k.kind === 'qa')?.n ?? 0 },
    sipsStarted: starts.started,
    startedWithGoal: starts.with_goal,
    goalSaveRate: starts.started ? starts.with_goal / starts.started : null,
  };
}
