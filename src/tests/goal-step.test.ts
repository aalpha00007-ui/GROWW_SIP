import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { addToCart, cartView } from '../server/cart';
import { eventReport, logBrowserEvent, logEvent, tooltipDismissed } from '../server/events';
import { fundPage, startSip } from '../server/funds';
import { homeView } from '../server/home';
import { demoBalance } from '../server/shell';
import { loadSip, sipView } from '../server/sip';
import { parseGoal, stopSip } from '../server/sip-actions';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

const events = async (investorId: string) =>
  (await db.query<{ event: string; detail: Record<string, unknown> }>('SELECT event, detail FROM app_events WHERE investor_id = $1 ORDER BY id', [investorId])).rows;

/** A new demo account made on the test's day, so its demo balance counts what it pays from TODAY on. */
async function newAccount(): Promise<string> {
  const id = await clonePersona(db, 'kabir');
  await db.query("UPDATE investors SET created_at = $2::date + time '09:00' WHERE id = $1", [id, TODAY]);
  return id;
}

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('The goal chips', () => {
  const ctx = { today: TODAY, firstDue: '2026-11-04' };

  it('offers 8 goals: named ones keep their label, "Something else" takes free text in any language', () => {
    expect(parseGoal({ kind: 'retirement', targetMonth: '2056-03' }, ctx)).toEqual({
      ok: true,
      goal: { kind: 'retirement', name: 'Retirement', target: '2056-03-01', targetAmount: null },
    });
    expect(parseGoal({ kind: 'wedding', targetMonth: '2029-02' }, ctx)).toMatchObject({ ok: true, goal: { kind: 'custom', name: 'Wedding' } });
    expect(parseGoal({ kind: 'travel', name: 'ignored' }, ctx)).toMatchObject({ ok: true, goal: { kind: 'custom', name: 'Travel' } });
    expect(parseGoal({ kind: 'custom', name: 'घर की मरम्मत' }, ctx)).toMatchObject({ ok: true, goal: { kind: 'custom', name: 'घर की मरम्मत' } });
  });

  it('takes an optional whole-rupee target amount', () => {
    expect(parseGoal({ kind: 'home', targetMonth: '2031-03', targetAmount: 1_000_000 }, ctx)).toMatchObject({ ok: true, goal: { targetAmount: 1_000_000 } });
    expect(parseGoal({ kind: 'home', targetAmount: 50 }, ctx)).toMatchObject({ ok: false });
    expect(parseGoal({ kind: 'home', targetAmount: 12.5 }, ctx)).toMatchObject({ ok: false });
  });
});

describe('Start SIP with the goal step', () => {
  it('starts with a goal: first instalment paid from the demo balance, goal saved with its target, events logged', async () => {
    const visitor = await newAccount();
    expect(await demoBalance(db, visitor)).toBe(100_000);
    const started = await startSip(
      db,
      visitor,
      { fundId: 9, amount: 3000, day: 4, goal: { kind: 'retirement', targetMonth: '2056-03', targetAmount: 5_000_000 }, goalStep: 'saved' },
      TODAY,
    );
    if (started.status !== 200) throw new Error(started.error);
    expect(await demoBalance(db, visitor)).toBe(97_000);
    const [goal] = (await db.query<{ name: string; target_amount: string }>('SELECT g.name, g.target_amount::text FROM sips s JOIN goals g ON g.id = s.goal_id WHERE s.id = $1', [started.id])).rows;
    expect(goal).toEqual({ name: 'Retirement', target_amount: '5000000' });
    expect((await events(visitor)).map((e) => e.event)).toEqual(['sip_started', 'goal_saved']);
    expect((await events(visitor))[0].detail).toMatchObject({ sip_id: started.id, with_goal: true, source: 'fund_page' });
  });

  it('"Skip for now" starts the SIP in one call with no goal, and logs goal_skipped', async () => {
    const visitor = await newAccount();
    const started = await startSip(db, visitor, { fundId: 9, amount: 3000, day: 4, goal: null, goalStep: 'skipped' }, TODAY);
    expect(started.status).toBe(200);
    expect((await events(visitor)).map((e) => e.event)).toEqual(['sip_started', 'goal_skipped']);
    expect((await homeView(db, visitor, TODAY)).goals).toEqual([]);
  });

  it('refuses a first instalment bigger than the demo balance', async () => {
    const visitor = await newAccount();
    await startSip(db, visitor, { fundId: 9, amount: 100_000, day: 4 }, TODAY);
    expect(await startSip(db, visitor, { fundId: 9, amount: 500, day: 4 }, TODAY)).toEqual({
      status: 400,
      error: 'The first instalment of ₹500 is more than your demo balance of ₹0.',
    });
  });

  it('shows a dip next to the goal for a brand-new account after a market fall', async () => {
    const visitor = await newAccount();
    const started = await startSip(db, visitor, { fundId: 1, amount: 3000, day: 4, goal: { kind: 'home', targetMonth: '2031-03' } }, TODAY);
    if (started.status !== 200) throw new Error(started.error);
    // Before the fall the SIP is worth what was put in: no dip button.
    expect((await homeView(db, visitor, TODAY)).goals[0].dipSipId).toBeNull();
    await applyMarketFall(db, visitor);
    const card = (await homeView(db, visitor, TODAY)).goals[0];
    expect(card.change?.direction).toBe('down');
    expect(card.dipSipId).toBe(started.id);
    expect(card.change?.text).toMatch(/^-₹180 \(-6\.0%\)$/);
    const sip = sipView((await loadSip(db, visitor, started.id, TODAY))!, TODAY);
    expect(sip.explainDip).toBe(true);
    expect(sip.worstFall).toBe('-6.0%');
  });

  it('starts a SIP from the cart with the goal saved on the item, and takes the item out of the cart', async () => {
    const visitor = await newAccount();
    await addToCart(db, visitor, { fundId: 2, kind: 'sip', amount: 2000, day: 10, goal: { kind: 'car', targetMonth: '2029-06' } }, TODAY);
    const [item] = (await cartView(db, visitor)).items;
    expect(item.goal?.text).toBe('For: Car · by Jun 2029');
    const started = await startSip(db, visitor, { fundId: item.fundId, amount: item.amountValue, day: item.day, goal: item.goal?.body, source: 'cart', cartItemId: item.id }, TODAY);
    expect(started.status).toBe(200);
    expect((await cartView(db, visitor)).items).toEqual([]);
    expect((await events(visitor))[0].detail).toMatchObject({ source: 'cart', with_goal: true });
  });
});

describe('Funnel events', () => {
  it('shows the tooltip until "Got it", and only lets the browser log its own events', async () => {
    const visitor = await clonePersona(db, 'kabir');
    expect((await fundPage(db, visitor, 1, TODAY))?.box.showGoalTip).toBe(true);
    expect(await logBrowserEvent(db, visitor, { event: 'goal_tooltip_dismissed' })).toMatchObject({ status: 200 });
    expect(await tooltipDismissed(db, visitor)).toBe(true);
    expect((await fundPage(db, visitor, 1, TODAY))?.box.showGoalTip).toBe(false);
    expect(await logBrowserEvent(db, visitor, { event: 'sip_started' })).toEqual({ status: 400, error: 'Unknown event.' });
    expect(await logBrowserEvent(db, visitor, { event: 'goal_step_shown', where: 'fund page; drop table' })).toMatchObject({ status: 200 });
    expect((await events(visitor)).at(-1)).toEqual({ event: 'goal_step_shown', detail: {} });
  });

  it('logs a dip seen in context once a day, and a stop', async () => {
    const visitor = await clonePersona(db, 'riya');
    await logBrowserEvent(db, visitor, { event: 'dip_context_viewed', where: 'dashboard' });
    await logBrowserEvent(db, visitor, { event: 'dip_context_viewed', where: 'sip_page' });
    const sipId = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [visitor])).rows[0].id;
    await stopSip(db, visitor, sipId, undefined, TODAY);
    expect((await events(visitor)).map((e) => e.event)).toEqual(['dip_context_viewed', 'sip_stopped']);
  });

  it('counts each event and the goal-save rate, leaving out test visitors', async () => {
    const fresh = pgliteDb();
    await setupDatabase(fresh, { today: TODAY });
    const a = await clonePersona(fresh, 'kabir');
    const b = await clonePersona(fresh, 'kabir');
    const tester = await clonePersona(fresh, 'kabir');
    await fresh.query("UPDATE investors SET display_name = display_name || ' · CLI test' WHERE id = $1", [tester]);
    await startSip(fresh, a, { fundId: 1, amount: 1000, day: 4, goal: { kind: 'home', targetMonth: '2031-03' } }, TODAY);
    await startSip(fresh, a, { fundId: 2, amount: 1000, day: 4, goalStep: 'skipped' }, TODAY);
    await startSip(fresh, b, { fundId: 3, amount: 1000, day: 4, goal: { kind: 'wedding' } }, TODAY);
    await startSip(fresh, tester, { fundId: 3, amount: 1000, day: 4, goalStep: 'skipped' }, TODAY);
    await logEvent(fresh, a, 'goal_step_shown');

    const report = await eventReport(fresh);
    expect(report.counts.find((c) => c.event === 'sip_started')).toEqual({ event: 'sip_started', events: 3, investors: 2 });
    expect(report.counts.find((c) => c.event === 'goal_skipped')).toMatchObject({ events: 1 });
    expect(report.counts.find((c) => c.event === 'sip_kept')).toEqual({ event: 'sip_kept', events: 0, investors: 0 });
    expect(report).toMatchObject({ sipsStarted: 3, startedWithGoal: 2 });
    expect(report.goalSaveRate).toBeCloseTo(2 / 3, 5);
  }, 120_000);
});
