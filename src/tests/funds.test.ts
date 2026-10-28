import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { fundList, fundPage, goalPreview, startSip } from '../server/funds';
import { homeView } from '../server/home';
import { loadSip, sipView } from '../server/sip';
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
    expect(all.funds).toHaveLength(8);
    expect(all.categories).toEqual(['Equity', 'Index', 'ELSS', 'Liquid', 'Hybrid']);
    const equity = await fundList(db, riya, { category: 'Equity' });
    expect(equity.category).toBe('Equity');
    expect(equity.funds.every((f) => f.category === 'Equity')).toBe(true);
    expect((await fundList(db, riya, { category: 'Crypto', risk: 'Huge' })).funds).toHaveLength(8);
    expect((await fundList(db, riya, { risk: 'Low to Moderate' })).funds.map((f) => f.name)).toContain('Harbor Liquid Fund');
  });

  it('shows the fund facts and a SIP box with nothing preselected for the goal', async () => {
    const fund = await fundPage(db, riya, 1, TODAY);
    expect(fund).toMatchObject({ name: 'Banyan Flexi Cap Fund', navDate: 'NAV on 27 Oct 2026' });
    expect(fund?.facts.find((f) => f.label === 'Minimum SIP')?.value).toBe('₹500');
    expect(fund?.box).toMatchObject({ minAmount: 500, defaultAmount: 1000, defaultDay: 27, mandate: 'Autopay from Demo Bank savings (UPI)' });
    expect(fund?.box.days).toHaveLength(28);
    expect(fund?.box.goalOptions.kinds.map((k) => k.label)).toEqual(['Home', 'Education', 'Retirement', 'Emergency fund', 'Something else']);
    expect(await fundPage(db, riya, 999, TODAY)).toBeNull();
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
