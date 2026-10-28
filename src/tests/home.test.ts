import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { homeView } from '../server/home';
import { inr, toRupeeSign } from '../server/money';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

const sipIds = async (investorId: string) =>
  (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id', [investorId])).rows.map((r) => r.id);

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('Home (PRD F4)', () => {
  it("shows Riya's two goals, the no-goal row and what is coming up", async () => {
    const riya = await clonePersona(db, 'riya');
    const [banyan, harbor, kestrel] = await sipIds(riya);
    const home = await homeView(db, riya, TODAY);

    expect(home.asOf).toBe('Numbers as of 27 Oct 2026');
    expect(home.demoNote).toBeNull();
    expect(home.goals.map((g) => g.name)).toEqual(['Home down payment', 'Emergency fund']);

    const [downPayment, emergency] = home.goals;
    expect(downPayment).toMatchObject({
      targetMonth: 'by Mar 2031',
      timeToGo: '4 years 5 months to go',
      paidLabel: '7 of 60 instalments paid',
      barPct: 11.7,
      putIn: '₹14,000',
      // 7 paid + 53 to go, at ₹2,000: what will have been put in, not what it will be worth.
      planned: '₹1,20,000',
      sips: [{ id: banyan, label: 'Banyan Flexi Cap Fund · ₹2,000 a month' }],
      dipSipId: banyan,
    });
    expect(emergency).toMatchObject({ targetMonth: null, timeToGo: 'No target date', paidLabel: '4 instalments paid', barPct: null, planned: null });

    expect(home.noGoal).toEqual({ text: '1 SIP has no goal yet', funds: ['Kestrel Nifty 50 Index Fund'], href: `/sips/${kestrel}/goal` });
    expect(home.comingUp).toEqual([
      { sipId: banyan, date: '2 Nov 2026', fund: 'Banyan Flexi Cap Fund', amount: '₹2,000' },
      { sipId: harbor, date: '10 Nov 2026', fund: 'Harbor Liquid Fund', amount: '₹1,000' },
      { sipId: kestrel, date: '15 Nov 2026', fund: 'Kestrel Nifty 50 Index Fund', amount: '₹1,500' },
    ]);
    expect(home.summary).toMatchObject({ putIn: '₹22,500', sipCount: '3 SIPs' });
  });

  it('shows the same value the AI is given for the SIP', async () => {
    const riya = await clonePersona(db, 'riya');
    const [banyan] = await sipIds(riya);
    const lookup = await retrieveFacts(db, riya, banyan, TODAY);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    const card = (await homeView(db, riya, TODAY)).goals[0];
    // The screen shows ₹; the AI's facts say Rs. Same numbers either way.
    expect(card.value).toBe(inr(lookup.facts.current_value));
    expect(toRupeeSign(lookup.unit.text)).toContain(`- Value today: ${card.value}`);
    expect(toRupeeSign(lookup.unit.text)).toContain(`- Change vs put in: ${card.change?.text}`);
  });

  it("adds up Meera's two SIPs on one Retirement card", async () => {
    const meera = await clonePersona(db, 'meera');
    const [kestrel, lotus] = await sipIds(meera);
    const home = await homeView(db, meera, TODAY);
    expect(home.goals).toHaveLength(1);
    expect(home.goals[0]).toMatchObject({ name: 'Retirement', targetMonth: 'by Mar 2056', putIn: '₹39,000', dipSipId: kestrel });
    expect(home.goals[0].sips.map((s) => s.id)).toEqual([kestrel, lotus]);
    expect(home.noGoal).toBeNull();
  });

  it('counts a skipped month as not paid and not to come', async () => {
    const arjun = await clonePersona(db, 'arjun');
    const [card] = (await homeView(db, arjun, TODAY)).goals;
    // 58 due dates from Mar 2026 to Dec 2030: 7 paid, 1 skipped, 50 to go at ₹1,500.
    expect(card).toMatchObject({ paidLabel: '7 of 58 instalments paid', putIn: '₹10,500' });
    expect(card.planned).toBe('₹85,500');
  });
});

describe('Simulate a market fall (PRD F12)', () => {
  it("moves the visitor's numbers to the -6% day and labels it", async () => {
    const riya = await clonePersona(db, 'riya');
    const before = await homeView(db, riya, TODAY);
    await applyMarketFall(db, riya);
    const home = await homeView(db, riya, TODAY);
    expect(home.asOf).toBe('Numbers as of 28 Oct 2026');
    expect(home.demoNote).toBe('Includes 1 simulated market fall');
    expect(home.goals[0].change?.direction).toBe('down');
    // The Emergency fund is in a liquid fund, which holds steady.
    expect(home.goals[1].value).toBe(before.goals[1].value);

    await applyMarketFall(db, riya);
    expect((await homeView(db, riya, TODAY)).demoNote).toBe('Includes 2 simulated market falls');
  });
});
