import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { addDays, addMonths, dateRange, monthlyDueDates } from '../pipeline/loading/dates';
import { EXPLAINER_KEYS, loadAdvicePatterns, loadEvalCases, loadExplainers, loadGoldenSet, parseCsv } from '../pipeline/loading/fixtures';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona, TEMPLATE_IDS } from '../pipeline/loading/personas';
import { setupDatabase, type SeedSummary } from '../pipeline/loading/seed';
import { loadMarket } from '../pipeline/loading/raw';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';

let db: Db;
let summary: SeedSummary;

async function rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function count(sql: string, params?: unknown[]): Promise<number> {
  return Number((await rows<{ n: number }>(sql, params))[0].n);
}

beforeAll(async () => {
  db = pgliteDb();
  summary = await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('dates', () => {
  it('clamps to the end of shorter months', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-27', -7)).toBe('2026-03-27');
  });

  it('lists monthly instalments from the first date on or after the start', () => {
    expect(monthlyDueDates('2026-03-27', 2, TODAY)).toEqual([
      '2026-04-02', '2026-05-02', '2026-06-02', '2026-07-02', '2026-08-02', '2026-09-02', '2026-10-02',
    ]);
  });
});

describe('demo market', () => {
  it('loads 40 funds with 30 months of daily NAVs ending today, and weekly ones back to 6 years', async () => {
    const days = dateRange(addMonths(TODAY, -30), TODAY).length;
    const daily = await rows<{ n: number; last: string }>(
      'SELECT count(*)::int AS n, max(nav_date)::text AS last FROM nav_history WHERE nav_date >= $1 GROUP BY fund_id ORDER BY fund_id',
      [addMonths(TODAY, -30)],
    );
    expect(daily).toHaveLength(40);
    for (const f of daily) expect(f).toEqual({ n: days, last: TODAY });
    const older = await rows<{ first: string; gaps: number[] }>(
      `SELECT min(nav_date)::text AS first, array_agg(DISTINCT gap) AS gaps FROM (
         SELECT nav_date, nav_date - lag(nav_date) OVER (PARTITION BY fund_id ORDER BY nav_date) AS gap FROM nav_history WHERE nav_date <= $1
       ) t`,
      [addMonths(TODAY, -30)],
    );
    expect(older[0].first <= addDays(addMonths(TODAY, -72), 7)).toBe(true);
    expect(older[0].gaps.filter((g) => g !== null)).toEqual([7]);
    expect(summary.navRows).toBe(Number((await rows<{ n: number }>('SELECT count(*)::int AS n FROM nav_history'))[0].n));
  });

  it("ends every fund with its own demo fall over the last 4 weeks, and keeps the liquid fund steady", async () => {
    const market = loadMarket();
    const funds = await rows<{ id: number; category: string; now: string; before: string }>(
      `SELECT f.id, f.category, n1.nav::text AS now, n0.nav::text AS before
       FROM funds f
       JOIN nav_history n1 ON n1.fund_id = f.id AND n1.nav_date = $1
       JOIN nav_history n0 ON n0.fund_id = f.id AND n0.nav_date = $2`,
      [TODAY, addDays(TODAY, -28)],
    );
    expect(funds).toHaveLength(40);
    for (const f of funds) {
      const fall = 1 - Number(f.now) / Number(f.before);
      const range = market.funds.find((m) => m.id === f.id)!.walk.end_fall;
      if (f.category === 'Liquid') expect(Math.abs(fall)).toBeLessThan(0.01);
      else {
        expect(fall).toBeGreaterThanOrEqual(range![0] - 0.0005);
        expect(fall).toBeLessThanOrEqual(range![1] + 0.0005);
      }
    }
  });

  it('joins the older weekly NAVs to the daily ones without a jump', async () => {
    const [edge] = await rows<{ before: string; after: string }>(
      `SELECT (SELECT nav::text FROM nav_history WHERE fund_id = 1 AND nav_date < $1 ORDER BY nav_date DESC LIMIT 1) AS before,
         (SELECT nav::text FROM nav_history WHERE fund_id = 1 AND nav_date = $1) AS after`,
      [addMonths(TODAY, -30)],
    );
    expect(Math.abs(Number(edge.before) / Number(edge.after) - 1)).toBeLessThan(0.1);
    expect(Number(edge.after)).toBe(52.4);
  });

  it('gives the same NAVs on every run (fixed seed)', async () => {
    const before = await rows('SELECT fund_id, nav_date::text, nav::text FROM nav_history WHERE nav_date = $1 ORDER BY fund_id', [TODAY]);
    await setupDatabase(db, { today: TODAY });
    const after = await rows('SELECT fund_id, nav_date::text, nav::text FROM nav_history WHERE nav_date = $1 ORDER BY fund_id', [TODAY]);
    expect(after).toEqual(before);
  }, 60_000);

  it('loads 22 made-up assets with a year of prices, and 3 IPOs', async () => {
    const kinds = await rows<{ kind: string; n: number }>('SELECT kind, count(*)::int AS n FROM assets GROUP BY kind ORDER BY kind');
    expect(kinds).toEqual([
      { kind: 'bond', n: 3 }, { kind: 'etf', n: 4 }, { kind: 'gold', n: 1 },
      { kind: 'silver', n: 1 }, { kind: 'stock', n: 8 }, { kind: 'us_stock', n: 5 },
    ]);
    const days = dateRange(addMonths(TODAY, -12), TODAY).length;
    expect(await count('SELECT count(*)::int AS n FROM asset_prices')).toBe(22 * days);
    const ipos = await rows<{ status: string; opens_on: string; closes_on: string }>(
      'SELECT status, opens_on::text, closes_on::text FROM ipos ORDER BY id',
    );
    expect(ipos.map((i) => i.status)).toEqual(['open', 'upcoming', 'closed']);
    expect(ipos[0].opens_on <= TODAY && TODAY <= ipos[0].closes_on).toBe(true);
  });
});

describe('persona templates', () => {
  async function sipsOf(personaKey: keyof typeof TEMPLATE_IDS) {
    return rows<{ id: number; fund: string; goal: string | null; target: string | null; instalments: number; invested: number; skipped: number }>(
      `SELECT s.id, f.name AS fund, g.name AS goal, g.target_month::text AS target,
         (SELECT count(*)::int FROM instalments i WHERE i.sip_id = s.id) AS instalments,
         (SELECT coalesce(sum(amount), 0)::int FROM instalments i WHERE i.sip_id = s.id) AS invested,
         (SELECT count(*)::int FROM sip_events e WHERE e.sip_id = s.id AND e.kind = 'skipped') AS skipped
       FROM sips s JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.investor_id = $1 ORDER BY s.id`,
      [TEMPLATE_IDS[personaKey]],
    );
  }

  it('seeds Riya: Banyan first, 7 of 60 paid towards a Mar 2031 home goal', async () => {
    expect(await sipsOf('riya')).toMatchObject([
      { fund: 'Banyan Flexi Cap Fund', goal: 'Home down payment', target: '2031-03-01', instalments: 7, invested: 14000, skipped: 0 },
      { fund: 'Harbor Liquid Fund', goal: 'Emergency fund', target: null, instalments: 4, invested: 4000 },
      { fund: 'Kestrel Nifty 50 Index Fund', goal: null, instalments: 3, invested: 4500 },
    ]);
    expect(await rows('SELECT method FROM mandates WHERE investor_id = $1', [TEMPLATE_IDS.riya])).toEqual([{ method: 'UPI' }]);
  });

  it('seeds Arjun: 8 months with one skipped instalment, NACH autopay', async () => {
    const [sip] = await sipsOf('arjun');
    expect(sip).toMatchObject({ fund: 'Monsoon Midcap Fund', goal: 'Home down payment', target: '2030-12-01', instalments: 7, skipped: 1 });
    const due = monthlyDueDates(addMonths(TODAY, -8), 10, TODAY);
    const [event] = await rows<{ detail: { due_on: string } }>('SELECT detail FROM sip_events WHERE sip_id = $1', [sip.id]);
    expect(event.detail.due_on).toBe(due[4]);
    expect(await count('SELECT count(*)::int AS n FROM instalments WHERE sip_id = $1 AND due_on = $2', [sip.id, due[4]])).toBe(0);
    expect(await rows('SELECT method FROM mandates WHERE investor_id = $1', [TEMPLATE_IDS.arjun])).toEqual([{ method: 'NACH' }]);
  });

  it('seeds Meera: two SIPs sharing one retirement goal, two demo orders and a watchlist item', async () => {
    const sips = await sipsOf('meera');
    expect(sips).toMatchObject([
      { fund: 'Kestrel Nifty 50 Index Fund', goal: 'Retirement', target: '2056-03-01', instalments: 11 },
      { fund: 'Lotus ELSS Tax Saver Fund', goal: 'Retirement', target: '2056-03-01', instalments: 6 },
    ]);
    expect(await count('SELECT count(*)::int AS n FROM goals WHERE investor_id = $1', [TEMPLATE_IDS.meera])).toBe(1);
    const priced = await rows<{ matches: boolean }>(
      `SELECT p.price = o.price AS matches FROM demo_orders o
       JOIN asset_prices p ON p.asset_id = o.asset_id AND p.price_date = (o.created_at AT TIME ZONE 'Asia/Kolkata')::date
       WHERE o.investor_id = $1`,
      [TEMPLATE_IDS.meera],
    );
    expect(priced).toEqual([{ matches: true }, { matches: true }]);
    expect(await rows('SELECT a.symbol FROM watchlist w JOIN assets a ON a.id = w.asset_id WHERE w.investor_id = $1', [TEMPLATE_IDS.meera])).toEqual([
      { symbol: 'FERNP' },
    ]);
  });

  it("prices every instalment at that day's NAV", async () => {
    const wrong = await count(
      `SELECT count(*)::int AS n FROM instalments i
       JOIN sips s ON s.id = i.sip_id
       JOIN nav_history n ON n.fund_id = s.fund_id AND n.nav_date = i.due_on
       WHERE i.nav <> n.nav OR i.units <> round(i.amount::numeric / n.nav, 4) OR i.paid_on <> i.due_on`,
    );
    expect(wrong).toBe(0);
  });

  it('stores no totals, returns, planned amounts or pass rates (PRD Appendix B)', async () => {
    const derived = await rows<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name ~ '(total|return|planned|pass_rate|status)'`,
    );
    // ipos.status is in the build spec's schema; it is a fixed label of the made-up IPO, not a computed result.
    expect(derived).toEqual([{ table_name: 'ipos', column_name: 'status' }]);
  });

  it('rebuilds templates on re-run without duplicating them', async () => {
    await setupDatabase(db, { today: TODAY });
    expect(await count('SELECT count(*)::int AS n FROM investors WHERE id = ANY($1::uuid[])', [Object.values(TEMPLATE_IDS)])).toBe(Object.keys(TEMPLATE_IDS).length);
    expect(await count('SELECT count(*)::int AS n FROM sips WHERE investor_id = $1', [TEMPLATE_IDS.riya])).toBe(3);
    expect(await count('SELECT count(*)::int AS n FROM funds')).toBe(40);
  }, 60_000);
});

describe('per-visitor copy', () => {
  async function snapshot(investorId: string) {
    return rows(
      `SELECT f.name AS fund, s.amount, s.day_of_month, s.started_on::text, g.name AS goal, g.target_month::text AS target,
         (SELECT count(*)::int FROM instalments i WHERE i.sip_id = s.id) AS instalments,
         (SELECT count(*)::int FROM sip_events e WHERE e.sip_id = s.id) AS events
       FROM sips s JOIN funds f ON f.id = s.fund_id LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.investor_id = $1 ORDER BY s.id`,
      [investorId],
    );
  }

  it('copies each persona into a fresh investor with the same facts', async () => {
    for (const key of ['riya', 'arjun', 'meera'] as const) {
      const visitor = await clonePersona(db, key);
      expect(visitor).not.toBe(TEMPLATE_IDS[key]);
      expect(await rows('SELECT persona_key FROM investors WHERE id = $1', [visitor])).toEqual([{ persona_key: key }]);
      expect(await snapshot(visitor)).toEqual(await snapshot(TEMPLATE_IDS[key]));
      for (const table of ['mandates', 'demo_orders', 'watchlist']) {
        const sql = `SELECT count(*)::int AS n FROM ${table} WHERE investor_id = $1`;
        expect(await count(sql, [visitor])).toBe(await count(sql, [TEMPLATE_IDS[key]]));
      }
    }
  });

  it('keeps two visitors and the template apart', async () => {
    const a = await clonePersona(db, 'riya');
    const b = await clonePersona(db, 'riya');
    const [sipA] = await rows<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [a]);
    await db.query("INSERT INTO sip_events (sip_id, kind) VALUES ($1, 'cancelled')", [sipA.id]);

    const cancelled = 'SELECT count(*)::int AS n FROM sip_events e JOIN sips s ON s.id = e.sip_id WHERE s.investor_id = $1 AND e.kind = $2';
    expect(await count(cancelled, [a, 'cancelled'])).toBe(1);
    expect(await count(cancelled, [b, 'cancelled'])).toBe(0);
    expect(await count(cancelled, [TEMPLATE_IDS.riya, 'cancelled'])).toBe(0);
  });

  it('rejects an unknown persona', async () => {
    await expect(clonePersona(db, 'rahul')).rejects.toThrow('Unknown persona');
  });
});

describe('demo market fall', () => {
  it('adds a -6% day for every fund but the liquid one, which stays flat, for this visitor only', async () => {
    const visitor = await clonePersona(db, 'riya');
    const other = await clonePersona(db, 'riya');
    const latest = await rows<{ fund_id: number; nav: string; category: string }>(
      'SELECT n.fund_id, n.nav::text, f.category FROM nav_history n JOIN funds f ON f.id = n.fund_id WHERE n.nav_date = $1 ORDER BY n.fund_id',
      [TODAY],
    );
    const move = (i: number) => (latest[i].category === 'Liquid' ? 1 : 0.94);
    expect(latest.filter((f) => f.category === 'Liquid')).toHaveLength(1);

    const first = await applyMarketFall(db, visitor);
    expect(first).toHaveLength(40);
    first.forEach((row, i) => {
      expect(row.fund_id).toBe(latest[i].fund_id);
      expect(row.nav_date).toBe(addDays(TODAY, 1));
      expect(Number(row.nav)).toBeCloseTo(Number(latest[i].nav) * move(i), 4);
    });

    const second = await applyMarketFall(db, visitor);
    second.forEach((row, i) => {
      expect(row.nav_date).toBe(addDays(TODAY, 2));
      expect(Number(row.nav)).toBeCloseTo(Number(first[i].nav) * move(i), 4);
    });

    expect(await count('SELECT count(*)::int AS n FROM demo_nav_history WHERE investor_id = $1', [visitor])).toBe(80);
    expect(await count('SELECT count(*)::int AS n FROM demo_nav_history WHERE investor_id = $1', [other])).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM nav_history WHERE nav_date > $1', [TODAY])).toBe(0);
  });

  it('refuses to change a persona template', async () => {
    await expect(applyMarketFall(db, TEMPLATE_IDS.riya)).rejects.toThrow('read-only');
  });
});

describe('fixed text and eval fixtures', () => {
  it('loads the four explainers', () => {
    const explainers = loadExplainers();
    expect(Object.keys(explainers)).toEqual([...EXPLAINER_KEYS]);
    expect(explainers.stop.text).toContain('does not refund any money');
  });

  it('flags advice in English, Hindi and Hinglish, but not the disclaimer or plain facts', () => {
    const patterns = loadAdvicePatterns();
    const isAdvice = (text: string) => patterns.some((p) => p.regex.test(text));
    for (const text of ['You should stop this SIP.', 'Returns are GUARANTEED.', 'Abhi SIP band kar do.', 'यह फंड खरीद लो', 'This fund will double.',
      'Time ke saath normal ho jayega.', 'Thoda ruko, recover ho jayega.', 'The market will recover.', 'बाज़ार नॉर्मल हो जाएगा']) {
      expect(isAdvice(text), text).toBe(true);
    }
    for (const text of ['This is not investment advice.', 'Your goal is 4 years 5 months away.', 'You have paid 7 of 60 instalments.']) {
      expect(isAdvice(text), text).toBe(false);
    }
  });

  it('loads the 16 safety and routing cases', () => {
    const cases = loadEvalCases();
    expect(cases.map((c) => c.id)).toEqual(Array.from({ length: 16 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`));
    expect(cases.filter((c) => c.expected.outcome === 'declined').map((c) => c.id)).toEqual(['s09', 's10', 's11', 's12', 's13']);
  });

  it('reads the 20 hand-labelled golden-set posts', () => {
    const golden = loadGoldenSet();
    expect(golden).toMatchObject({ labelled: 20, skipped: 0 });
    expect(golden.rows.map((r) => r.id)).toEqual(Array.from({ length: 20 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`));
    expect(parseCsv('a,b\n"x, ""y""",z\r\n')).toEqual([['a', 'b'], ['x, "y"', 'z']]);
  });
});

describe('the situation personas', () => {
  it('gives Kabir no SIPs, Sana 2 instalments to go, Vikram a stopped SIP and Dev a large one', async () => {
    const { retrieveFacts } = await import('../pipeline/retrieval/facts');
    const sipOf = async (key: keyof typeof TEMPLATE_IDS) =>
      (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [TEMPLATE_IDS[key]])).rows[0];
    expect(await sipOf('kabir')).toBeUndefined();

    const sana = await retrieveFacts(db, TEMPLATE_IDS.sana, (await sipOf('sana')).id, TODAY);
    if (sana.status !== 'ok') throw new Error(sana.status);
    expect(sana.facts.instalments_planned! - sana.facts.instalments_paid).toBe(2);

    const vikram = await retrieveFacts(db, TEMPLATE_IDS.vikram, (await sipOf('vikram')).id, TODAY);
    expect(vikram.status).toBe('stopped');
    if (vikram.status === 'not_found') throw new Error('not found');
    // Started 10 months ago, stopped 2 months ago: 8 instalments, and the units are still held.
    expect(vikram.facts).toMatchObject({ instalments_paid: 8, next_due_date: null });
    expect(vikram.facts.current_value).toBeGreaterThan(0);

    const dev = await retrieveFacts(db, TEMPLATE_IDS.dev, (await sipOf('dev')).id, TODAY);
    expect(dev.status === 'ok' && dev.facts.amount).toBe(25_000);
  });
});
