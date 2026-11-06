// 1 Nov round 2, task 1: numbers with the wrong meaning. The writer never writes a number: it writes placeholders,
// and the server fills each with the number AND what it means. Plus task 2 (the facts-only card's disclaimer) and
// task 3 (the quality-check line in the reply's language). Every AI reply here is scripted: no call leaves this computer.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { LlmError, type ChatMessage, type Llm } from '../llm/chat';
import type { SipFacts } from '../pipeline/chunking/facts';
import { loadExplainers } from '../pipeline/loading/fixtures';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { cardText, draftProblems, runCheckIn, type CheckInResult } from '../pipeline/retrieval/checkin';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { answerMessages, doubtGuidance, explainerForWriter, type Language } from '../pipeline/retrieval/prompts';
import { comparisons, fillSlots, PAUSE_RANGE, situation, slotsFor, writtenNumbers, type Slot } from '../pipeline/retrieval/slots';
import { gateLine } from '../server/checkin-card';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;
let riya: { investor: string; sip: number; facts: SipFacts };
let arjun: { investor: string; sip: number; facts: SipFacts };

function fakeLlm(...replies: (object | LlmError)[]) {
  const calls: ChatMessage[][] = [];
  const llm: Llm & { calls: ChatMessage[][] } = {
    model: 'fake-model',
    calls,
    async complete(messages) {
      calls.push(messages);
      const next = replies.shift();
      if (next === undefined) throw new Error('unexpected extra call to the model');
      if (next instanceof LlmError) throw next;
      return JSON.stringify(next);
    },
  };
  return llm;
}

const reading = (language: Language, primary_theme = 'Market fear') => ({
  primary_theme, themes: [primary_theme], behaviour: 'Continuing', asks_for_advice: false, asks_for_prediction: false,
  misreads_cancel: false, language, confidence: 0.9, summary: 'Worried about the fall',
});

/**
 * A Before you stop check-in whose reader says `language`, and whose writer replies `text`, and `second` (the same
 * text unless given) if it is asked for a second draft.
 */
async function reply(who: typeof riya, language: Language, text: string, second = text): Promise<Extract<CheckInResult, { status: 200 }>> {
  const reason = language === 'hi' ? 'बाज़ार गिर गया, SIP बंद कर दूँ?' : language === 'hinglish' ? 'Market gir gaya, band kar du?' : 'Markets are down';
  const r = await runCheckIn({ db, llm: fakeLlm(reading(language), { text }, { text: second }), today: TODAY, log: () => {} }, { investorId: who.investor, sipId: who.sip, moment: 'before_stop', text: reason });
  if (r.status !== 200) throw new Error(r.error);
  return r;
}

const value = (slots: Slot[], name: string, lang: 'en' | 'hinglish' | 'hi') => slots.find((s) => s.name === name)!.values[lang];

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
  const load = async (persona: string) => {
    const investor = await clonePersona(db, persona);
    const [{ id: sip }] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [investor])).rows;
    const lookup = await retrieveFacts(db, investor, sip, TODAY);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    return { investor, sip, facts: lookup.facts };
  };
  riya = await load('riya');
  arjun = await load('arjun');
}, 120_000);

describe('What each placeholder becomes: the number together with what it means', () => {
  it("fills Riya's numbers in English, Hinglish and Hindi", () => {
    const slots = slotsFor(riya.facts, { pause: true });
    expect(value(slots, 'instalments_to_go', 'en')).toBe('53 instalments still to come');
    expect(value(slots, 'instalments_to_go', 'hinglish')).toBe('53 kishtein abhi baaki');
    expect(value(slots, 'instalments_to_go', 'hi')).toBe('अभी बाकी 53 किस्तें');
    expect(value(slots, 'instalments_planned', 'en')).toBe('60 instalments planned in all');
    expect(value(slots, 'planned_total', 'en')).toBe('Rs 1,20,000 planned to be put in by the goal date');
    expect(value(slots, 'planned_total', 'hinglish')).toBe('goal ki date tak Rs 1,20,000 lagane ka plan');
    expect(value(slots, 'planned_total', 'hi')).toBe('लक्ष्य की तारीख तक Rs 1,20,000 लगाने की योजना');
    expect(value(slots, 'share_put_in_pct', 'en')).toBe('12% of the planned amount put in so far');
    expect(value(slots, 'time_to_goal', 'en')).toBe('4 years 5 months to go');
    expect(value(slots, 'time_to_goal', 'hinglish')).toBe('goal tak 4 saal 5 mahine baaki');
    expect(value(slots, 'time_to_goal', 'hi')).toBe('लक्ष्य तक 4 साल 5 महीने बाकी');
    expect(value(slots, 'goal_date', 'hi')).toBe('मार्च 2031');
    expect(value(slots, 'instalments_paid', 'hi')).toBe('7 किस्तें भरी गईं');
    expect(value(slots, 'exit_load', 'en')).toBe('an exit load of 1% if redeemed within 1 year');
    expect(value(slots, 'exit_load', 'hi')).toBe('1 साल के अंदर निकालने पर 1% एग्ज़िट लोड');
    expect(value(slots, 'pause_length', 'hinglish')).toBe('1 se 3 kishtein');
  });

  it('only offers the placeholders this SIP has: no pause range on a route without the pause explainer, no goal without one', async () => {
    expect(slotsFor(riya.facts, { pause: false }).map((s) => s.name)).not.toContain('pause_length');
    const noGoal = { ...riya.facts, goal: null, instalments_planned: null };
    const names = slotsFor(noGoal, { pause: false }).map((s) => s.name);
    for (const goalOnly of ['goal_name', 'goal_date', 'time_to_goal', 'instalments_to_go', 'planned_total', 'share_put_in_pct']) expect(names).not.toContain(goalOnly);
    expect(situation(noGoal)).toContain('No goal is set for this SIP.');
  });

  it('tells the writer what each becomes with # for the number, so the writer never sees a number', () => {
    const slots = slotsFor(riya.facts, { pause: true });
    const explainers = Object.values(loadExplainers()).map((e) => ({ ...e, id: `explainer:${e.key}`, source: '', sha256: '' }));
    const [, user] = answerMessages({ route: 'cash', slots, situation: situation(riya.facts), explainers, language: 'en', moment: 'before_stop', reason: 'I need the money' });
    expect(user.content).toContain('- {instalments_to_go}: # instalments still to come');
    expect(user.content).toContain('- {planned_total}: Rs # planned to be put in by the goal date');
    expect(user.content).toContain('{pause_length}');
    expect(user.content).not.toMatch(/\d/);
  });

  it("keeps the pause range in step with the explainers, and shows the writer no number in them", () => {
    const { pause, stop } = loadExplainers();
    for (const e of [pause, stop]) {
      expect(e.text).toContain(`${PAUSE_RANGE[0]} to ${PAUSE_RANGE[1]} instalments`);
      expect(explainerForWriter(e.text)).not.toMatch(/\d/);
    }
  });
});

describe('Example 1: "53 instalments planned", when 53 are still to come', () => {
  it.each([
    ['en', 'You have 53 instalments planned. You can keep, skip, pause or lower the amount. This is not investment advice.'],
    ['hinglish', 'Aapki 53 kishtein plan mein hain. Aap keep, skip, pause ya amount lower kar sakte hain. This is not investment advice.'],
    ['hi', 'आपकी 53 किस्तों की योजना है। आप जारी रख सकते हैं, skip, pause या amount कम कर सकते हैं। This is not investment advice.'],
  ] as const)('is blocked when the model writes the number itself (%s): facts only', async (language, text) => {
    const r = await reply(riya, language, text);
    expect(r).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['grounded'] }, text: cardText('fallback', language) });
    expect(r.checks!.ungrounded).toContain('written by the AI: 53');
  });

  it.each([
    ['en', 'You have {instalments_to_go}. This is not investment advice.', '53 instalments still to come'],
    ['hinglish', 'Aapki {instalments_to_go} hain, aur aap pause kar sakte hain. This is not investment advice.', '53 kishtein abhi baaki'],
    ['hi', 'आपकी {instalments_to_go} हैं। This is not investment advice.', 'अभी बाकी 53 किस्तें'],
  ] as const)('is impossible with placeholders (%s): 53 only ever arrives as the instalments still to come', async (language, text, phrase) => {
    const r = await reply(riya, language, text);
    expect(r.outcome).toBe('answer');
    expect(r.text).toContain(phrase);
    // Even a writer that calls it "planned" can't detach 53 from its meaning.
    const misused = fillSlots('You have {instalments_to_go} planned.', slotsFor(riya.facts, { pause: false }), 'en');
    expect(misused).toBe('You have 53 instalments still to come planned.');
    expect(misused).not.toMatch(/53 instalments planned/);
  });
});

describe('Example 2: "goal of Rs 85,500 is 12% complete", when Rs 85,500 is the planned amount', () => {
  it("is Arjun's planned amount and share", () => {
    const slots = slotsFor(arjun.facts, { pause: false });
    expect(value(slots, 'planned_total', 'en')).toBe('Rs 85,500 planned to be put in by the goal date');
    expect(value(slots, 'share_put_in_pct', 'en')).toBe('12% of the planned amount put in so far');
  });

  it.each([
    ['en', 'Your goal of Rs 85,500 is 12% complete. This is not investment advice.'],
    ['hinglish', 'Aapka Rs 85,500 ka goal 12% poora ho gaya hai, aap pause kar sakte hain. This is not investment advice.'],
    ['hi', 'आपका Rs 85,500 का लक्ष्य 12% पूरा हो गया है। This is not investment advice.'],
  ] as const)('is blocked when the model writes the numbers itself (%s): facts only', async (language, text) => {
    const r = await reply(arjun, language, text);
    expect(r).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['grounded'] } });
    expect(r.checks!.ungrounded).toEqual(expect.arrayContaining(['written by the AI: 85,500', 'written by the AI: 12']));
  });

  it.each([
    ['en', 'Your goal of {planned_total} is {share_put_in_pct} complete. This is not investment advice.', 'Rs 85,500 planned to be put in by the goal date'],
    ['hinglish', 'Aapke goal ka {planned_total} hai, aur {share_put_in_pct}. This is not investment advice.', 'goal ki date tak Rs 85,500 lagane ka plan'],
    ['hi', 'आपके लक्ष्य की {planned_total} है, और {share_put_in_pct}। This is not investment advice.', 'लक्ष्य की तारीख तक Rs 85,500 लगाने की योजना'],
  ] as const)('is impossible with placeholders (%s): Rs 85,500 only ever arrives as the planned amount', async (language, text, phrase) => {
    const r = await reply(arjun, language, text);
    expect(r.outcome).toBe('answer');
    expect(r.text).toContain(phrase);
    expect(r.text).not.toMatch(/goal of Rs 85,500 is/);
  });
});

describe('Anything the model writes itself fails "Numbers match your SIP"', () => {
  // A SIP's placeholders, without the pause range (a route without the pause explainer).
  const names = ['instalment_amount', 'goal_name', 'goal_date', 'time_to_goal', 'put_in_so_far', 'instalments_to_go'];

  it.each([
    ['digits', 'You have 7 instalments paid.', ['7']],
    ['an amount', 'You have put in Rs 14,000.', ['14,000']],
    ['a percentage', 'It is down 14.5%.', ['14.5']],
    ['an English number word', 'You have five instalments to go.', ['five']],
    ['lakh', 'Your plan is over a lakh.', ['lakh']],
    ['half', 'Half the plan is done.', ['Half']],
    ['a Hinglish number word', 'Aapki teen kishtein baaki hain.', ['teen']],
    ['a Hindi number word', 'आपकी पाँच किस्तें बाकी हैं।', ['पाँच']],
    ['Devanagari digits', 'आपकी ५३ किस्तें बाकी हैं।', ['५३']],
    ['an unknown placeholder', 'Your goal needs {goal_target}.', ['{goal_target}']],
    ['a placeholder this SIP does not have', 'Pause for {pause_length}.', ['{pause_length}']],
    ['a stray brace', 'Your {goal_name is set.', ['a stray brace']],
  ])('%s', (_what, text, found) => {
    expect(writtenNumbers(text, names)).toEqual(found);
  });

  it('lets ordinary words through: "one", "ek", "do", "saath", and words that only contain a number word', () => {
    expect(writtenNumbers('Skip the next one. Aap ek kisht skip kar do. Ghar ke saath. Often, on behalf, tense, weight. {instalment_amount}', names)).toEqual([]);
  });
});

describe('Filling in', () => {
  it('starts a sentence with a capital, and drops a "Rs" or "%" the model doubled', () => {
    const slots = slotsFor(riya.facts, { pause: false });
    const filled = fillSlots('{value_today}. You have Rs {put_in_so_far}, which is {share_put_in_pct}%.', slots, 'en');
    expect(filled).toMatch(/^A value today of Rs [\d,]+\. You have Rs 14,000 put in so far, which is 12% of the planned amount put in so far\.$/);
  });

  // Eval run #24 (2 Nov) showed these to investors: "1 to 3 instalments instalments", "an exit load of an exit
  // load of 1% ...", "goal tak 4 saal 1 mahina baaki baaki hai", "Your a value today of ...", "a a fall of ...".
  it('drops words the model repeats next to a placeholder, in every language', () => {
    const slots = slotsFor(riya.facts, { pause: true });
    expect(fillSlots('Pause for {pause_length} instalments.', slots, 'en')).toBe('Pause for 1 to 3 instalments.');
    expect(fillSlots('Redeeming may have an exit load of {exit_load}.', slots, 'en')).toBe('Redeeming may have an exit load of 1% if redeemed within 1 year.');
    expect(fillSlots('Aapke paas {time_to_goal} baaki hai.', slots, 'hinglish')).toBe('Aapke paas goal tak 4 saal 5 mahine baaki hai.');
    expect(fillSlots('Aap {pause_length} kishtein ke liye pause kar sakte hain.', slots, 'hinglish')).toBe('Aap 1 se 3 kishtein ke liye pause kar sakte hain.');
    expect(fillSlots('आपकी अभी {instalments_to_go} किस्तें हैं।', slots, 'hi')).toBe('आपकी अभी बाकी 53 किस्तें हैं।');
  });

  it('drops an English value\'s own "a" after "your", "the" or "Today\'s"', () => {
    const slots = slotsFor(riya.facts, { pause: false });
    const today = value(slots, 'value_today', 'en');
    expect(today).toMatch(/^a value today of /);
    expect(fillSlots('Your {value_today} is below what you put in.', slots, 'en')).toBe(`Your ${today.slice(2)} is below what you put in.`);
    expect(fillSlots('It has {value_today}.', slots, 'en')).toBe(`It has ${today}.`);
    // Hindi and Hinglish values have no article to drop.
    expect(fillSlots('Aapki {value_today} hai.', slots, 'hinglish')).toBe(`Aapki ${value(slots, 'value_today', 'hinglish')} hai.`);
  });

  it('leaves the words alone when they only look alike, or are not at the edge', () => {
    const slots = slotsFor(riya.facts, { pause: false });
    expect(fillSlots('You have {instalments_to_go} planned.', slots, 'en')).toBe('You have 53 instalments still to come planned.');
    expect(fillSlots('Your SIP for {goal_name} is set.', slots, 'en')).toBe('Your SIP for Home down payment is set.');
  });
});

describe('Comparisons between two numbers the model cannot see', () => {
  it.each([
    ['en', 'Today {worst_fall} is larger than {fund_biggest_fall}.', ['larger than']],
    ['en, more than', 'It has {put_in_so_far}, more than {value_today}.', ['more than']],
    ['hinglish', 'Aapki {worst_fall} {fund_biggest_fall} se badi hai.', ['se badi']],
    ['hi', 'आपकी {worst_fall} {fund_biggest_fall} से बड़ी है।', ['से बड़ी']],
  ])('are found (%s)', (_what, text, found) => {
    expect(comparisons(text)).toEqual(found);
  });

  it('let numbers side by side through, and a comparison with only one placeholder in its sentence', () => {
    expect(comparisons('{worst_fall}, next to {fund_biggest_fall}.')).toEqual([]);
    expect(comparisons('Each future instalment buys {units_now}, against {units_at_peak}.')).toEqual([]);
    expect(comparisons('You can lower the amount to less than {instalment_amount}. Your goal is {goal_name}.')).toEqual([]);
    expect(comparisons('जैसे कम {worst_fall} {fund_biggest_fall} हैं।')).toEqual([]);
  });
});

describe('v14: the doubt answer names its placeholders, and the Hinglish and Hindi falls are shorter', () => {
  const doubt = (facts: SipFacts, route: 'doubt' | 'cash' = 'doubt') =>
    answerMessages({ route, slots: slotsFor(facts, { pause: route === 'cash' }), situation: situation(facts), explainers: [], language: 'hinglish', moment: 'before_stop', reason: 'Market gir gaya' })[0].content;

  it('names only the placeholders this SIP has for the doubt route, and asks for no others', () => {
    const system = doubt(riya.facts);
    expect(system).toContain(
      "Put today's value in the context of their goal and time to go, the months invested, the worst fall since start and the biggest fall in this fund's demo history, with these placeholders only: {value_today}, {months_invested}, {worst_fall}, {fund_biggest_fall}, {goal_name}, {time_to_goal}.",
    );
    expect(system).toContain('Each already says what its number is, so write no words around it that say that again.');
    // Not the extra ones run #26's s01 used.
    expect(system).not.toMatch(/\{put_in_so_far\}|\{change_vs_put_in\}/);
    // With no goal: no goal placeholder, and no goal to set the value against.
    const noGoal = doubtGuidance(new Set(slotsFor({ ...riya.facts, goal: null, instalments_planned: null }, { pause: false }).map((s) => s.name)));
    expect(noGoal).not.toMatch(/goal/);
    // Other routes keep their own guidance.
    expect(doubt(riya.facts, 'cash')).not.toContain('with these placeholders only');
  });

  it('fills the shorter fall phrases in Hinglish and Hindi', () => {
    const slots = slotsFor(riya.facts, { pause: false });
    // v16: the fall is named first, so it reads as a phrase in a sentence.
    expect(value(slots, 'worst_fall', 'hinglish')).toMatch(/^SIP shuru hone ke baad sabse badi giravat -\d+\.\d%$/);
    expect(value(slots, 'worst_fall', 'hi')).toMatch(/^SIP शुरू होने के बाद सबसे बड़ी गिरावट -\d+\.\d%$/);
    expect(value(slots, 'fund_biggest_fall', 'hinglish')).toMatch(/^fund ki demo history ki sabse badi giravat -\d+\.\d% \([A-Z][a-z]{2} \d{4}\)$/);
    expect(value(slots, 'fund_biggest_fall', 'hi')).toMatch(/^फंड के डेमो इतिहास की सबसे बड़ी गिरावट -\d+\.\d% \(\S+ \d{4}\)$/);
  });
});

// Eval run #27 and the live site (3 Nov) showed investors "You've invested for 8 months invested", "53 instalments
// still to come left over 4 years 4 months to go", "buys 30.6 units per instalment at the latest NAV now" and "Your
// value today of Rs 11,964 is still on track for Home down payment".
describe("v15: a value leaves out what the model's own words next to it already say", () => {
  const fill = (text: string, lang: 'en' | 'hinglish' | 'hi' = 'en') => fillSlots(text, slotsFor(riya.facts, { pause: true }), lang);

  it.each([
    ['You’ve invested for {months_invested} with {instalments_paid} and no gaps.', 'You’ve invested for 7 months with 7 instalments paid and no gaps.'],
    [
      'You’ve put in {share_put_in_pct} for your {goal_name} with {instalments_to_go} left over {time_to_goal}. Each instalment buys {units_now} now.',
      'You’ve put in 12% of the planned amount for your Home down payment with 53 instalments left over 4 years 5 months. Each instalment buys 30.6 units now.',
    ],
    [
      'The worst fall since you started was {worst_fall}, but this fund’s demo history shows a {fund_biggest_fall}.',
      'The worst fall since you started was -19.9%, but this fund’s demo history shows a -21.0% fall in May 2023, the biggest.',
    ],
    [
      'Your {worst_fall} is the biggest since your SIP started. Each future instalment buys {units_now} instead of {units_at_peak}.',
      "Your fall of -19.9% is the biggest since your SIP started. Each future instalment buys 30.6 units at the latest NAV instead of 24.5 units at the SIP's peak NAV.",
    ],
    // The same placeholder twice, each with its own words; "the next" one is the instalment, not "a month".
    [
      'You could skip the next {instalment_amount}, or lower the {instalment_amount}. Your {goal_name} has {time_to_goal} left. It is due in {time_to_goal}.',
      'You could skip the next Rs 2,000 instalment, or lower the Rs 2,000 instalment. Your Home down payment has 4 years 5 months left. It is due in 4 years 5 months.',
    ],
  ])('in English: %s', (text, filled) => {
    expect(fill(text)).toBe(filled);
  });

  it('in Hinglish and Hindi', () => {
    expect(fill('{goal_name} ke liye {time_to_goal} bacha hai. Aap {months_invested} se SIP chala rahe hain. Fund ka sabse bada fall {fund_biggest_fall} tha.', 'hinglish')).toBe(
      'Home down payment ke liye 4 saal 5 mahine bacha hai. Aap 7 mahine se SIP chala rahe hain. Fund ka sabse bada fall -21.0% (May 2023) tha.',
    );
    expect(fill('{goal_name} के लिए {time_to_goal} बचा है।', 'hi')).toBe('Home down payment के लिए 4 साल 5 महीने बचा है।');
  });

  it('keeps every word of the value where the words around it say nothing of its meaning, or in another clause', () => {
    expect(fill('This is the {worst_fall}. You have {months_invested}, {instalments_to_go} and {time_to_goal}.')).toBe(
      'This is the fall of -19.9%, the worst since your SIP started. You have 7 months invested, 53 instalments still to come and 4 years 5 months to go.',
    );
    // "left" belongs to the first clause, not to the placeholder after the comma.
    expect(fill('You have nothing left, {months_invested}.')).toBe('You have nothing left, 7 months invested.');
    expect(fill('आपकी {instalments_to_go} हैं।', 'hi')).toBe('आपकी अभी बाकी 53 किस्तें हैं।');
  });

  it('still checks every number it fills in, and shows the shorter answer', async () => {
    const r = await reply(riya, 'en', 'You’ve invested for {months_invested} with {instalments_to_go} left over {time_to_goal}. Each instalment buys {units_now} now. This is not investment advice.');
    expect(r).toMatchObject({ outcome: 'answer', checks: { grounded: true, ungrounded: [] } });
    expect(r.text).toBe('You’ve invested for 7 months with 53 instalments left over 4 years 5 months. Each instalment buys 30.6 units now. This is not investment advice.');
  });

  it('fails "No unsupported claims" for "on track" or "part of the journey", with no second try', async () => {
    for (const [language, text] of [
      ['en', 'Your {value_today} is still on track for {goal_name} in {time_to_goal}. This is not investment advice.'],
      ['en', 'Today’s {worst_fall} is part of the journey. This is not investment advice.'],
      ['hinglish', 'Aap {goal_name} ke liye track par hain. Yeh investment advice nahi hai. This is not investment advice.'],
      ['hi', 'आप {goal_name} के लिए सही रास्ते पर हैं। यह निवेश सलाह नहीं है। This is not investment advice.'],
    ] as const) {
      const r = await reply(riya, language, text);
      expect(r, text).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['no_claims'] } });
      expect(r.checks!.second_draft, text).toBeUndefined();
    }
  });
});

describe('v12: one second draft, for what the writer can fix', () => {
  /** A Before you stop check-in in English with the given writer replies after the reading. */
  async function checkIn(...writes: (object | LlmError)[]) {
    const llm = fakeLlm(reading('en'), ...writes);
    const r = await runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId: riya.investor, sipId: riya.sip, moment: 'before_stop', text: 'Markets are down' });
    if (r.status !== 200) throw new Error(r.error);
    return { r, llm };
  }
  const long = `${'You can keep your SIP going. '.repeat(14)}{fund_biggest_fall}. This is not investment advice.`;
  const short = 'Your SIP for {goal_name} has {time_to_goal}. You can keep, skip, pause or lower the amount. This is not investment advice.';

  it('asks again when the answer is too long once filled in, in words with no numbers, and shows a second draft that fits', async () => {
    const { r, llm } = await checkIn({ text: long }, { text: short });
    expect(r).toMatchObject({ outcome: 'answer', checks: { length: true, second_draft: ['length'] } });
    expect(r.text).toBe('Your SIP for Home down payment has 4 years 5 months to go. You can keep, skip, pause or lower the amount. This is not investment advice.');
    expect(llm.calls).toHaveLength(3);
    const [system, , draft, ask] = llm.calls[2];
    // The same prompt, the first draft as the writer's own reply, then what to fix.
    expect(system.content).toBe(llm.calls[1][0].content);
    expect(draft).toEqual({ role: 'assistant', content: JSON.stringify({ text: long }) });
    // 101 words filled in: just over the limit, but the second draft aims well under it (v13).
    expect(ask.content).toContain('Once the placeholders are filled in, it is too long: make it about a third shorter.');
    expect(ask.content).toContain('{fund_biggest_fall}');
    // Still no number: not the word count, not the limit.
    expect(ask.content).not.toMatch(/\d/);
    const [row] = (await db.query<{ checks: { first_draft: string; model_text: string } }>('SELECT checks FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows;
    expect(row.checks).toMatchObject({ first_draft: long, model_text: short });
  });

  it('asks for a second draft only over the limit, and measures how much too long against an aim well under it', () => {
    const slots = slotsFor(riya.facts, { pause: false });
    const longer = (n: number) => `${'You can keep your SIP going. '.repeat(n)}This is not investment advice.`;
    const over = (n: number) => (draftProblems(longer(n), slots, 'en')[0] as { over: number }).over;
    // Six words a sentence, and the disclaimer's five.
    expect(draftProblems(longer(14), slots, 'en')).toEqual([]); // 89 words: within the limit, no second draft
    expect(over(15)).toBeCloseTo(95 / 75); // "about a third shorter"
    expect(over(16)).toBeLessThanOrEqual(1.4); // 101
    expect(over(17)).toBeGreaterThan(1.4); // 107: "about half as long"
  });

  it('asks again for a number the model wrote, without showing it back, and names an unknown placeholder', async () => {
    const { r, llm } = await checkIn({ text: 'You have put in Rs 14,000 for {goal_target}. This is not investment advice.' }, { text: short });
    expect(r).toMatchObject({ outcome: 'answer', checks: { grounded: true, second_draft: ['numbers'] } });
    const ask = llm.calls[2][3].content;
    expect(ask).toContain('It states a number in its own words or digits. {goal_target} is not a placeholder you have.');
    expect(ask).not.toMatch(/\d/);
  });

  it('fails "Numbers match your SIP" when the second draft still compares two numbers', async () => {
    const compares = 'Your {worst_fall} is larger than {fund_biggest_fall}. This is not investment advice.';
    const { r, llm } = await checkIn({ text: compares }, { text: compares });
    expect(r).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['grounded'] }, checks: { second_draft: ['comparison'] } });
    expect(r.checks!.ungrounded).toEqual(['compared by the AI: larger than']);
    expect(llm.calls[2][3].content).toContain('It compares numbers ("larger than")');
  });

  it('gives advice or an unsupported claim no second try, even in a draft that is also too long', async () => {
    for (const text of [`You should continue your SIP. ${long}`, `This dip is temporary. ${long}`]) {
      // Only one writer reply: a second-draft request would be an unexpected extra call.
      const { r, llm } = await checkIn({ text });
      expect(r.outcome).toBe('fallback');
      expect(llm.calls).toHaveLength(2);
      expect(r.checks!.second_draft).toBeUndefined();
    }
  });

  it('checks the first draft as it is when the second-draft call fails', async () => {
    const { r } = await checkIn({ text: long }, new LlmError('Mistral did not answer within 10 s'));
    expect(r).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'checks', failed: ['length'] }, checks: { second_draft: ['length'] } });
  });
});

describe('Task 2: every facts-only card carries the disclaimer, as an AI answer does', () => {
  it.each(['advice', 'prediction', 'fallback'] as const)('the %s card, in each language', (kind) => {
    expect(cardText(kind, 'en').endsWith(' This is not investment advice.')).toBe(true);
    expect(cardText(kind, 'other').endsWith(' This is not investment advice.')).toBe(true);
    // Once, in the reply's language: the site's banner has it in English.
    expect(cardText(kind, 'hinglish').endsWith(' Yeh investment advice nahi hai.')).toBe(true);
    expect(cardText(kind, 'hi').endsWith(' यह निवेश सलाह नहीं है।')).toBe(true);
    expect(cardText(kind, 'hinglish')).not.toContain('This is not investment advice.');
    expect(cardText(kind, 'hi')).not.toContain('This is not investment advice.');
  });
});

describe("Task 3: the quality-check line in the reply's language and script, from fixed translations", () => {
  const line = (language: Language, r: Partial<Parameters<typeof gateLine>[0]>) =>
    gateLine({ outcome: 'fallback', declineKind: null, fallbackReason: { kind: 'error' }, language, ...r });

  it('says why only facts are shown in English, Hinglish or Hindi', () => {
    expect(line('en', { outcome: 'declined', declineKind: 'advice', fallbackReason: null })).toBe('Quality check: advice question detected → showing facts only');
    expect(line('hinglish', { outcome: 'declined', declineKind: 'advice', fallbackReason: null })).toBe('Quality check: advice ka sawaal mila → sirf facts dikha rahe hain');
    expect(line('hi', { outcome: 'declined', declineKind: 'advice', fallbackReason: null })).toBe('गुणवत्ता जाँच: सलाह का सवाल मिला → सिर्फ़ तथ्य दिखा रहे हैं');
    expect(line('hinglish', { outcome: 'declined', declineKind: 'prediction', fallbackReason: null })).toBe('Quality check: market ke andaaze ka sawaal mila → sirf facts dikha rahe hain');
    expect(line('hi', { outcome: 'declined', declineKind: 'prediction', fallbackReason: null })).toBe('गुणवत्ता जाँच: बाज़ार के अनुमान का सवाल मिला → सिर्फ़ तथ्य दिखा रहे हैं');
    expect(line('hi', { fallbackReason: { kind: 'checks', failed: ['grounded', 'no_claims'] } })).toBe(
      'गुणवत्ता जाँच: एक आंकड़ा आपके SIP से मेल नहीं खाया; जवाब में बेबुनियाद दावा था → सिर्फ़ तथ्य दिखा रहे हैं',
    );
    expect(line('hinglish', { fallbackReason: { kind: 'unsure' } })).toBe('Quality check: samajh nahi aaya aap kya kehna chahte hain → sirf facts dikha rahe hain');
    expect(line('other', { fallbackReason: { kind: 'timeout' } })).toBe('Quality check: AI unavailable → showing facts only');
    expect(line('en', { outcome: 'answer', fallbackReason: null })).toBeNull();
  });

  it('writes Hindi lines in Devanagari and Hinglish lines in Latin letters, for every reason', () => {
    const reasons: Partial<Parameters<typeof gateLine>[0]>[] = [
      { outcome: 'declined', declineKind: 'advice', fallbackReason: null },
      { outcome: 'declined', declineKind: 'prediction', fallbackReason: null },
      { fallbackReason: { kind: 'unsure' } },
      { fallbackReason: { kind: 'facts' } },
      { fallbackReason: { kind: 'error' } },
      { fallbackReason: { kind: 'checks', failed: ['no_advice', 'grounded', 'disclaimer', 'length', 'no_claims', 'in_language'] } },
    ];
    for (const r of reasons) {
      const hi = line('hi', r)!;
      const hinglish = line('hinglish', r)!;
      expect(hi.replace(/SIP|AI/g, '')).not.toMatch(/[A-Za-z]/);
      expect(hinglish).not.toMatch(/[ऀ-ॿ]/);
      expect(hinglish).not.toBe(line('en', r));
    }
  });
});
