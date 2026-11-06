import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { homeView } from '../server/home';
import { dayChange, marketStrip } from '../server/market';
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
  it('shows the made-up levels on the seed day', async () => {
    const visitor = await clonePersona(db, 'riya');
    const before = await marketStrip(db, visitor);
    expect(before.indices.map((i) => i.name)).toEqual(['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'NIFTY MIDCAP', 'FIN NIFTY', 'NIFTY NEXT 50', 'NIFTY SMALLCAP', 'NIFTY IT']);
    expect(before.indices[0].value).toBe('24,800.00');
    expect(before.indices.every((i) => i.change !== null && /^[+-]?[\d,]+\.\d\d \(\d+\.\d\d%\)$/.test(i.change))).toBe(true);
    expect(before.note).toBe('Demo prices as of 27 Oct 2026 · Demo data');
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
