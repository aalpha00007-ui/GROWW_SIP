import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { homeView } from '../server/home';
import { dayChange, homeFunds, marketStrip } from '../server/market';
import { stopSip } from '../server/sip-actions';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('day changes', () => {
  it('always signs the points and brackets the percent', () => {
    expect(dayChange(100.54, 100)).toBe('+0.54 (0.54%)');
    expect(dayChange(23_000, 23_050.9)).toBe('-50.90 (0.22%)');
    expect(dayChange(100, 100)).toBe('0.00 (0.00%)');
    expect(dayChange(100, null)).toBeNull();
  });
});

describe('the market strip (demo data only)', () => {
  it('shows the made-up levels on the seed day and drops by the same 6% as the simulated fall', async () => {
    const visitor = await clonePersona(db, 'riya');
    const before = await marketStrip(db, visitor);
    expect(before.indices.map((i) => i.name)).toEqual(['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'NIFTY MIDCAP', 'FIN NIFTY', 'NIFTY NEXT 50', 'NIFTY SMALLCAP', 'NIFTY IT']);
    expect(before.indices[0].value).toBe('24,800.00');
    expect(before.indices.every((i) => i.change !== null && /^[+-]?[\d,]+\.\d\d \(\d+\.\d\d%\)$/.test(i.change))).toBe(true);
    expect(before.note).toBe('Numbers as of 27 Oct 2026 · Demo data');

    await applyMarketFall(db, visitor);
    const after = await marketStrip(db, visitor);
    // 24,800 x 0.94, give or take the fund NAV's 4-decimal rounding: the strip follows the same NAV as the goal cards.
    expect(Number(after.indices[0].value.replace(/,/g, ''))).toBeCloseTo(23_312, 0);
    expect(after.indices.every((i) => i.change?.startsWith('-') && i.change.endsWith('(6.00%)'))).toBe(true);
    expect(after.note).toBe('Numbers as of 28 Oct 2026 · Includes 1 simulated market fall · Demo data');
    // Another visitor's strip is untouched.
    expect((await marketStrip(db, await clonePersona(db, 'riya'))).indices[0].value).toBe('24,800.00');
  });
});

describe('Home fund rows', () => {
  it('shows four made-up popular funds whose day change follows the simulated fall', async () => {
    const visitor = await clonePersona(db, 'riya');
    const { popular } = await homeFunds(db, visitor);
    expect(popular.map((f) => [f.name, f.initials])).toEqual([
      ['Kestrel Nifty 50 Index Fund', 'KN'],
      ['Banyan Flexi Cap Fund', 'BF'],
      ['Lotus ELSS Tax Saver Fund', 'LE'],
      ['Monsoon Midcap Fund', 'MM'],
    ]);
    expect(popular[0].nav).toMatch(/^₹[\d,]+\.\d\d$/);
    await applyMarketFall(db, visitor);
    expect((await homeFunds(db, visitor)).popular.every((f) => f.change?.startsWith('-') && f.change.endsWith('(6.00%)'))).toBe(true);
  });

  it('groups the funds by category with a risk word for each', async () => {
    const { categories } = await homeFunds(db, await clonePersona(db, 'riya'));
    expect(categories.map((c) => [c.label, c.count, c.risk.label, c.risk.level, c.href])).toEqual([
      ['Index funds', '1 fund', 'Very High risk', 'high', '/explore?category=Index'],
      ['Tax saver (ELSS)', '1 fund', 'Very High risk', 'high', '/explore?category=ELSS'],
      ['Equity funds', '4 funds', 'Very High risk', 'high', '/explore?category=Equity'],
      ['Liquid funds', '1 fund', 'Low to Moderate risk', 'low', '/explore?category=Liquid'],
    ]);
  });
});

describe('Your investments and Products & Tools', () => {
  it('counts active SIPs and goals, and a stopped SIP stops counting as active', async () => {
    const riya = await clonePersona(db, 'riya');
    expect(await homeView(db, riya, TODAY)).toMatchObject({ activeSips: 3, goalCount: 2 });
    const [kestrel] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id DESC LIMIT 1', [riya])).rows;
    await stopSip(db, riya, kestrel.id, undefined, TODAY);
    expect(await homeView(db, riya, TODAY)).toMatchObject({ activeSips: 2, goalCount: 2 });
  });

  it('gives an investor with no SIPs the empty state', async () => {
    const id = randomUUID();
    await db.query("INSERT INTO investors (id, persona_key, display_name) VALUES ($1, 'new', 'Sam, 25, salaried')", [id]);
    expect(await homeView(db, id, TODAY)).toMatchObject({ summary: null, goals: [], noGoal: null, comingUp: [], activeSips: 0, goalCount: 0 });
  });
});
