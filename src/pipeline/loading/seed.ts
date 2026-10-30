import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../../db/client';
import { addDays, addMonths, dateRange, todayInIndia } from './dates';
import { insertTemplate, TEMPLATE_IDS } from './personas';
import { HISTORY_MONTHS, loadMarket, loadPersonas, NAV_MONTHS, PRICE_MONTHS, type FundSeed } from './raw';
import { randomWalk, WALK_SEED, type WalkPoint } from './walk';

const SCHEMA_FILE = path.join(process.cwd(), 'src', 'db', 'schema.sql');

/** Every table in schema.sql, dependents first. */
export const TABLES = [
  'app_events', 'signup_attempts', 'sessions', 'accounts', 'eval_results', 'eval_runs', 'ai_checks', 'watchlist', 'fund_watchlist', 'demo_orders', 'ipo_applications', 'ipos',
  'asset_prices', 'assets', 'mandates', 'cart_items', 'lumpsums', 'instalments', 'sip_events', 'sips',
  'goals', 'demo_nav_history', 'investors', 'nav_history', 'funds',
];

export interface SeedSummary {
  today: string;
  funds: number;
  navRows: number;
  assets: number;
  priceRows: number;
  ipos: number;
  personas: { key: string; sips: number; instalments: number }[];
}

/**
 * Applies the schema and loads the demo market and the persona templates. Safe to re-run:
 * reference rows keep their ids, NAVs and prices are regenerated up to `today`, templates are
 * rebuilt, and visitors' copies are left alone.
 */
export async function setupDatabase(db: Db, options: { today?: string } = {}): Promise<SeedSummary> {
  const today = options.today ?? todayInIndia();
  const market = loadMarket();
  const personas = loadPersonas(market);

  const calendar = navCalendar(today);
  const priceDates = dateRange(addMonths(today, -PRICE_MONTHS), today);
  const navs = new Map(market.funds.map((f) => [f.id, fundHistory(f, calendar)]));
  const prices = new Map(market.assets.map((a) => [a.id, randomWalk(a.walk, priceDates, WALK_SEED + 1000 + a.id, 2)]));

  await applySchema(db);

  return db.transaction(async (tx) => {
    for (const f of market.funds) {
      await tx.query(
        `INSERT INTO funds (id, name, category, risk_level, min_sip, exit_load_text, expense_ratio, sub_category, aum_cr, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
           risk_level = EXCLUDED.risk_level, min_sip = EXCLUDED.min_sip,
           exit_load_text = EXCLUDED.exit_load_text, expense_ratio = EXCLUDED.expense_ratio,
           sub_category = EXCLUDED.sub_category, aum_cr = EXCLUDED.aum_cr, rating = EXCLUDED.rating`,
        [f.id, f.name, f.category, f.risk_level, f.min_sip, f.exit_load_text, f.expense_ratio, f.sub_category, f.aum_cr, f.rating],
      );
    }
    await tx.query('DELETE FROM nav_history');
    await insertSeries(tx, 'nav_history', 'fund_id', 'nav_date', 'nav', navs);

    for (const a of market.assets) {
      await tx.query(
        `INSERT INTO assets (id, kind, name, symbol, sector, extra) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, symbol = EXCLUDED.symbol,
           sector = EXCLUDED.sector, extra = EXCLUDED.extra`,
        [a.id, a.kind, a.name, a.symbol, a.sector, a.extra],
      );
    }
    await tx.query('DELETE FROM asset_prices');
    await insertSeries(tx, 'asset_prices', 'asset_id', 'price_date', 'price', prices);

    for (const ipo of market.ipos) {
      await tx.query(
        `INSERT INTO ipos (id, name, status, price_band, lot_size, opens_on, closes_on) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, price_band = EXCLUDED.price_band,
           lot_size = EXCLUDED.lot_size, opens_on = EXCLUDED.opens_on, closes_on = EXCLUDED.closes_on`,
        [ipo.id, ipo.name, ipo.status, ipo.price_band, ipo.lot_size, addDays(today, ipo.opens_in_days), addDays(today, ipo.closes_in_days)],
      );
    }

    // Rows above were written with explicit ids, so move each id sequence past them.
    for (const table of ['funds', 'assets', 'ipos']) {
      await tx.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`);
    }

    await tx.query('DELETE FROM investors WHERE id = ANY($1::uuid[])', [Object.values(TEMPLATE_IDS)]);
    const ctx = { today, funds: market.funds, assets: market.assets, navs: byDate(navs), prices: byDate(prices) };
    const personaCounts: SeedSummary['personas'] = [];
    for (const persona of personas) {
      personaCounts.push({ key: persona.key, ...(await insertTemplate(tx, persona, ctx)) });
    }

    return {
      today,
      funds: market.funds.length,
      navRows: market.funds.length * (calendar.weekly.length + calendar.daily.length),
      assets: market.assets.length,
      priceRows: market.assets.length * priceDates.length,
      ipos: market.ipos.length,
      personas: personaCounts,
    };
  });
}

/**
 * NAV dates: daily for the last NAV_MONTHS (every persona instalment falls on one of these days),
 * and weekly before that back to HISTORY_MONTHS, for the fund page's 3Y, 5Y and All charts.
 */
export function navCalendar(today: string): { weekly: string[]; daily: string[] } {
  const daily = dateRange(addMonths(today, -NAV_MONTHS), today);
  const weekly: string[] = [];
  for (let d = addDays(daily[0], -7); d >= addMonths(today, -HISTORY_MONTHS); d = addDays(d, -7)) weekly.unshift(d);
  return { weekly, daily };
}

/**
 * One fund's NAVs. The daily walk is the one the personas, the AI facts and the eval were built on.
 * The older weekly walk has a seed of its own and is scaled to end exactly where the daily walk
 * starts, so adding it changed no NAV that was already there.
 */
function fundHistory(fund: FundSeed, calendar: { weekly: string[]; daily: string[] }): WalkPoint[] {
  const recent = randomWalk(fund.walk, calendar.daily, WALK_SEED + fund.id, 4);
  const older = randomWalk({ ...fund.walk, start: 1, end_fall: null }, [...calendar.weekly, calendar.daily[0]], WALK_SEED + 5000 + fund.id, 12);
  const scale = recent[0].value / older[older.length - 1].value;
  return [...older.slice(0, -1).map((p) => ({ date: p.date, value: Math.round(p.value * scale * 10_000) / 10_000 })), ...recent];
}

/** schema.sql only: every statement is safe to re-run, so a deploy runs it before the app starts. */
export async function applySchema(db: Db): Promise<void> {
  await db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
}

/** Drops every table and function. `npm run db:setup` rebuilds them. */
export async function wipeDatabase(db: Db): Promise<string[]> {
  await db.exec(
    ['DROP FUNCTION IF EXISTS visible_nav_history(uuid);', ...TABLES.map((t) => `DROP TABLE IF EXISTS ${t} CASCADE;`)].join('\n'),
  );
  return TABLES;
}

async function insertSeries(tx: Db, table: string, idColumn: string, dateColumn: string, valueColumn: string, series: Map<number, WalkPoint[]>) {
  const ids: number[] = [];
  const dates: string[] = [];
  const values: number[] = [];
  for (const [id, points] of series) {
    for (const p of points) {
      ids.push(id);
      dates.push(p.date);
      values.push(p.value);
    }
  }
  await tx.query(
    `INSERT INTO ${table} (${idColumn}, ${dateColumn}, ${valueColumn}) SELECT * FROM unnest($1::int[], $2::date[], $3::numeric[])`,
    [ids, dates, values],
  );
}

function byDate(series: Map<number, WalkPoint[]>): Map<number, Map<string, number>> {
  return new Map([...series].map(([id, points]) => [id, new Map(points.map((p) => [p.date, p.value]))]));
}
