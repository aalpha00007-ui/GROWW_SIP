import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { LlmError, type ChatMessage, type Llm } from '../llm/chat';
import { rupees } from '../pipeline/chunking/format';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { runCheckIn } from '../pipeline/retrieval/checkin';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { checkInCard, gateLine } from '../server/checkin-card';
import { homeView } from '../server/home';
import { loadSip, sipView } from '../server/sip';
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

function fakeLlm(...replies: (object | LlmError)[]): Llm & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    model: 'fake-model',
    calls,
    async complete(messages) {
      calls.push(messages);
      const next = replies.shift();
      if (!next) throw new Error('unexpected extra call to the model');
      if (next instanceof LlmError) throw next;
      return JSON.stringify(next);
    },
  };
}

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('Before you stop: what each option does', () => {
  it("says it in one fixed line per option, with this SIP's date, minimum and value", async () => {
    const r = await riya();
    const sip = await view(r.id, r.banyan);
    expect(sip.optionNotes).toEqual({
      skip: `Misses the ${sip.nextDue} instalment only. The SIP stays active.`,
      lower: 'Future instalments take less, down to ₹500. Your units stay invested.',
      pause: 'Skips the next 1 to 3 instalments, then restarts on its own.',
      keep: 'Nothing changes.',
      cancel: `Ends future instalments. Gives no money back and sells no units: your ${sip.value} stays invested until you redeem it.`,
    });
    // The facts carry the fund's exit load, so the cash route can say getting money out may cost one.
    const facts = await retrieveFacts(db, r.id, r.banyan, TODAY);
    if (facts.status === 'not_found') throw new Error('missing');
    expect(facts.unit.lines).toContainEqual({ label: 'Exit load', value: '1% if redeemed within 1 year' });
  });
});

describe('the SIP page (PRD F5)', () => {
  it("shows Riya's goal header, the next three instalments and the history", async () => {
    const r = await riya();
    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({
      fund: 'Banyan Flexi Cap Fund',
      amount: '₹2,000 a month',
      status: 'active',
      goalHeader: 'This SIP is for Home down payment · by Mar 2031 · 53 instalments to go',
      paidLabel: '7 of 60 instalments paid · 53 instalments to go',
      skipsLabel: '0 past skips · 0 scheduled skips',
      contribution: '₹14,000 of ₹1,20,000 planned',
      nextDue: '2 Nov 2026',
      skipLabel: 'Skip the 2 Nov 2026 instalment',
      amountRange: 'From ₹500 to ₹1,00,000',
      notes: [],
    });
    expect(sip.pauseChoices.map((c) => c.label)).toEqual([
      '1 instalment (2 Nov 2026)',
      '2 instalments (2 Nov 2026 to 2 Dec 2026)',
      '3 instalments (2 Nov 2026 to 2 Jan 2027)',
    ]);
    expect(sip.history).toHaveLength(7);
    expect(sip.history[0]).toEqual({ date: '2 Oct 2026', amount: '₹2,000', label: 'Paid', state: 'paid' });
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
    expect(sip).toMatchObject({
      status: 'active',
      nextDue: '2 Dec 2026',
      paidLabel: '7 of 59 instalments paid · 52 instalments to go',
      skipsLabel: '0 past skips · 1 scheduled skip',
      notes: ['2 Nov 2026 will be skipped.'],
    });
    expect(sip.goalHeader).toContain('52 instalments to go');
    expect(sip.history[0]).toEqual({ date: '2 Nov 2026', amount: '', label: 'Scheduled skip', state: 'scheduled_skip' });
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

    // The AI's facts and Home see the paused instalments as scheduled skips, not past ones: 7 paid, 2 paused, 51 to go at ₹2,000.
    const lookup = await retrieveFacts(db, r.id, r.banyan, TODAY);
    expect(lookup.status === 'ok' && lookup.facts).toMatchObject({ instalments_skipped: 0, scheduled_skips: 2, instalments_to_go: 51, next_due_date: '2027-01-02' });
    expect((await homeView(db, r.id, TODAY)).goals[0].planned).toBe('₹1,16,000');
  });

  it('changes the amount within the limits and recomputes what is planned', async () => {
    const r = await riya();
    const range = { status: 400, error: 'Enter a whole amount from ₹500 to ₹1,00,000.' };
    expect(await changeAmount(db, r.id, r.banyan, 50, TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, 1500.5, TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, 100_001, TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, '1000', TODAY)).toEqual(range);
    expect(await changeAmount(db, r.id, r.banyan, 2000, TODAY)).toEqual({ status: 400, error: 'Your SIP is already ₹2,000 a month.' });
    expect(await changeAmount(db, r.id, r.banyan, 1000, TODAY)).toEqual({ status: 200, message: 'Your SIP is now ₹1,000 a month, from the 2 Nov 2026 instalment.' });
    expect((await view(r.id, r.banyan)).amount).toBe('₹1,000 a month');
    // ₹14,000 already in, plus 53 to go at ₹1,000. Nothing was stored but the new amount and the event.
    expect((await homeView(db, r.id, TODAY)).goals[0].planned).toBe('₹67,000');
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
    expect(card).toMatchObject({ name: 'Home down payment', putIn: '₹14,000', value: before.goals[0].value, planned: null, barPct: null, paidLabel: '7 instalments paid' });
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
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'crypto' }, TODAY)).toEqual({ status: 400, error: 'Choose what this money is for.' });
    for (const targetMonth of ['2026-09', '2026-10', '2026-13', 'soon', '2077-01']) {
      expect(await setGoal(db, r.id, r.kestrel, { kind: 'education', targetMonth }, TODAY)).toMatchObject({ status: 400 });
    }
    expect((await view(r.id, r.kestrel)).goalHeader).toBe('No goal yet');
  });

  it('adds a goal to the SIP with none, and Home picks it up', async () => {
    const r = await riya();
    expect(await setGoal(db, r.id, r.kestrel, { kind: 'education', targetMonth: '2031-10' }, TODAY)).toEqual({
      status: 200,
      message: "Saved: this SIP is for Child's education, by Oct 2031.",
    });
    // 63 due dates from Aug 2026 to Oct 2031, 3 paid.
    expect((await view(r.id, r.kestrel)).goalHeader).toBe("This SIP is for Child's education · by Oct 2031 · 60 instalments to go");
    const home = await homeView(db, r.id, TODAY);
    expect(home.noGoal).toBeNull();
    expect(home.goals.map((g) => g.name)).toEqual(['Home down payment', 'Emergency fund', "Child's education"]);
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

});

describe('Goal edits keep what was saved', () => {
  const emergency = async (id: string, sipId: number) => (await view(id, sipId)).goalHeader;

  it('keeps the target when only the date changes, in the API and on every screen', async () => {
    const r = await riya();
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2031-03', targetAmount: 500000 }, TODAY);
    // No targetAmount in the request: it stays.
    expect(await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2032-03' }, TODAY)).toMatchObject({ status: 200 });
    expect(await emergency(r.id, r.banyan)).toBe('This SIP is for Home down payment · by Mar 2032 · 65 instalments to go · target ₹5,00,000');
    const card = (await homeView(db, r.id, TODAY)).goals[0];
    expect(card).toMatchObject({ targetMonth: 'by Mar 2032', target: '₹5,00,000' });
    expect(card.targetProgress).toMatch(/^Value today is \d+% of your ₹5,00,000 target$/);
  });

  it('keeps the date when only the target changes, and null clears either one', async () => {
    const r = await riya();
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetAmount: 900000 }, TODAY);
    expect(await emergency(r.id, r.banyan)).toBe('This SIP is for Home down payment · by Mar 2031 · 53 instalments to go · target ₹9,00,000');
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetAmount: null }, TODAY);
    expect(await emergency(r.id, r.banyan)).toBe('This SIP is for Home down payment · by Mar 2031 · 53 instalments to go');
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: null }, TODAY);
    expect(await emergency(r.id, r.banyan)).toBe('This SIP is for Home down payment · no target date');
  });

  it('edits a goal in place, so its one-time money stays with it and no second card appears', async () => {
    const r = await riya();
    const before = (await homeView(db, r.id, TODAY)).goals.length;
    const [{ goal_id: goalId }] = (await db.query<{ goal_id: number }>('SELECT goal_id FROM sips WHERE id = $1', [r.banyan])).rows;
    await db.query('INSERT INTO lumpsums (investor_id, fund_id, goal_id, amount, nav, units) SELECT $1, fund_id, $2, 5000, 10, 500 FROM sips WHERE id = $3', [r.id, goalId, r.banyan]);
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2033-03' }, TODAY);
    const goals = (await homeView(db, r.id, TODAY)).goals;
    expect(goals).toHaveLength(before);
    expect(goals[0]).toMatchObject({ targetMonth: 'by Mar 2033', oneTime: expect.arrayContaining([expect.stringContaining('₹5,000 one-time')]) });
  });

  it('gives a SIP its own new goal when another SIP shares the old one', async () => {
    const r = await riya();
    const [{ goal_id: goalId }] = (await db.query<{ goal_id: number }>('SELECT goal_id FROM sips WHERE id = $1', [r.banyan])).rows;
    await db.query('UPDATE sips SET goal_id = $1 WHERE id = $2', [goalId, r.kestrel]);
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2033-03' }, TODAY);
    expect(await emergency(r.id, r.kestrel)).toContain('by Mar 2031');
    expect(await emergency(r.id, r.banyan)).toContain('by Mar 2033');
  });

  it('logs goal_saved only when a save succeeds', async () => {
    const r = await riya();
    const saves = async () => (await db.query("SELECT 1 FROM app_events WHERE investor_id = $1 AND event = 'goal_saved'", [r.id])).rows.length;
    expect(await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2020-01' }, TODAY)).toMatchObject({ status: 400 });
    expect(await saves()).toBe(0);
    await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2033-03' }, TODAY);
    expect(await saves()).toBe(1);
    await setGoal(db, r.id, r.banyan, { kind: 'none' }, TODAY);
    expect(await saves()).toBe(1);
  });

  it('explains a date that is too soon', async () => {
    const r = await riya();
    expect(await setGoal(db, r.id, r.banyan, { kind: 'home', targetMonth: '2026-10' }, TODAY)).toEqual({ status: 400, error: 'Pick a month after this month, up to 50 years ahead.' });
  });
});

describe('AI cards (PRD F8-F10)', () => {
  const answer = 'Your goal is set and no instalment has been skipped. Values move with the market. This is not investment advice.';
  const understood = (overrides: object = {}) => ({
    primary_theme: 'Market fear', themes: ['Market fear'], behaviour: 'Continuing', asks_for_advice: false,
    misreads_cancel: false, language: 'en', confidence: 0.9, summary: 'Worried because the SIP is red', ...overrides,
  });
  const card = async (llm: Llm, moment: 'before_stop' | 'is_this_normal', investorId: string, sipId: number) => {
    const result = await runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId, sipId, moment, text: 'Markets are down' });
    if (result.status !== 200) throw new Error(result.error);
    return checkInCard(result);
  };

  it('folds how the answer was checked under it, and shows no facts table', async () => {
    const r = await riya();
    const c = await card(fakeLlm({ text: answer }), 'is_this_normal', r.id, r.banyan);
    expect(c).toMatchObject({ outcome: 'answer', understood: null, text: answer, gate: null, lang: 'en', facts: null, links: null, asOf: 'Fund prices as of 27 Oct 2026 · demo price series' });
    expect(c.checked).toMatchObject({ summary: 'How this answer was checked' });
    expect(c.checked?.items).toHaveLength(7);
    expect(c.checked?.items.every((i) => i.ok)).toBe(true);
    // What was done, and that it can miss things: nothing that reads like a guarantee.
    expect(c.checked?.note).toContain('can still miss');
    const words = JSON.stringify(c.checked);
    expect(words).not.toMatch(/confidence|guarantee|verified|accurate|100%|safe|certain/i);
    expect(c).not.toHaveProperty('confidence');
  });

  it('shows what it understood on a Before you stop answer, with no confidence badge', async () => {
    const r = await riya();
    const c = await card(fakeLlm(understood(), { text: answer }), 'before_stop', r.id, r.banyan);
    expect(c).toMatchObject({ outcome: 'answer', understood: 'Worried because the SIP is red' });
    expect(c).not.toHaveProperty('confidence');
  });

  it('shows the facts, the official links and the quality check that stopped the AI on the declined and fallback cards', async () => {
    const r = await riya();
    const declined = await card(fakeLlm(understood({ asks_for_advice: true, summary: 'Asks which fund to switch to' })), 'before_stop', r.id, r.banyan);
    expect(declined).toMatchObject({
      outcome: 'declined', understood: 'Asks which fund to switch to', checked: null,
      gate: 'Quality check: advice question detected → showing facts only',
    });
    expect(declined.facts?.find((l) => l.label === 'Put in so far')?.value).toBe(rupees(14000));
    expect(declined.links?.map((l) => l.label)).toEqual(['SEBI Investor Website', 'AMFI']);

    const fallback = await card(fakeLlm(understood({ confidence: 0.3 })), 'before_stop', r.id, r.banyan);
    expect(fallback).toMatchObject({
      // The facts-only card ends with the disclaimer, as an AI answer does.
      outcome: 'fallback', understood: null, checked: null, text: "I couldn't give a reliable answer here. This is not investment advice.",
      gate: 'Quality check: not sure what you meant → showing facts only',
    });
    expect(fallback.facts?.length).toBeGreaterThan(0);
    expect(fallback.links?.map((l) => l.label)).toEqual(['SEBI Investor Website', 'AMFI']);

    const prediction = await card(fakeLlm(understood({ asks_for_prediction: true })), 'before_stop', r.id, r.banyan);
    expect(prediction).toMatchObject({ outcome: 'declined', gate: 'Quality check: market prediction question detected → showing facts only' });
    expect(prediction.text.startsWith("This app can't predict whether markets will rise or fall.")).toBe(true);
  });

  it('says in plain words which quality check stopped the answer, on both AI features', async () => {
    const r = await riya();
    const claim = await card(fakeLlm(understood(), { text: 'This dip is temporary. This is not investment advice.' }), 'before_stop', r.id, r.banyan);
    expect(claim).toMatchObject({ outcome: 'fallback', gate: 'Quality check: the answer made an unsupported claim → showing facts only' });
    // A number the model wrote gets one second draft (v12); this one writes it again.
    const wrote = { text: 'You have put in Rs 99,999. This is not investment advice.' };
    const number = await card(fakeLlm(wrote, wrote), 'is_this_normal', r.id, r.banyan);
    expect(number).toMatchObject({ outcome: 'fallback', gate: "Quality check: a number didn't match your SIP → showing facts only", checked: null });
    expect(number.facts?.length).toBeGreaterThan(0);
    // A timeout, an error or no key: the AI is unavailable, and the card still shows the facts.
    for (const down of [new LlmError('Groq did not answer within 10 s'), new LlmError('Mistral returned HTTP 500')]) {
      const c = await card(fakeLlm(down), 'before_stop', r.id, r.banyan);
      expect(c).toMatchObject({ outcome: 'fallback', gate: 'Quality check: AI unavailable → showing facts only' });
      expect(c.facts?.length).toBeGreaterThan(0);
    }
    const noKey = await runCheckIn({ db, llm: null, today: TODAY, log: () => {} }, { investorId: r.id, sipId: r.banyan, moment: 'is_this_normal' });
    if (noKey.status !== 200) throw new Error(noKey.error);
    expect(checkInCard(noKey)).toMatchObject({ outcome: 'fallback', gate: 'Quality check: AI unavailable → showing facts only' });
    expect(gateLine({ outcome: 'fallback', declineKind: null, fallbackReason: { kind: 'facts' }, language: 'en' })).toBe("Quality check: your SIP's numbers didn't add up → showing facts only");
    expect(gateLine({ outcome: 'fallback', declineKind: null, fallbackReason: { kind: 'checks', failed: ['grounded', 'disclaimer'] }, language: 'en' })).toBe(
      "Quality check: a number didn't match your SIP; the disclaimer was missing → showing facts only",
    );
  });
});
