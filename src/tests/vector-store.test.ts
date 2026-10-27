import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { addDays } from '../pipeline/loading/dates';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase, wipeDatabase } from '../pipeline/loading/seed';
import { pgliteDb } from './pglite-db';

// Phase 4 has no vector store (architecture decision D3): Postgres and the repo hold everything.
const TODAY = '2026-10-27';

let db: Db;

async function count(sql: string, params?: unknown[]): Promise<number> {
  return Number((await db.query<{ n: number }>(sql, params)).rows[0].n);
}

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('vector store (not used)', () => {
  it('keeps data/vector_db empty apart from its README', () => {
    expect(fs.readdirSync(path.join(process.cwd(), 'data', 'vector_db'))).toEqual(['README.md']);
  });

  it('adds no vector extension or vector column to Postgres', async () => {
    expect(await count("SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'vector'")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND udt_name = 'vector'")).toBe(0);
  });

  it('has every Postgres store the architecture names', async () => {
    const tables = (await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(
      (r) => r.table_name,
    );
    for (const store of [
      'funds', 'nav_history', 'assets', 'asset_prices', 'ipos', 'demo_nav_history', 'investors', 'goals', 'sips',
      'instalments', 'sip_events', 'mandates', 'demo_orders', 'ai_checks', 'eval_runs', 'eval_results',
    ]) {
      expect(tables, store).toContain(store);
    }
  });

  it('keeps the repo store in place: chunks, guardrails and eval fixtures', () => {
    for (const file of ['chunks/explainers.json', 'raw/guardrails/advice_patterns.json', 'eval/cases/cases.json', 'eval/golden_set/golden_set.csv']) {
      expect(fs.existsSync(path.join(process.cwd(), 'data', file)), file).toBe(true);
    }
  });
});

describe('visible_nav_history', () => {
  it('shows a visitor the shared NAVs and only their own demo days', async () => {
    const visitor = await clonePersona(db, 'riya');
    const other = await clonePersona(db, 'riya');
    const shared = await count('SELECT count(*)::int AS n FROM nav_history');
    expect(await count('SELECT count(*)::int AS n FROM visible_nav_history($1)', [visitor])).toBe(shared);

    await applyMarketFall(db, visitor);
    expect(await count('SELECT count(*)::int AS n FROM visible_nav_history($1) WHERE is_demo', [visitor])).toBe(8);
    expect(await count('SELECT count(*)::int AS n FROM visible_nav_history($1)', [visitor])).toBe(shared + 8);
    expect(await count('SELECT count(*)::int AS n FROM visible_nav_history($1) WHERE is_demo', [other])).toBe(0);
  });

  it("keeps a visitor's demo day when the shared history later reaches the same date", async () => {
    const visitor = await clonePersona(db, 'arjun');
    const [fall] = await applyMarketFall(db, visitor);
    await db.query('INSERT INTO nav_history (fund_id, nav_date, nav) VALUES ($1, $2, 1)', [fall.fund_id, fall.nav_date]);

    const rows = (
      await db.query<{ nav: string; is_demo: boolean }>(
        'SELECT nav::text, is_demo FROM visible_nav_history($1) WHERE fund_id = $2 AND nav_date = $3',
        [visitor, fall.fund_id, addDays(TODAY, 1)],
      )
    ).rows;
    expect(rows).toEqual([{ nav: fall.nav, is_demo: true }]);
    await db.query('DELETE FROM nav_history WHERE fund_id = $1 AND nav_date = $2', [fall.fund_id, fall.nav_date]);
  });
});

describe('db:reset', () => {
  it('drops every table and the NAV function', async () => {
    await wipeDatabase(db);
    expect(await count("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'visible_nav_history'")).toBe(0);
  });
});
