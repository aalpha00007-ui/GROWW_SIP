import type { Db } from '../../db/client';
import { isTemplateId } from './personas';

/** "Simulate a market fall" adds a -6% day (PRD F12). */
export const DEMO_FALL = 0.06;
/** A liquid fund holds short-term debt, which a market fall barely moves, so its demo day is flat. */
export const STEADY_CATEGORIES = ['Liquid'];

export interface DemoNav {
  fund_id: number;
  nav_date: string;
  nav: string;
}

/**
 * Adds, for every fund, a NAV 6% below the latest one this visitor sees (liquid funds: the same NAV, so every fund's
 * latest date stays in step), dated the demo date: a fall never lands before a payment already made, or in the future.
 * The rows are labelled demo by living in demo_nav_history and only affect this visitor (PRD F12). Pressing it again
 * on the same day takes that day down another 6%.
 */
export async function applyMarketFall(db: Db, investorId: string, today: string): Promise<DemoNav[]> {
  if (isTemplateId(investorId)) throw new Error('Persona templates are read-only; apply the fall to a visitor.');
  const found = await db.query('SELECT 1 FROM investors WHERE id = $1', [investorId]);
  if (found.rows.length === 0) throw new Error(`No investor ${investorId}.`);

  const { rows } = await db.query<DemoNav>(
    `WITH latest AS (
       SELECT DISTINCT ON (fund_id) fund_id, nav FROM visible_nav_history($1) WHERE nav_date <= $4::date ORDER BY fund_id, nav_date DESC
     )
     INSERT INTO demo_nav_history (investor_id, fund_id, nav_date, nav)
     SELECT $1::uuid, l.fund_id, $4::date,
       round(l.nav * (1 - CASE WHEN f.category = ANY($3::text[]) THEN 0 ELSE $2::numeric END), 4)
     FROM latest l JOIN funds f ON f.id = l.fund_id
     ON CONFLICT (investor_id, fund_id, nav_date) DO UPDATE SET nav = EXCLUDED.nav, falls = demo_nav_history.falls + 1
     RETURNING fund_id, nav_date::text AS nav_date, nav::text AS nav`,
    [investorId, DEMO_FALL, STEADY_CATEGORIES, today],
  );
  return rows.sort((a, b) => a.fund_id - b.fund_id);
}

/** How many simulated falls this visitor has added, for the "Includes 2 simulated market falls" note. */
export async function simulatedFalls(db: Db, investorId: string): Promise<number> {
  const [row] = (
    await db.query<{ falls: number }>(
      'SELECT coalesce(sum(n), 0)::int AS falls FROM (SELECT max(falls) AS n FROM demo_nav_history WHERE investor_id = $1 GROUP BY nav_date) d',
      [investorId],
    )
  ).rows;
  return row.falls;
}
