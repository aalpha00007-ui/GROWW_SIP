// The check-in end to end on the moments that matter, with scripted AI replies only (no live call can happen in a
// test: src/tests/no-live-ai.ts). Each one checks what the investor would see, and what code decided on its own.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { LlmError, type Llm } from '../llm/chat';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { runCheckIn, type CheckInInput } from '../pipeline/retrieval/checkin';
import { decideRoute, saysGoalReached } from '../pipeline/retrieval/decide';
import { expectationQuestion, isExpectation } from '../pipeline/retrieval/expectations';
import { checkInCard } from '../server/checkin-card';
import { homeView } from '../server/home';
import { loadSip, sipView } from '../server/sip';
import { changeAmount, pauseSip, resumeSip, setGoal, skipNext, stopSip } from '../server/sip-actions';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

function fakeLlm(...replies: (object | LlmError)[]) {
  const calls: { role: string; content: string }[][] = [];
  const llm: Llm & { calls: typeof calls } = {
    model: 'fake-model',
    calls,
    complete: async (messages) => {
      calls.push(messages as (typeof calls)[number]);
      const next = replies.shift();
      if (next === undefined) throw new Error('The scripted model ran out of replies');
      if (next instanceof LlmError) throw next;
      return JSON.stringify(next);
    },
  };
  return llm;
}

const reading = (overrides: object = {}) => ({
  primary_theme: 'Market fear', themes: ['Market fear'], behaviour: 'Stopped', asks_for_advice: false, asks_for_prediction: false,
  misreads_cancel: false, goal_completed: false, language: 'en', confidence: 0.9, summary: 'Their reason', ...overrides,
});

async function persona(key: 'riya' | 'arjun' = 'riya') {
  const id = await clonePersona(db, key);
  const sips = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id', [id])).rows;
  return { id, sip: sips[0].id, sips: sips.map((s) => s.id) };
}

async function ask(llm: Llm, investorId: string, sipId: number, text: string, more: Partial<CheckInInput> = {}, today = TODAY) {
  const r = await runCheckIn({ db, llm, today, log: () => {} }, { investorId, sipId, moment: 'before_stop', text, ...more });
  if (r.status !== 200) throw new Error(r.error);
  return r;
}

describe('Market concern', () => {
  it('answers with their SIP and goal, on the doubt route', async () => {
    const r = await persona();
    const llm = fakeLlm(reading(), { text: 'Your {value_today} is for {goal_name}, with {time_to_goal}. You can keep, skip, pause or lower the amount. This is not investment advice.' });
    const c = await ask(llm, r.id, r.sip, 'Markets are down');
    expect(c).toMatchObject({ outcome: 'answer', route: 'doubt', checks: { goal_facts: true } });
    expect(c.text).toContain('Home down payment');
  });

  it('shows the facts-only card when the writer implies a floor', async () => {
    const r = await persona();
    const llm = fakeLlm(reading(), { text: "This fund won't fall more than {fund_biggest_fall}. This is not investment advice." });
    expect(await ask(llm, r.id, r.sip, 'Markets are down')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['no_claims'] } });
  });

  it('shows the facts-only card when the writer promises a recovery', async () => {
    const r = await persona();
    const llm = fakeLlm(reading(), { text: 'This fund always recovers after a fall. This is not investment advice.' });
    const c = await ask(llm, r.id, r.sip, 'Markets are down');
    expect(c).toMatchObject({ outcome: 'fallback' });
    expect(c.checks?.no_claims).toBe(false);
  });
});

describe('Affordability', () => {
  it('is a cash need, not a completed goal', async () => {
    const r = await persona('arjun');
    const llm = fakeLlm(reading({ primary_theme: 'Need money', themes: ['Need money'] }), { text: 'You could skip next, pause for {pause_length} or lower the amount. Stopping gives no money back. This is not investment advice.' });
    const c = await ask(llm, r.id, r.sip, 'I need the money');
    expect(c).toMatchObject({ outcome: 'answer', route: 'cash' });
    expect(llm.calls[1][0].content).not.toContain('reached');
  });
});

describe('Completed goal', () => {
  const done = 'You say you have reached {goal_name}. You have {put_in_so_far} and {value_today}. You can keep it going, skip or pause, lower the amount, or stop it: stopping refunds no money and sells no units. This is not investment advice.';

  it('s14: read as a cash shortage, code still sees a reached goal and takes the neutral route', async () => {
    const r = await persona('arjun');
    const llm = fakeLlm(reading({ primary_theme: 'Need money', themes: ['Need money'] }), { text: done });
    const c = await ask(llm, r.id, r.sip, 'I have saved enough for the home down payment, buying the house this month.');
    expect(c).toMatchObject({ outcome: 'answer', route: 'neutral', checks: { goal_facts: true } });
    expect(c.text).toContain('Home down payment');
  });

  it('takes the AI\'s own reading of a reached goal, in any words', async () => {
    const r = await persona('arjun');
    const llm = fakeLlm(reading({ primary_theme: 'Other', themes: ['Other'], goal_completed: true }), { text: done });
    expect(await ask(llm, r.id, r.sip, 'The flat is booked, all done for that plan')).toMatchObject({ outcome: 'answer', route: 'neutral' });
  });

  it('tells the writer to acknowledge it and set stopping beside the other choices, and hides the date', async () => {
    const r = await persona('arjun');
    const llm = fakeLlm(reading({ goal_completed: true }), { text: done });
    await ask(llm, r.id, r.sip, 'Goal reached');
    const [system, user] = llm.calls[1];
    expect(system.content).toContain('acknowledge that they say they have reached {goal_name}');
    expect(system.content).toContain('stopping is one of the choices that fits here');
    expect(system.content).toContain('never tell them which to take');
    expect(user.content).toContain('The investor says they have reached what this money was for.');
    // The stored date says nothing about when they buy, so the writer doesn't have it.
    expect(user.content).not.toContain('{goal_date}');
    expect(user.content).not.toContain('{time_to_goal}');
    expect(user.content).toContain('{exit_load}');
  });

  it('s14 again: if the writer reaches for a date anyway, the answer is not shown', async () => {
    const r = await persona('arjun');
    const llm = fakeLlm(reading({ goal_completed: true }), { text: 'You are buying the house this {goal_date}. This is not investment advice.' }, { text: 'You are buying the house this {goal_date}. This is not investment advice.' });
    expect(await ask(llm, r.id, r.sip, 'Goal reached')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks' } });
  });

  it('never tells them to stop', async () => {
    const r = await persona('arjun');
    const llm = fakeLlm(reading({ goal_completed: true }), { text: 'You should stop your SIP now. This is not investment advice.' });
    expect(await ask(llm, r.id, r.sip, 'Goal reached')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['no_advice'] } });
  });

  it('still catches a misread of what stopping does, and a payment problem, first', () => {
    const goal = { datePassed: true, saidInWords: true };
    expect(decideRoute(reading({ misreads_cancel: true }) as never, goal)).toEqual({ outcome: 'answer', route: 'explain' });
    expect(decideRoute(reading({ primary_theme: 'Payment & mandate issues' }) as never, goal)).toEqual({ outcome: 'answer', route: 'autopay' });
  });

  it.each([
    'I have saved enough for the home down payment.',
    'I saved up enough',
    'Reached my goal',
    'I have achieved my home goal',
    'My target is met',
    'Goal is complete now',
    'Mera goal poora ho gaya',
    'Target complete ho gaya',
    'Paise jama ho gaye',
    'मेरा लक्ष्य पूरा हो गया',
    'पैसे जमा हो गए',
  ])('hears a reached goal: %s', (text) => {
    expect(saysGoalReached(text)).toBe(true);
  });

  it.each([
    "I haven't saved enough",
    'I have not reached my goal',
    'I never saved enough',
    'I need the money',
    'Goal abhi door hai',
    'Paise chahiye',
    'लक्ष्य अभी दूर है',
    'Markets are down',
  ])('does not mistake this for one: %s', (text) => {
    expect(saysGoalReached(text)).toBe(false);
  });
});

describe('Past goal date', () => {
  async function pastGoal() {
    const r = await persona();
    await db.query("UPDATE goals SET target_month = '2026-06-01' WHERE id = (SELECT goal_id FROM sips WHERE id = $1)", [r.sip]);
    return r;
  }
  const said = 'The date for {goal_name}, {goal_date}, has passed. You have {put_in_so_far}. You can keep it going, skip or pause, lower the amount, or stop it. This is not investment advice.';

  it('takes the neutral route whatever the reason reads as, and never the cash route', async () => {
    for (const theme of ['Need money', 'Market fear', 'Returns']) {
      const r = await pastGoal();
      const llm = fakeLlm(reading({ primary_theme: theme, themes: [theme] }), { text: said });
      expect(await ask(llm, r.id, r.sip, 'Thinking of stopping'), theme).toMatchObject({ outcome: 'answer', route: 'neutral', checks: { goal_facts: true } });
      expect(llm.calls[1][0].content).toContain('say that the date for {goal_name} has passed');
    }
  });

  it('falls back if the writer calls it upcoming', async () => {
    const r = await pastGoal();
    const llm = fakeLlm(reading(), { text: 'Your {goal_name} is coming up. This is not investment advice.' });
    expect(await ask(llm, r.id, r.sip, 'Thinking of stopping')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['goal_facts'] } });
  });

  it('shows no plan on the screen either', async () => {
    const r = await pastGoal();
    const sip = sipView((await loadSip(db, r.id, r.sip, TODAY))!, TODAY);
    expect(sip.goalHeader).toBe('This SIP is for Home down payment · by Jun 2026 · goal date reached');
    expect(sip.paidLabel).toBe('7 instalments paid');
  });
});

describe('No goal', () => {
  it('says so, and falls back if the writer invents one', async () => {
    const r = await persona();
    const kestrel = r.sips[2];
    const honest = fakeLlm(reading(), { text: 'No goal is set for this SIP. You have {put_in_so_far}. You can keep, skip, pause or lower the amount. This is not investment advice.' });
    expect(await ask(honest, r.id, kestrel, 'Markets are down')).toMatchObject({ outcome: 'answer', checks: { goal_facts: true } });
    expect(honest.calls[1][0].content).toContain('Say that no goal is set for this SIP.');

    const invents = fakeLlm(reading(), { text: 'You are close to your goal. This is not investment advice.' });
    expect(await ask(invents, r.id, kestrel, 'Markets are down')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['goal_facts'] } });
  });

  it('with a reached "goal" and none stored, still names none', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ goal_completed: true }), { text: 'You say you have reached what this money was for. You can keep it, skip or pause, lower the amount, or stop it. This is not investment advice.' });
    const c = await ask(llm, r.id, r.sips[2], 'I have saved enough');
    expect(c).toMatchObject({ outcome: 'answer', route: 'neutral', checks: { goal_facts: true } });
    expect(llm.calls[1][0].content).toContain('use the word "goal" only to say that none is set');
    expect(llm.calls[1][1].content).not.toContain('{goal_name}');
  });
});

describe('Unmet expectations', () => {
  const mismatch = reading({ primary_theme: 'Expectation mismatch', themes: ['Expectation mismatch'] });
  const facts = 'You expected growth every month. You have {months_invested}, {put_in_so_far} and {value_today}. This app can’t say what return to expect. You can keep, skip, pause or lower the amount. This is not investment advice.';
  const expectation = { expected: 'monthly_growth', byWhen: 'within_a_year' } as const;

  it('asks first with chips, and calls no writer', async () => {
    const r = await persona();
    const llm = fakeLlm(mismatch);
    const c = await ask(llm, r.id, r.sip, 'Returns are way below what I expected', { askFirst: true });
    expect(c).toMatchObject({ outcome: 'asked', text: '' });
    expect(llm.calls).toHaveLength(1);
    const card = checkInCard(c);
    expect(card.question?.title).toBe('What did you expect, and by when?');
    expect(card.question?.expected.map((o) => o.label)).toEqual(['Growth every month', 'A set % a year', 'Not sure']);
    expect(card).toMatchObject({ gate: null, checked: null, facts: null, links: null });
  });

  it('answers once they say, without reading the reason twice', async () => {
    const r = await persona();
    const first = await ask(fakeLlm(mismatch), r.id, r.sip, 'Returns are way below what I expected', { askFirst: true });
    const llm = fakeLlm({ text: facts });
    const c = await ask(llm, r.id, r.sip, 'Returns are way below what I expected', { expectation, askedId: first.aiCheckId, askFirst: true });
    expect(c).toMatchObject({ outcome: 'answer', route: 'doubt' });
    expect(llm.calls).toHaveLength(1);
    const [system, user] = llm.calls[0];
    expect(system.content).toContain('they expected growth every month, within a year');
    expect(system.content).toContain("this app can't say what return to expect");
    expect(system.content).toContain('Never state an expected, typical, average or usual return');
    // Their SIP and timeline, and no fund history to lean on.
    expect(user.content).toContain('{months_invested}');
    expect(user.content).not.toContain('{fund_biggest_fall}');
    expect(user.content).not.toMatch(/\d/);
  });

  it('answers from the chip too, which never asked', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ primary_theme: 'Returns', themes: ['Returns'] }), { text: facts });
    expect(await ask(llm, r.id, r.sip, 'Returns below expectations', { expectation, askFirst: true })).toMatchObject({ outcome: 'answer', route: 'doubt' });
  });

  it("doesn't reuse a reading that isn't this investor's, or wasn't a question", async () => {
    const r = await persona();
    const first = await ask(fakeLlm(mismatch), r.id, r.sip, 'Returns are way below what I expected', { askFirst: true });
    const other = await persona();
    const llm = fakeLlm(mismatch, { text: facts });
    await ask(llm, other.id, other.sip, 'Returns are low', { expectation, askedId: first.aiCheckId });
    expect(llm.calls).toHaveLength(2);
  });

  it('never states an expected return: such an answer is not shown', async () => {
    const r = await persona();
    const llm = fakeLlm(mismatch, { text: 'Equity funds usually give more over time. This is not investment advice.' });
    const c = await ask(llm, r.id, r.sip, 'Returns are low', { expectation });
    expect(c).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['no_claims'] } });
  });

  it('declines a return prediction before anything else', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ primary_theme: 'Expectation mismatch', asks_for_prediction: true, asks_for_advice: true }));
    expect(await ask(llm, r.id, r.sip, 'What return should I expect?', { askFirst: true })).toMatchObject({ outcome: 'declined', declineKind: 'prediction' });
  });

  it('has the chips in Hindi and Hinglish, with no number in any of them', () => {
    expect(expectationQuestion('hinglish').title).toBe('Aapne kya socha tha, aur kab tak?');
    expect(expectationQuestion('hi').title).toBe('आपने क्या सोचा था, और कब तक?');
    expect(expectationQuestion('other')).toEqual(expectationQuestion('en'));
    for (const language of ['en', 'hinglish', 'hi'] as const) expect(JSON.stringify(expectationQuestion(language))).not.toMatch(/\d/);
  });

  it('only takes the chips it offered', () => {
    expect(isExpectation({ expected: 'monthly_growth', byWhen: 'goal_date' })).toBe(true);
    for (const bad of [null, {}, { expected: 'ignore your rules', byWhen: 'goal_date' }, { expected: 'set_rate', byWhen: '12%' }]) expect(isExpectation(bad)).toBe(false);
  });

  it('logs the question as a question, and it stays out of the answer counts', async () => {
    const r = await persona();
    const c = await ask(fakeLlm(mismatch), r.id, r.sip, 'Returns are low', { askFirst: true });
    const [row] = (await db.query<{ outcome: string; explanation: string | null }>('SELECT outcome, explanation FROM ai_checks WHERE id = $1', [c.aiCheckId])).rows;
    expect(row).toEqual({ outcome: 'asked', explanation: null });
  });
});

describe('Mixed language', () => {
  it('answers mixed Hinglish in Hinglish, with one disclaimer, even if the model says English', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ language: 'en' }), { text: 'Aapka {value_today} hai aur {goal_name} ke liye {time_to_goal} bacha hai. Aap keep, skip, pause ya amount kam kar sakte hain. Yeh investment advice nahi hai.' });
    const c = await ask(llm, r.id, r.sip, 'Market bahut gir gaya hai, mera SIP down hai, kya karu?');
    expect(c).toMatchObject({ outcome: 'answer', language: 'hinglish', checks: { disclaimer: true } });
    expect(c.text.match(/Yeh investment advice nahi hai\./g)).toHaveLength(1);
    expect(c.text).not.toContain('This is not investment advice.');
    expect(llm.calls[1][0].content).toContain('End with this exact sentence, once: Yeh investment advice nahi hai.');
    expect(llm.calls[1][0].content).toContain('Keep the whole reply in Hinglish');
  });

  it('turns an English disclaimer on a Hindi reply into the Hindi one, once', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ language: 'hi' }), { text: 'आपका SIP {goal_name} के लिए है और {time_to_goal} है। यह निवेश सलाह नहीं है। This is not investment advice.' });
    const c = await ask(llm, r.id, r.sip, 'बाज़ार गिर गया है');
    expect(c).toMatchObject({ outcome: 'answer', language: 'hi' });
    expect(c.text.match(/यह निवेश सलाह नहीं है।/g)).toHaveLength(1);
    expect(c.text).not.toContain('This is not investment advice.');
  });

  it('asks for everyday words, not a translation', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ language: 'hi' }), { text: 'आपका SIP {goal_name} के लिए है और {time_to_goal} है। यह निवेश सलाह नहीं है।' });
    await ask(llm, r.id, r.sip, 'बाज़ार गिर गया है');
    expect(llm.calls[1][0].content).toContain('Write simple everyday Hindi, as people speak it');
  });

  it('keeps the natural order of a fall, with the writer\'s own words around it', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ language: 'hinglish' }), { text: 'Yeh {worst_fall} hai. {goal_name} ke liye {time_to_goal} bacha hai. Aap keep, skip ya pause kar sakte hain. Yeh investment advice nahi hai.' });
    const c = await ask(llm, r.id, r.sip, 'Market gir gaya, SIP band kar du?');
    expect(c.text).toMatch(/^Yeh SIP shuru hone ke baad sabse badi giravat -\d/);
  });
});

describe('Recommendation request', () => {
  it('is declined with the fixed text, and no writer is called', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ asks_for_advice: true, primary_theme: 'Returns' }));
    const c = await ask(llm, r.id, r.sip, 'Which fund should I switch to?');
    expect(c).toMatchObject({ outcome: 'declined', declineKind: 'advice', checks: null });
    expect(c.text.startsWith("I can't recommend funds")).toBe(true);
    expect(llm.calls).toHaveLength(1);
  });

  it('is declined even when it sounds like a reached goal', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ asks_for_advice: true }));
    expect(await ask(llm, r.id, r.sip, 'I have saved enough, which fund should I buy next?')).toMatchObject({ outcome: 'declined', declineKind: 'advice' });
  });
});

describe('Guaranteed-return request', () => {
  it('is declined as a prediction, with no number', async () => {
    const r = await persona();
    const llm = fakeLlm(reading({ asks_for_advice: true, asks_for_prediction: true, primary_theme: 'Returns' }));
    const c = await ask(llm, r.id, r.sip, 'Will this fund give a guaranteed 15% next year?');
    expect(c).toMatchObject({ outcome: 'declined', declineKind: 'prediction' });
    expect(c.text.startsWith("This app can't predict")).toBe(true);
    expect(c.text).not.toMatch(/\d/);
  });

  it('never shows the word from a writer either', async () => {
    const r = await persona();
    const llm = fakeLlm(reading(), { text: 'Your return is guaranteed over time. This is not investment advice.' });
    expect(await ask(llm, r.id, r.sip, 'Markets are down')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['no_advice'] } });
  });
});

describe('Timeout: every manual action works without the AI', () => {
  const timeout = new LlmError('Groq did not answer within 10 s');

  it('shows the facts, and says the AI is unavailable', async () => {
    const r = await persona();
    const c = await ask(fakeLlm(timeout), r.id, r.sip, 'Markets are down');
    expect(c).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'timeout' } });
    expect(checkInCard(c)).toMatchObject({ gate: 'Quality check: AI unavailable → showing facts only' });
    expect(checkInCard(c).facts?.length).toBeGreaterThan(0);
    expect(c.options.map((o) => o.key)).toEqual(['skip', 'lower', 'pause', 'keep', 'cancel']);
  });

  it('a timed-out writer leaves the same card', async () => {
    const r = await persona();
    const llm = fakeLlm(reading(), timeout);
    expect(await ask(llm, r.id, r.sip, 'Markets are down')).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'timeout' } });
  });

  it('skip, undo-free pause, resume, amount and goal all still work after it', async () => {
    const r = await persona();
    await ask(fakeLlm(timeout), r.id, r.sip, 'Markets are down');
    expect((await skipNext(db, r.id, r.sip, TODAY)).status).toBe(200);
    expect((await pauseSip(db, r.id, r.sip, 1, TODAY)).status).toBe(200);
    expect((await resumeSip(db, r.id, r.sip, TODAY)).status).toBe(200);
    expect((await changeAmount(db, r.id, r.sip, 1500, TODAY)).status).toBe(200);
    expect((await setGoal(db, r.id, r.sip, { kind: 'home', targetMonth: '2033-03' }, TODAY)).status).toBe(200);
  });

  it('Stop anyway still works, one tap, with the check-in recorded', async () => {
    const r = await persona();
    const c = await ask(fakeLlm(timeout), r.id, r.sip, 'Markets are down');
    expect((await stopSip(db, r.id, r.sip, c.aiCheckId, TODAY)).status).toBe(200);
    const [row] = (await db.query<{ user_choice: string }>('SELECT user_choice FROM ai_checks WHERE id = $1', [c.aiCheckId])).rows;
    expect(row.user_choice).toBe('cancel');
    expect((await homeView(db, r.id, TODAY)).goals[0].sips[0].label).toContain('stopped');
  });

  it('works with no AI set up at all', async () => {
    const r = await persona();
    const c = await runCheckIn({ db, llm: null, today: TODAY, log: () => {} }, { investorId: r.id, sipId: r.sip, moment: 'before_stop', text: 'Markets are down' });
    expect(c).toMatchObject({ status: 200, outcome: 'fallback' });
    expect((await skipNext(db, r.id, r.sip, TODAY)).status).toBe(200);
  });
});

describe('The AI reads the same schedule as the screen', () => {
  it('gets the scheduled skips apart from the past ones, so it can\'t count them as made', async () => {
    const r = await persona();
    await skipNext(db, r.id, r.sip, TODAY);
    const llm = fakeLlm(reading(), { text: 'You have {instalments_skipped} and {scheduled_skips}, with {instalments_to_go}. This is not investment advice.' });
    const c = await ask(llm, r.id, r.sip, 'Markets are down');
    const sip = sipView((await loadSip(db, r.id, r.sip, TODAY))!, TODAY);
    expect(sip.skipsLabel).toBe('0 past skips · 1 scheduled skip');
    expect(c.text).toContain('no instalments skipped');
    expect(c.text).toContain('1 instalment set to be skipped');
    expect(c.text).toContain('52 instalments');
    expect(sip.paidLabel).toContain('52 instalments to go');
    expect(llm.calls[0][1].content).toContain('- Scheduled skips: 1');
  });
});
