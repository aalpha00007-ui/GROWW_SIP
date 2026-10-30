import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { addToCart, cartView, removeFromCart } from '../server/cart';
import { collection, exploreFunds, fundList, fundPage, goalPreview, investOnce, startSip } from '../server/funds';
import { homeView } from '../server/home';
import { investmentsView, xirr } from '../server/investments';
import { loadSip, sipList, sipView } from '../server/sip';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;
let riya: string;

const sipCount = async (investorId: string) =>
  (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM sips WHERE investor_id = $1', [investorId])).rows[0].n;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
  riya = await clonePersona(db, 'riya');
}, 120_000);

describe('Explore and the fund page', () => {
  it('lists every fund and filters by category and risk, ignoring unknown filters', async () => {
    const all = await fundList(db, riya, {});
    expect(all.funds).toHaveLength(40);
    expect(all.categories).toEqual(['Equity', 'Index', 'ELSS', 'Liquid', 'Hybrid', 'Gold & Silver']);
    const equity = await fundList(db, riya, { category: 'Equity' });
    expect(equity.category).toBe('Equity');
    expect(equity.funds.every((f) => f.category === 'Equity')).toBe(true);
    expect((await fundList(db, riya, { category: 'Crypto', risk: 'Huge' })).funds).toHaveLength(40);
    expect((await fundList(db, riya, { risk: 'Low to Moderate' })).funds.map((f) => f.name)).toContain('Harbor Liquid Fund');
    expect(all.funds.every((f) => f.return3y !== null && /^[+-]?\d+\.\d%$/.test(f.return3y))).toBe(true);
  });

  it('shows 8 popular funds, 8 collections of 6-8 funds and the made-up new fund offers', async () => {
    const explore = await exploreFunds(db, riya);
    expect(explore.popular).toHaveLength(8);
    expect(explore.popular[0]).toMatchObject({ name: 'Kestrel Nifty 50 Index Fund', initials: 'KN' });
    expect(explore.collections.map((c) => c.label)).toEqual([
      'Highest 3Y return (demo)', 'Popular for SIPs', 'Gold & Silver', 'Large cap', 'Mid cap', 'Small cap', 'Index funds', 'Tax saver (ELSS)',
    ]);
    for (const c of explore.collections) {
      const found = await collection(db, riya, c.key);
      expect(found!.funds.length).toBeGreaterThanOrEqual(6);
      expect(found!.funds.length).toBeLessThanOrEqual(8);
    }
    const best = (await collection(db, riya, 'high-return'))!.funds.map((f) => parseFloat(f.return3y!));
    expect(best).toEqual([...best].sort((x, y) => y - x));
    expect(await collection(db, riya, 'crypto')).toBeNull();
    expect(explore.nfos.length).toBeGreaterThanOrEqual(4);
    expect(explore.nfos[0]).toMatchObject({ closes: 'Closes in 6 days', minAmount: 'Min. ₹500' });
  });

  it('shows the fund page: stats, 6 years of NAVs for the chart, the demo 3Y return and an order card with no goal preselected', async () => {
    const fund = await fundPage(db, riya, 1, TODAY);
    expect(fund).toMatchObject({ name: 'Banyan Flexi Cap Fund', initials: 'BF', navDate: 'NAV on 27 Oct 2026' });
    expect(fund?.stats.map((s) => [s.label, s.value])).toEqual([
      ['NAV', fund!.nav], ['Min. for SIP', '₹500'], ['Fund size', '₹18,420 Cr'], ['Expense ratio', '0.72%'], ['Rating', '4 of 5'],
    ]);
    expect(fund!.chart[0][0] <= '2020-11-03').toBe(true);
    expect(fund!.chart.at(-1)![0]).toBe('2026-10-27');
    expect(fund!.chart.at(-1)![1]).toBeCloseTo(Number(fund!.nav.replace(/[₹,]/g, '')), 2);
    expect(fund?.rate3yText).toBe(`${fund!.rate3y! > 0 ? '+' : ''}${(fund!.rate3y! * 100).toFixed(1)}%`);
    expect(fund?.box).toMatchObject({
      minAmount: 500, defaultAmount: 1000, defaultDay: 27, mandate: 'Pay via mandate · Demo Bank ····0000', balance: 'Pay from demo balance · ₹1,00,000',
    });
    expect(fund?.box.quickAdd.map((q) => q.label)).toEqual(['+₹1,000', '+₹2,000', '+₹5,000']);
    expect(fund?.box.days).toHaveLength(28);
    expect(fund?.box.days[3].label).toBe('Monthly on 4th');
    expect(fund?.box.goalOptions.kinds.map((k) => k.label)).toEqual(['Home', 'Education', 'Retirement', 'Emergency fund', 'Something else']);
    expect(await fundPage(db, riya, 999, TODAY)).toBeNull();
  });
});

describe('One-time investments and the cart', () => {
  it('invests once from the demo balance, which then shows in Your investments', async () => {
    const visitor = await clonePersona(db, 'kabir');
    expect(await investmentsView(db, visitor)).toBeNull();
    const done = await investOnce(db, visitor, { fundId: 2, amount: 5000 });
    expect(done).toMatchObject({ status: 200 });
    const view = await investmentsView(db, visitor);
    expect(view?.rows.find((r) => r.label === 'Invested')?.value).toBe('₹5,000');
    expect(view?.holdings).toMatchObject([{ sipId: null, fund: 'Kestrel Nifty 50 Index Fund', kind: 'One-time', goal: null, putIn: '₹5,000' }]);
    expect(await investOnce(db, visitor, { fundId: 2, amount: 100_000 })).toEqual({ status: 400, error: 'That is more than your demo balance of ₹95,000.' });
    expect((await investOnce(db, visitor, { fundId: 2, amount: 10 })).status).toBe(400);
    expect((await investOnce(db, visitor, { fundId: 999, amount: 5000 })).status).toBe(404);
  });

  it('adds SIPs and one-time investments to the cart and removes them', async () => {
    const visitor = await clonePersona(db, 'kabir');
    expect(await addToCart(db, visitor, { fundId: 3, kind: 'sip', amount: 2000, day: 4 })).toMatchObject({ status: 200 });
    expect(await addToCart(db, visitor, { fundId: 5, kind: 'one_time', amount: 3000 })).toMatchObject({ status: 200 });
    expect((await addToCart(db, visitor, { fundId: 3, kind: 'weekly', amount: 2000 })).status).toBe(400);
    expect((await addToCart(db, visitor, { fundId: 3, kind: 'sip', amount: 2000, day: 31 })).status).toBe(400);
    const cart = await cartView(db, visitor);
    expect(cart.items.map((i) => [i.fund, i.label, i.amount])).toEqual([
      ['Monsoon Midcap Fund', 'Monthly SIP · on the 4th', '₹2,000'],
      ['Harbor Liquid Fund', 'One-time', '₹3,000'],
    ]);
    expect(cart.total).toBe('₹5,000');
    expect(await removeFromCart(db, riya, cart.items[0].id)).toMatchObject({ status: 404 });
    expect(await removeFromCart(db, visitor, cart.items[0].id)).toMatchObject({ status: 200 });
    expect((await cartView(db, visitor)).items).toHaveLength(1);
  });
});

describe('Your investments', () => {
  it('sums the SIPs: current value, the goals they are for, 1D and total returns, invested and XIRR', async () => {
    const view = await investmentsView(db, riya);
    const home = await homeView(db, riya, TODAY);
    expect(view?.current).toBe(home.summary?.value);
    expect(view?.rows.find((r) => r.label === 'Invested')?.value).toBe(home.summary?.putIn);
    expect(view?.goals.length).toBeGreaterThan(0);
    expect(view?.goals.every((g) => g.startsWith('For: '))).toBe(true);
    expect(view?.rows.map((r) => r.label)).toEqual(['1D returns', 'Total returns', 'Invested', 'XIRR']);
    expect(view?.rows.find((r) => r.label === 'XIRR')?.value).toMatch(/^[+-]?\d+\.\d%$/);
    expect(view?.holdings).toHaveLength(3);
  });

  it('works out XIRR, and waits 30 days before showing one', () => {
    // ₹1,000 that grows to ₹1,100 in a year is 10% a year.
    expect(xirr([{ date: '2025-10-27', amount: -1000 }, { date: '2026-10-27', amount: 1100 }])).toBeCloseTo(0.1, 4);
    expect(xirr([{ date: '2026-10-20', amount: -1000 }, { date: '2026-10-27', amount: 940 }])).toBeNull();
  });
});

describe('The SIPs tab', () => {
  it('lists each SIP with its date, next instalment, goal or none, and what can be done', async () => {
    const visitor = await clonePersona(db, 'riya');
    const started = await startSip(db, visitor, { fundId: 6, amount: 1500, day: 4 }, TODAY);
    if (started.status !== 200) throw new Error(started.error);
    const rows = await sipList(db, visitor, TODAY);
    expect(rows.find((r) => r.id === started.id)).toMatchObject({
      fund: 'Sundar Small Cap Fund', amount: '₹1,500', date: 'Monthly on 4th', next: '4 Nov 2026', status: 'active', goal: null, canPause: true, canStop: true,
    });
    expect(rows.filter((r) => r.goal !== null).length).toBeGreaterThan(0);
  });
});

describe('The goal line (spec §2A)', () => {
  it('says what ₹2,000 a month puts in by a target 5 years out: 60 instalments, ₹1,20,000', async () => {
    expect(await goalPreview(db, { fundId: 1, amount: 2000, day: 2, targetMonth: '2031-10' }, TODAY)).toEqual({
      status: 200,
      instalments: 60,
      putInTotal: '₹1,20,000',
      line: '60 x ₹2,000 = ₹1,20,000 put in by Oct 2031. That is what you put in, not what it will be worth.',
    });
    // A date still to come this month makes the first instalment this month: one more.
    expect(await goalPreview(db, { fundId: 1, amount: 2000, day: 28, targetMonth: '2031-10' }, TODAY)).toMatchObject({ instalments: 61 });
  });

  it('refuses a low amount, a bad date, a past target and an unknown fund', async () => {
    expect(await goalPreview(db, { fundId: 1, amount: 50, day: 2, targetMonth: '2031-10' }, TODAY)).toEqual({
      status: 400,
      error: 'Enter a whole amount from ₹500 to ₹1,00,000.',
    });
    expect((await goalPreview(db, { fundId: 1, amount: 2000, day: 31, targetMonth: '2031-10' }, TODAY)).status).toBe(400);
    expect((await goalPreview(db, { fundId: 1, amount: 2000, day: 2, targetMonth: '2026-10' }, TODAY)).status).toBe(400);
    expect((await goalPreview(db, { fundId: 999, amount: 2000, day: 2, targetMonth: '2031-10' }, TODAY)).status).toBe(404);
  });
});

describe('Start SIP (PRD F2)', () => {
  it('starts a SIP with a goal, which shows on Home at once', async () => {
    const visitor = await clonePersona(db, 'riya');
    const started = await startSip(db, visitor, { fundId: 3, amount: 2000, frequency: 'monthly', day: 2, goal: { kind: 'education', targetMonth: '2031-10' } }, TODAY);
    if (started.status !== 200) throw new Error(started.error);

    const state = await loadSip(db, visitor, started.id, TODAY);
    const sip = sipView(state!, TODAY);
    expect(sip).toMatchObject({ fund: 'Monsoon Midcap Fund', amount: '₹2,000 a month', nextDue: '2 Nov 2026', hasGoal: true, change: null });
    expect(sip.goalHeader).toBe('This SIP is for Education · by Oct 2031 · 60 instalments to go');

    const card = (await homeView(db, visitor, TODAY)).goals.find((g) => g.name === 'Education');
    expect(card).toMatchObject({ paidLabel: '0 of 60 instalments paid', putIn: '₹0', planned: '₹1,20,000', change: null, dipSipId: null });
    // No dip to explain before the first instalment.
    expect(sip.explainDip).toBe(false);
  });

  it('starts a SIP with no goal, and Home counts it as one with no goal yet', async () => {
    const visitor = await clonePersona(db, 'riya');
    const started = await startSip(db, visitor, { fundId: 6, amount: 1500, day: 10 }, TODAY);
    expect(started.status).toBe(200);
    expect((await homeView(db, visitor, TODAY)).noGoal?.text).toBe('2 SIPs have no goal yet');
  });

  it('refuses a bad amount, date, frequency, fund or goal, and starts nothing', async () => {
    const visitor = await clonePersona(db, 'riya');
    const ok = { fundId: 1, amount: 2000, frequency: 'monthly', day: 2 };
    expect(await startSip(db, visitor, { ...ok, amount: 50 }, TODAY)).toEqual({ status: 400, error: 'Enter a whole amount from ₹500 to ₹1,00,000.' });
    expect(await startSip(db, visitor, { ...ok, day: 29 }, TODAY)).toEqual({ status: 400, error: 'Pick a date from the 1st to the 28th.' });
    expect(await startSip(db, visitor, { ...ok, frequency: 'weekly' }, TODAY)).toEqual({ status: 400, error: 'Only monthly SIPs are in this prototype.' });
    expect(await startSip(db, visitor, { ...ok, fundId: 999 }, TODAY)).toEqual({ status: 404, error: 'We could not find that fund.' });
    expect(await startSip(db, visitor, { ...ok, goal: { kind: 'custom', name: 'PAN ABCDE1234F' } }, TODAY)).toEqual({
      status: 400,
      error: "Please don't put personal details in a goal name.",
    });
    expect(await sipCount(visitor)).toBe(3);
  });
});
