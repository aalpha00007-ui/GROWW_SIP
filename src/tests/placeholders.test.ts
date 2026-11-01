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
import { cardText, runCheckIn, type CheckInResult } from '../pipeline/retrieval/checkin';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { answerMessages, explainerForWriter, type Language } from '../pipeline/retrieval/prompts';
import { fillSlots, PAUSE_RANGE, situation, slotsFor, writtenNumbers, type Slot } from '../pipeline/retrieval/slots';
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

/** A Before you stop check-in whose reader says `language`, and whose writer replies `text`. */
async function reply(who: typeof riya, language: Language, text: string): Promise<Extract<CheckInResult, { status: 200 }>> {
  const reason = language === 'hi' ? 'बाज़ार गिर गया, SIP बंद कर दूँ?' : language === 'hinglish' ? 'Market gir gaya, band kar du?' : 'Markets are down';
  const r = await runCheckIn({ db, llm: fakeLlm(reading(language), { text }), today: TODAY, log: () => {} }, { investorId: who.investor, sipId: who.sip, moment: 'before_stop', text: reason });
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
});

describe('Task 2: every facts-only card carries the disclaimer, as an AI answer does', () => {
  it.each(['advice', 'prediction', 'fallback'] as const)('the %s card, in each language', (kind) => {
    expect(cardText(kind, 'en').endsWith(' This is not investment advice.')).toBe(true);
    expect(cardText(kind, 'other').endsWith(' This is not investment advice.')).toBe(true);
    expect(cardText(kind, 'hinglish').endsWith(' Yeh investment advice nahi hai. This is not investment advice.')).toBe(true);
    expect(cardText(kind, 'hi').endsWith(' यह निवेश सलाह नहीं है। This is not investment advice.')).toBe(true);
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
