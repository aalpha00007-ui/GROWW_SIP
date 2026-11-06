// The gap to a goal's target: plain arithmetic on instalments, the same in goal setup and Edit goal.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { clearSimulations, countSimulations } from '../server/clear-simulations';
import { goalPreview, investOnce, startSip } from '../server/funds';
import { goalGap, sipGoalPreview, validTarget } from '../server/goal-gap';
import { homeView } from '../server/home';
import { changeAmount, pauseSip, skipNext, stopSip } from '../server/sip-actions';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

async function riya() {
  const id = await clonePersona(db, 'riya');
  const [sip] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [id])).rows;
  return { id, sip: sip.id };
}

describe('The monthly hint', () => {
  const base = { plannedPutIn: 13_000, putIn: 0, remaining: 13, goalMonth: '2027-11-01' };

  it('shows no lower figure once the plan covers the target', () => {
    expect(goalGap({ ...base, target: 5_000 }).monthly).toBeNull();
    expect(goalGap({ ...base, target: 13_000 }).monthly).toBeNull();
  });

  it('shows no amount a SIP can not be set to', () => {
    expect(goalGap({ plannedPutIn: 6_000, putIn: 1_000, remaining: 3, target: 100_000_000, goalMonth: '2027-01-01' }).monthly).toBeNull();
    expect(goalGap({ plannedPutIn: 6_000, putIn: 0, remaining: 3, target: 300_000, goalMonth: '2027-01-01' }).monthly).toContain('about ₹1,00,000');
  });
});

describe('One-time money for the goal', () => {
  it('counts in the gap, and says so', () => {
    const gap = goalGap({ plannedPutIn: 13_000, putIn: 1_000, oneTime: 50_000, remaining: 12, target: 100_000, goalMonth: '2027-10-01' });
    expect(gap.line).toBe("Your planned instalments and one-time investments add up to ₹63,000 by Oct 2027. That's ₹37,000 short of your ₹1,00,000 target (no returns included).");
    expect(gap.monthly).toBe('To reach ₹1,00,000, the monthly amount would be about ₹4,084.');
  });

  it('can cover the target on its own', () => {
    const gap = goalGap({ plannedPutIn: 13_000, putIn: 1_000, oneTime: 90_000, remaining: 12, target: 100_000, goalMonth: '2027-10-01' });
    expect(gap.line).toContain('add up to ₹1,03,000, which covers your ₹1,00,000 target');
  });

  it('Edit goal agrees with the Dashboard once money is added to the goal', async () => {
    const id = await clonePersona(db, 'kabir');
    const sip = await startSip(db, id, { fundId: 1, amount: 1_000, frequency: 'monthly', day: 27, goal: { kind: 'home', targetMonth: '2027-10', targetAmount: 100_000 } }, TODAY);
    if (sip.status !== 200) throw new Error(sip.error);
    const preview = () => sipGoalPreview(db, id, sip.id, { targetMonth: '2027-10', target: 100_000 }, TODAY);
    expect(await preview()).toMatchObject({ gap: { line: expect.stringContaining("That's ₹87,000 short") } });
    const [{ goal_id: goalId }] = (await db.query<{ goal_id: number }>('SELECT goal_id FROM sips WHERE id = $1', [sip.id])).rows;
    expect((await investOnce(db, id, { fundId: 1, amount: 50_000, goal: { goalId } }, TODAY)).status).toBe(200);
    expect(await preview()).toMatchObject({ gap: { line: expect.stringContaining("add up to ₹63,000 by Oct 2027. That's ₹37,000 short") } });
    const [card] = (await homeView(db, id, TODAY)).goals;
    expect(card.planned).toBe('₹63,000');
  });
});

describe('goalGap', () => {
  const base = { plannedPutIn: 13_000, putIn: 0, remaining: 13, goalMonth: '2027-11-01' };

  it('says how far short the instalments fall', () => {
    expect(goalGap({ ...base, target: 50_000 })).toEqual({
      line: "Your planned instalments add up to ₹13,000 by Nov 2027. That's ₹37,000 short of your ₹50,000 target (instalments only, no returns included).",
      monthly: 'To reach ₹50,000 from instalments alone, the monthly amount would be about ₹3,847.',
    });
  });

  it('says when they cover it, exactly at the target too', () => {
    expect(goalGap({ ...base, target: 5_000 }).line).toBe('Your planned instalments add up to ₹13,000, which covers your ₹5,000 target (instalments only, no returns included).');
    expect(goalGap({ ...base, target: 13_000 }).line).toContain('which covers your ₹13,000 target');
  });

  it('works the monthly amount from what is left to put in, rounded up so it reaches the target', () => {
    expect(goalGap({ plannedPutIn: 7_000, putIn: 1_000, remaining: 12, target: 25_000, goalMonth: '2027-11-01' }).monthly).toContain('about ₹2,000');
    expect(goalGap({ ...base, target: 13_001 }).monthly).toContain('about ₹1,001');
  });

  it('gives no monthly amount with no instalment left, or the target already reached', () => {
    expect(goalGap({ plannedPutIn: 1_000, putIn: 1_000, remaining: 0, target: 5_000, goalMonth: '2027-11-01' }).monthly).toBeNull();
    expect(goalGap({ plannedPutIn: 9_000, putIn: 8_000, remaining: 1, target: 5_000, goalMonth: '2027-11-01' }).monthly).toBeNull();
  });

  it('never reads as advice, and never counts a return', () => {
    for (const target of [5_000, 50_000]) {
      const { line, monthly } = goalGap({ ...base, target });
      expect(line).toContain('(instalments only, no returns included)');
      expect(`${line} ${monthly}`).not.toMatch(/should|increase|recommend|need to|must|better|expected|assum/i);
    }
  });
});

describe('validTarget', () => {
  it('takes only an amount the goal editor would accept', () => {
    expect(validTarget('50000')).toBe(50_000);
    for (const bad of [null, '', '5', 'lots', '-1000', '1000000000']) expect(validTarget(bad), String(bad)).toBeNull();
  });
});

describe('Goal setup', () => {
  it('shows the gap only with a target', async () => {
    const preview = { fundId: 1, amount: 2000, day: 2, targetMonth: '2031-10' };
    expect(await goalPreview(db, { ...preview, target: null }, TODAY)).toMatchObject({ gap: null });
    expect(await goalPreview(db, { ...preview, target: 500_000 }, TODAY)).toMatchObject({
      plannedPutIn: 120_000,
      gap: {
        line: "Your planned instalments add up to ₹1,20,000 by Oct 2031. That's ₹3,80,000 short of your ₹5,00,000 target (instalments only, no returns included).",
        monthly: 'To reach ₹5,00,000 from instalments alone, the monthly amount would be about ₹8,334.',
      },
    });
  });
});

describe('Edit goal', () => {
  const preview = (id: string, sip: number, targetMonth: string | null, target: number | null, today = TODAY) => sipGoalPreview(db, id, sip, { targetMonth, target }, today);

  it('counts what is already put in plus the remaining instalments', async () => {
    const r = await riya();
    expect(await preview(r.id, r.sip, '2031-03', 200_000)).toEqual({
      status: 200,
      gap: {
        line: "Your planned instalments add up to ₹1,20,000 by Mar 2031. That's ₹80,000 short of your ₹2,00,000 target (instalments only, no returns included).",
        monthly: 'To reach ₹2,00,000 from instalments alone, the monthly amount would be about ₹3,510.',
      },
    });
  });

  it('follows the date being tried, not the saved one', async () => {
    const r = await riya();
    expect(await preview(r.id, r.sip, '2032-03', 100_000)).toMatchObject({ gap: { line: expect.stringContaining('₹1,44,000, which covers your ₹1,00,000 target') } });
  });

  it('leaves out scheduled skips, and uses the new amount for what is left', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.sip, TODAY);
    await pauseSip(db, r.id, r.sip, 2, TODAY);
    expect(await preview(r.id, r.sip, '2031-03', 500_000)).toMatchObject({ gap: { line: expect.stringContaining('add up to ₹1,14,000 by Mar 2031') } });
    await changeAmount(db, r.id, r.sip, 1000, TODAY);
    // ₹14,000 put in, and 50 instalments of ₹1,000 still to come.
    expect(await preview(r.id, r.sip, '2031-03', 500_000)).toMatchObject({ gap: { line: expect.stringContaining('add up to ₹64,000 by Mar 2031') } });
  });

  it('says the same as the goal card', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.sip, TODAY);
    const card = (await homeView(db, r.id, TODAY)).goals[0];
    expect(card.planned).toBe('₹1,18,000');
    expect(await preview(r.id, r.sip, '2031-03', 500_000)).toMatchObject({ gap: { line: expect.stringContaining(`add up to ${card.planned} by Mar 2031`) } });
  });

  it('on a stopped SIP, counts only what was put in, and offers no monthly amount', async () => {
    const r = await riya();
    await stopSip(db, r.id, r.sip, undefined, TODAY);
    expect(await preview(r.id, r.sip, '2031-03', 500_000)).toMatchObject({ gap: { line: expect.stringContaining('add up to ₹14,000 by Mar 2031'), monthly: null } });
  });

  it('shows nothing with no target or no date', async () => {
    const r = await riya();
    expect(await preview(r.id, r.sip, '2031-03', null)).toEqual({ status: 200, gap: null });
    expect(await preview(r.id, r.sip, null, 500_000)).toEqual({ status: 200, gap: null });
  });

  it("refuses a past date, and reads someone else's SIP as not found", async () => {
    const r = await riya();
    expect((await preview(r.id, r.sip, '2026-10', 500_000)).status).toBe(400);
    expect((await preview((await riya()).id, r.sip, '2031-03', 500_000)).status).toBe(404);
  });
});

describe('Clearing saved simulations', () => {
  it('puts an account back on seeded prices, and leaves other data alone', async () => {
    const r = await riya();
    const seeded = await homeView(db, r.id, TODAY);
    await applyMarketFall(db, r.id, TODAY);
    expect((await homeView(db, r.id, TODAY)).goals[0].value).not.toBe(seeded.goals[0].value);

    const counted = await countSimulations(db);
    expect(counted.rows).toBeGreaterThan(0);
    expect(await clearSimulations(db)).toEqual(counted);
    expect(await countSimulations(db)).toEqual({ rows: 0, accounts: 0 });

    const after = await homeView(db, r.id, TODAY);
    expect(after.goals[0]).toMatchObject({ value: seeded.goals[0].value, putIn: seeded.goals[0].putIn, paidLabel: seeded.goals[0].paidLabel });
  });

  it("keeps Riya's seeded dip, with no simulation at all", async () => {
    const r = await riya();
    const [goal] = (await homeView(db, r.id, TODAY)).goals;
    expect(goal.change?.direction).toBe('down');
    expect(goal.dipSipId).toBe(r.sip);
  });
});
