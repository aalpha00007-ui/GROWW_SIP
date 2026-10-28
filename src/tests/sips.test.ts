import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import type { ChatMessage, Llm } from '../llm/chat';
import { rupees } from '../pipeline/chunking/format';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { runCheckIn } from '../pipeline/retrieval/checkin';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { checkInCard } from '../server/checkin-card';
import { homeView } from '../server/home';
import { goalYearChoices, loadSip, sipView } from '../server/sip';
import { changeAmount, pauseSip, setGoal, skipNext, stopSip } from '../server/sip-actions';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

/** A fresh Riya: [Banyan (Home down payment), Harbor (Emergency fund), Kestrel (no goal)]. */
async function riya() {
  const id = await clonePersona(db, 'riya');
  const [banyan, harbor, kestrel] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id', [id])).rows.map((r) => r.id);
  return { id, banyan, harbor, kestrel };
}

const view = async (investorId: string, sipId: number) => {
  const state = await loadSip(db, investorId, sipId, TODAY);
  if (!state) throw new Error('SIP not found');
  return sipView(state, TODAY);
};

function fakeLlm(...replies: object[]): Llm & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    model: 'fake-model',
    calls,
    async complete(messages) {
      calls.push(messages);
      const next = replies.shift();
      if (!next) throw new Error('unexpected extra call to the model');
      return JSON.stringify(next);
    },
  };
}

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('the SIP page (PRD F5)', () => {
  it("shows Riya's goal header, the next three instalments and the history", async () => {
    const r = await riya();
    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({
      fund: 'Banyan Flexi Cap Fund',
      amount: 'Rs 2,000 a month',
      status: 'active',
      goalHeader: 'This SIP is for Home down payment · by Mar 2031 · 53 instalments to go',
      paidLabel: '7 instalments paid · 0 skipped',
      nextDue: '2 Nov 2026',
      skipLabel: 'Skip the 2 Nov 2026 instalment',
      amountRange: 'From Rs 500 to Rs 1,00,000',
      notes: [],
    });
    expect(sip.pauseChoices.map((c) => c.label)).toEqual([
      '1 instalment (2 Nov 2026)',
      '2 instalments (2 Nov 2026 to 2 Dec 2026)',
      '3 instalments (2 Nov 2026 to 2 Jan 2027)',
    ]);
    expect(sip.history).toHaveLength(7);
    expect(sip.history[0]).toEqual({ date: '2 Oct 2026', amount: 'Rs 2,000', label: 'Paid' });
    expect((await view(r.id, r.harbor)).goalHeader).toBe('This SIP is for Emergency fund · no target date');
    expect((await view(r.id, r.kestrel)).goalHeader).toBe('No goal yet');
  });

  it("reads someone else's SIP as not found, for the page and every action", async () => {
    const r = await riya();
    const arjun = await clonePersona(db, 'arjun');
    expect(await loadSip(db, arjun, r.banyan, TODAY)).toBeNull();
    const notFound = { status: 404, error: 'We could not find that SIP.' };
    expect(await skipNext(db, arjun, r.banyan, TODAY)).toEqual(notFound);
    expect(await pauseSip(db, arjun, r.banyan, 1, TODAY)).toEqual(notFound);
    expect(await changeAmount(db, arjun, r.banyan, 1000, TODAY)).toEqual(notFound);
    expect(await stopSip(db, arjun, r.banyan, undefined, TODAY)).toEqual(notFound);
    expect(await setGoal(db, arjun, r.banyan, { kind: 'education' }, TODAY)).toEqual(notFound);
    expect((await view(r.id, r.banyan)).status).toBe('active');
  });
});

describe('Skip, pause and change amount', () => {
  it('skips the next instalment and moves to the one after', async () => {
    const r = await riya();
    expect(await skipNext(db, r.id, r.banyan, TODAY)).toEqual({ status: 200, message: 'Skipped the 2 Nov 2026 instalment. The next one is on 2 Dec 2026.' });
    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({ status: 'active', nextDue: '2 Dec 2026', paidLabel: '7 instalments paid · 1 skipped', notes: ['2 Nov 2026 will be skipped.'] });
    expect(sip.goalHeader).toContain('52 instalments to go');
    expect(sip.history[0]).toEqual({ date: '2 Nov 2026', amount: '', label: 'Will be skipped' });
  });

  it('pauses 1 to 3 instalments, and blocks skip and pause while paused', async () => {
    const r = await riya();
    expect(await pauseSip(db, r.id, r.banyan, 4, TODAY)).toEqual({ status: 400, error: 'Pause for 1, 2 or 3 instalments.' });
    expect(await pauseSip(db, r.id, r.banyan, '2', TODAY)).toMatchObject({ status: 400 });
    expect(await pauseSip(db, r.id, r.banyan, 2, TODAY)).toEqual({
      status: 200,
      message: 'Paused: 2 Nov 2026 and 2 Dec 2026 will be skipped. Instalments start again on 2 Jan 2027.',
    });
    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({ status: 'paused', nextDue: '2 Jan 2027', controls: { skip: false, pause: false, amount: true, stop: true } });
    expect(sip.notes).toEqual(['Paused: 2 Nov 2026 and 2 Dec 2026 will be skipped. Instalments start again on 2 Jan 2027.']);
    expect((await skipNext(db, r.id, r.banyan, TODAY)).status).toBe(400);
    expect((await pauseSip(db, r.id, r.banyan, 1, TODAY)).status).toBe(400);

    // The AI's facts and Home see the paused instalments as skipped: 7 paid, 2 paused, 51 to go at Rs 2,000.
    const lookup = await retrieveFacts(db, r.id, r.banyan, TODAY);
    expect(lookup.status === 'ok' && lookup.facts).toMatchObject({ instalments_skipped: 2, next_due_date: '2027-01-02' });
    expect((await homeView(db, r.id, TODAY)).goals[0].planned).toBe('Rs 1,16,000');
  });

  it('changes the amount within the limits and recomputes what is planned', async () => {
    const r = await riya();
    const range = { status: 400, error: 'Enter a whole amount from Rs 500 to Rs 1,00,000.' };
    expect(await changeAmount(db, r.id, r.banyan, 50, TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, 1500.5, TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, 100_001, TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, '1000', TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, 2000, TODAY)).toEqual({ status: 400, error: 'Your SIP is already Rs 2,000 a month.' });
    expect(await changeAmount(db, r.id, r.banyan, 1000, TODAY)).toEqual({ status: 200, message: 'Your SIP is now Rs 1,000 a month, from the 2 Nov 2026 instalment.' });
    expect((await view(r.id, r.banyan)).amount).toBe('Rs 1,000 a month');
    // Rs 14,000 already in, plus 53 to go at Rs 1,000. Nothing was stored but the new amount and the event.
    expect((await homeView(db, r.id, TODAY)).goals[0].planned).toBe('Rs 67,000');
    const events = (await db.query<{ detail: object }>("SELECT detail FROM sip_events WHERE sip_id = $1 AND kind = 'amount_changed'", [r.banyan])).rows;
    expect(events.map((e) => e.detail)).toEqual([{ from: 2000, to: 1000 }]);
  });
});

describe('Stop (Stop anyway)', () => {
  it('stops once, keeps the units on Home, and refuses a second stop', async () => {
    const r = await riya();
    const before = await homeView(db, r.id, TODAY);
    expect(await stopSip(db, r.id, r.banyan, undefined, TODAY)).toEqual({
      status: 200,
      message: 'Your SIP is stopped. No more instalments will be taken. Your units stay invested until you redeem them.',
    });
    expect(await stopSip(db, r.id, r.banyan, undefined, TODAY)).toEqual({ status: 400, error: 'This SIP is already stopped.' });
    expect(await skipNext(db, r.id, r.banyan, TODAY)).toEqual({ status: 400, error: 'This SIP is already stopped.' });

    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({ status: 'stopped', nextDue: null, controls: { skip: false, pause: false, amount: false, stop: false } });
    expect(sip.notes[0]).toMatch(/^Stopped on \d+ \w+ \d{4}\. No more instalments will be taken\. Your units stay invested until you redeem them\.$/);

    const home = await homeView(db, r.id, TODAY);
    const card = home.goals[0];
    expect(card).toMatchObject({ name: 'Home down payment', putIn: 'Rs 14,000', value: before.goals[0].value, planned: null, barPct: null, paidLabel: '7 instalments paid' });
    expect(card.sips[0].label).toBe('Banyan Flexi Cap Fund · stopped');
    expect(home.summary).toEqual(before.summary);
    expect(home.comingUp.map((c) => c.sipId)).toEqual([r.harbor, r.kestrel]);

    // A stopped SIP needs no goal, so it leaves the "no goal yet" row.
    await stopSip(db, r.id, r.kestrel, undefined, TODAY);
    expect((await homeView(db, r.id, TODAY)).noGoal).toBeNull();
  });

  it('records Stop anyway against the check-in it followed', async () => {
    const r = await riya();
    const [check] = (
      await db.query<{ id: number }>(
        "INSERT INTO ai_checks (investor_id, sip_id, moment, model, prompt_version, outcome) VALUES ($1, $2, 'before_stop', 'fake', 'v6', 'answer') RETURNING id",
        [r.id, r.banyan],
      )
    ).rows;
    expect((await stopSip(db, r.id, r.banyan, 'x', TODAY)).status).toBe(400);
    expect((await stopSip(db, r.id, r.banyan, check.id, TODAY)).status).toBe(200);
    const [row] = (await db.query<{ user_choice: string }>('SELECT user_choice FROM ai_checks WHERE id = $1', [check.id])).rows;
    expect(row.user_choice).toBe('cancel');
  });
});

describe('Set or edit the goal', () => {
  it('checks the name, the kind and the month', async () => {
    const r = await riya();
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'custom', name: 'Call 9876543210' }, TODAY)).toEqual({
      status: 400,
      error: "Please don't put personal details in a goal name.",
    });
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'custom', name: 'x'.repeat(41) }, TODAY)).toEqual({ status: 400, error: 'Name the goal in 1 to 40 characters.' });
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'custom', name: '  ' }, TODAY)).toMatchObject({ status: 400 });
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'car' }, TODAY)).toEqual({ status: 400, error: 'Choose what this money is for.' });
    for (const targetMonth of ['2026-09', '2026-10', '2026-13', 'soon', '2077-01']) {
      expect(await setGoal(db, r.id, r.kestrel, { kind: 'education', targetMonth }, TODAY)).toMatchObject({ status: 400 });
    }
    expect((await view(r.id, r.kestrel)).goalHeader).toBe('No goal yet');
  });

  it('adds a goal to the SIP with none, and Home picks it up', async () => {
    const r = await riya();
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'education', targetMonth: '2031-10' }, TODAY)).toEqual({
      status: 200,
      message: 'Saved: this SIP is for Education, by Oct 2031.',
    });
    // 63 due dates from Aug 2026 to Oct 2031, 3 paid.
    expect((await view(r.id, r.kestrel)).goalHeader).toBe('This SIP is for Education · by Oct 2031 · 60 instalments to go');
    const home = await homeView(db, r.id, TODAY);
    expect(home.noGoal).toBeNull();
    expect(home.goals.map((g) => g.name)).toEqual(['Home down payment', 'Emergency fund', 'Education']);
  });

  it("keeps the goal's own name when only the date changes, and can remove it", async () => {
    const r = await riya();
    expect(await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2032-03' }, TODAY)).toEqual({
      status: 200,
      message: 'Saved: this SIP is for Home down payment, by Mar 2032.',
    });
    expect(await setGoal(db, r.id, r.banyan, { kind: 'none' }, TODAY)).toEqual({ status: 200, message: 'Goal removed. You can add one any time.' });
    expect((await homeView(db, r.id, TODAY)).noGoal?.text).toBe('2 SIPs have no goal yet');
  });

  it('offers next year, 5 and 10 years, and keeps a goal month that is not on the list', () => {
    const { quickYears, allYears } = goalYearChoices(TODAY, '2031-03');
    expect(quickYears).toEqual([
      { value: '2027-10', label: 'Next year · Oct 2027' },
      { value: '2031-10', label: 'In 5 years · Oct 2031' },
      { value: '2036-10', label: 'In 10 years · Oct 2036' },
    ]);
    expect(allYears[0]).toEqual({ value: '2031-03', label: 'Mar 2031 (current)' });
    expect(allYears).toHaveLength(41);
  });
});

describe('AI cards (PRD F8-F10)', () => {
  const answer = 'Your goal is set and your instalments are on track. Values move with the market. This is not investment advice.';
  const understood = (overrides: object = {}) => ({
    primary_theme: 'Market fear', themes: ['Market fear'], behaviour: 'Continuing', asks_for_advice: false,
    misreads_cancel: false, language: 'en', confidence: 0.9, summary: 'Worried because the SIP is red', ...overrides,
  });
  const card = async (llm: Llm, moment: 'before_stop' | 'is_this_normal', investorId: string, sipId: number) => {
    const result = await runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId, sipId, moment, text: 'Markets are down' });
    if (result.status !== 200) throw new Error(result.error);
    return checkInCard(result);
  };

  it('shows the dip explainer with its quality strip and no facts table', async () => {
    const r = await riya();
    const c = await card(fakeLlm({ text: answer }), 'is_this_normal', r.id, r.banyan);
    expect(c).toMatchObject({ outcome: 'answer', understood: null, text: answer, confidence: null, facts: null, links: null, asOf: 'Numbers as of 27 Oct 2026' });
    expect(c.strip).toEqual([
      { label: 'No investment advice', ok: true },
      { label: 'Numbers match your SIP', ok: true },
      { label: 'Disclaimer shown', ok: true },
    ]);
  });

  it('shows what it understood and the confidence on a Before you stop answer', async () => {
    const r = await riya();
    const c = await card(fakeLlm(understood(), { text: answer }), 'before_stop', r.id, r.banyan);
    expect(c).toMatchObject({ outcome: 'answer', understood: 'Worried because the SIP is red', confidence: 'Confidence: High' });
  });

  it('shows the facts and the official links on the declined and fallback cards, with no strip', async () => {
    const r = await riya();
    const declined = await card(fakeLlm(understood({ asks_for_advice: true, summary: 'Asks which fund to switch to' })), 'before_stop', r.id, r.banyan);
    expect(declined).toMatchObject({ outcome: 'declined', understood: 'Asks which fund to switch to', strip: null });
    expect(declined.facts?.find((l) => l.label === 'Put in so far')?.value).toBe(rupees(14000));
    expect(declined.links?.map((l) => l.label)).toEqual(['SEBI Investor Website', 'AMFI']);

    const fallback = await card(fakeLlm(understood({ confidence: 0.3 })), 'before_stop', r.id, r.banyan);
    expect(fallback).toMatchObject({ outcome: 'fallback', understood: null, strip: null, text: "I couldn't give a reliable answer here." });
    expect(fallback.facts?.length).toBeGreaterThan(0);
  });
});
