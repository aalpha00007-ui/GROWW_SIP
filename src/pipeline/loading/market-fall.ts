import type { Db } from '../../db/client';
import { isTemplateId } from './personas';

/** "Simulate a market fall" adds a -6% day (PRD F12). */
export const DEMO_FALL = 0.06;

export interface DemoNav {
  fund_id: number;
  nav_date: string;
  nav: string;
}

/**
 * Adds, for every fund, one NAV day 6% below the latest NAV this visitor sees. The rows are
 * labelled demo by living in demo_nav_history and only affect this visitor (PRD F12).
 * Pressing it again adds another day on top.
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
     SELECT $1::uuid, fund_id, nav_date + 1, round(nav * (1 - $2::numeric), 4) FROM latest
     RETURNING fund_id, nav_date::text AS nav_date, nav::text AS nav`,
    [investorId, DEMO_FALL],
  );
  return rows.sort((a, b) => a.fund_id - b.fund_id);
}
