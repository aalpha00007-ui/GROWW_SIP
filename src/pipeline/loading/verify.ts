import type { Db } from '../../db/client';
import { addMonths, dateRange, monthlyDueDates } from './dates';
import { TEMPLATE_IDS } from './personas';
import { loadMarket, loadPersonas, NAV_MONTHS, PRICE_MONTHS } from './raw';
import { TABLES } from './seed';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** Confirms what `npm run db:setup` stored, by comparing the database with what the seed should produce. */
export async function verifyDatabase(db: Db): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const one = async <T>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows[0];
  const n = async (sql: string, params?: unknown[]) => Number((await one<{ n: number }>(sql, params)).n);

  const tables = (await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(
    (r) => r.table_name,
  );
  const missing = TABLES.filter((t) => !tables.includes(t));
  add('Tables', missing.length === 0, missing.length ? `missing ${missing.join(', ')}; run npm run db:setup` : `all ${TABLES.length} present`);
  if (missing.length) return checks;

  // NAVs end on the day the seed ran, so expected counts are worked out from that day.
  const seededOn = (await one<{ d: string | null }>('SELECT max(nav_date)::text AS d FROM nav_history')).d;
  if (!seededOn) {
    add('NAV history', false, 'empty; run npm run db:setup');
    return checks;
  }
  const market = loadMarket();
  const personas = loadPersonas(market);

  const funds = await n('SELECT count(*)::int AS n FROM funds');
  add('Funds', funds === market.funds.length, `${funds} of ${market.funds.length}`);

  const navDays = dateRange(addMonths(seededOn, -NAV_MONTHS), seededOn).length;
  const shortNav = await n('SELECT count(*)::int AS n FROM (SELECT fund_id FROM nav_history GROUP BY fund_id HAVING count(*) <> $1) t', [navDays]);
  const navRows = await n('SELECT count(*)::int AS n FROM nav_history');
  add('NAV history', shortNav === 0 && navRows === funds * navDays, `${navRows} rows, ${navDays} days per fund, up to ${seededOn}`);

  const assets = await n('SELECT count(*)::int AS n FROM assets');
  const priceDays = dateRange(addMonths(seededOn, -PRICE_MONTHS), seededOn).length;
  const priceRows = await n('SELECT count(*)::int AS n FROM asset_prices');
  add('Assets and prices', assets === market.assets.length && priceRows === assets * priceDays, `${assets} assets, ${priceRows} price rows`);

  const ipos = await n('SELECT count(*)::int AS n FROM ipos');
  add('IPOs', ipos === market.ipos.length, `${ipos} of ${market.ipos.length}`);

  for (const persona of personas) {
    const id = TEMPLATE_IDS[persona.key];
    const expected = persona.sips.reduce(
      (sum, s) => sum + monthlyDueDates(addMonths(seededOn, -s.started_months_ago), s.day_of_month, addMonths(seededOn, -(s.stopped_months_ago ?? 0))).length - (s.skipped_instalments?.length ?? 0),
      0,
    );
    const sips = await n('SELECT count(*)::int AS n FROM sips WHERE investor_id = $1', [id]);
    const instalments = await n('SELECT count(*)::int AS n FROM instalments i JOIN sips s ON s.id = i.sip_id WHERE s.investor_id = $1', [id]);
    add(`Persona ${persona.key}`, sips === persona.sips.length && instalments === expected, `${sips} SIPs, ${instalments} of ${expected} instalments`);
  }

  const mispriced = await n(
    `SELECT count(*)::int AS n FROM instalments i JOIN sips s ON s.id = i.sip_id
     LEFT JOIN nav_history h ON h.fund_id = s.fund_id AND h.nav_date = i.due_on
     WHERE s.investor_id = ANY($1::uuid[]) AND (h.nav IS NULL OR i.nav <> h.nav)`,
    [Object.values(TEMPLATE_IDS)],
  );
  add("Instalments at that day's NAV", mispriced === 0, mispriced === 0 ? 'all persona instalments match' : `${mispriced} do not match`);

  const fn = await n("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'visible_nav_history'");
  add('visible_nav_history()', fn === 1, fn === 1 ? 'present' : 'missing; run npm run db:setup');

  const vectors =
    (await n("SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'vector'")) +
    (await n("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND udt_name = 'vector'"));
  add('No vector store (D3)', vectors === 0, vectors === 0 ? 'no vector extension or columns' : 'vector extension or columns found');

  const visitors = await n('SELECT count(*)::int AS n FROM investors WHERE NOT (id = ANY($1::uuid[]))', [Object.values(TEMPLATE_IDS)]);
  const demoDays = await n('SELECT count(*)::int AS n FROM demo_nav_history');
  add('Visitors so far', true, `${visitors} demo visitors, ${demoDays} demo NAV rows`);

  return checks;
}
