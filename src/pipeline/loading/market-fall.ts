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
 * Adds, for every fund, one NAV day 6% below the latest NAV this visitor sees (liquid funds: the same
 * NAV, so every fund's latest date stays in step). The rows are labelled demo by living in
 * demo_nav_history and only affect this visitor (PRD F12). Pressing it again adds another day on top.
 */
export async function applyMarketFall(db: Db, investorId: string): Promise<DemoNav[]> {
  if (isTemplateId(investorId)) throw new Error('Persona templates are read-only; apply the fall to a visitor.');
  const found = await db.query('SELECT 1 FROM investors WHERE id = $1', [investorId]);
  if (found.rows.length === 0) throw new Error(`No investor ${investorId}.`);

  const { rows } = await db.query<DemoNav>(
    `WITH latest AS (
       SELECT DISTINCT ON (fund_id) fund_id, nav_date, nav FROM visible_nav_history($1) ORDER BY fund_id, nav_date DESC
     )
     INSERT INTO demo_nav_history (investor_id, fund_id, nav_date, nav)
     SELECT $1::uuid, l.fund_id, l.nav_date + 1,
       round(l.nav * (1 - CASE WHEN f.category = ANY($3::text[]) THEN 0 ELSE $2::numeric END), 4)
     FROM latest l JOIN funds f ON f.id = l.fund_id
     RETURNING fund_id, nav_date::text AS nav_date, nav::text AS nav`,
    [investorId, DEMO_FALL, STEADY_CATEGORIES],
  );
  return rows.sort((a, b) => a.fund_id - b.fund_id);
}
