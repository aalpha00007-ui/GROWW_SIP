// The must-pass goal invariants, on their own: separate from the golden set and the eval cases, with no AI at all.
// (a) any goal date in a reply is the stored goal date; (b) no goal: never invent one; (c) a past goal date is never
// called upcoming. A break fails the answer, so the investor gets the facts-only card (retrieval tests cover that).
import { describe, expect, it } from 'vitest';
import type { SipFacts } from '../pipeline/chunking/facts';
import { allPassed, runChecks } from '../pipeline/retrieval/checks';
import { goalFactsCheck } from '../pipeline/retrieval/goal-check';
import { loadClaimPatterns } from '../pipeline/loading/fixtures';

const facts: SipFacts = {
  sip_id: 1, today: '2026-10-27', as_of: '2026-10-27', fund_name: 'Banyan Flexi Cap Fund', fund_category: 'Equity', amount: 2000, months_invested: 7,
  instalments_paid: 7, instalments_skipped: 0, scheduled_skips: 0, invested: 14000, current_value: 12086, worst_fall_since_start_pct: -14.2,
  fund_biggest_fall: { pct: -18.4, date: '2023-05-14' }, next_due_date: '2026-11-02',
  goal: { name: 'Home down payment', target_month: '2031-03-01' }, instalments_planned: 60, instalments_to_go: 53, planned_put_in: 120000,
};
const noGoal: SipFacts = { ...facts, goal: null, instalments_planned: null, instalments_to_go: null, planned_put_in: null };
const passed: SipFacts = { ...facts, goal: { name: 'Home down payment', target_month: '2026-06-01' }, instalments_to_go: 0 };

const ok = (text: string, f = facts) => expect(goalFactsCheck(text, f), text).toMatchObject({ ok: true, problems: [] });
const broken = (text: string, f = facts) => {
  const check = goalFactsCheck(text, f);
  expect(check.ok, text).toBe(false);
  return check.problems;
};

describe('(a) any goal date in the reply is the stored goal date', () => {
  it.each([
    'Your SIP is for Home down payment, by Mar 2031.',
    'Your goal date is March 2031.',
    'Aapka goal Mar 2031 tak hai.',
    'आपका लक्ष्य मार्च 2031 तक है।',
    'Your next instalment is on 2 Nov 2026, for your goal.',
    'The biggest fall in this fund was -18.4% in May 2023.',
    'You can keep going. You may skip the next instalment for your goal.',
  ])('passes: %s', (text) => ok(text));

  it.each([
    ['another year', 'Your goal is by Mar 2032.'],
    ['another month', 'Your Home down payment is by Dec 2030.'],
    ['a month with no year', 'Your goal is this December.'],
    ['in Hindi', 'आपका लक्ष्य दिसंबर 2030 तक है।'],
    ['the fund history date given as the goal', 'Your goal is by May 2023.'],
    ['the next instalment date given as the goal', 'Your goal is by 2 Nov 2026.'],
    ['a date in no fact', 'You bought units in Jun 2021.'],
  ])('fails %s', (_what, text) => {
    expect(broken(text).join()).toContain('not the goal date');
  });

  it('fails the right date doing the wrong job, as run #27 did', () => {
    const arjun: SipFacts = { ...facts, goal: { name: 'Home down payment', target_month: '2030-12-01' } };
    expect(broken('Since you are buying the house this Dec 2030, you can stop the SIP now.', arjun).join()).toContain('this month');
    // In the goal's own month, "this" is true.
    ok('Your goal is this Mar 2031.', { ...facts, today: '2031-03-10' });
  });
});

describe('(b) no goal: never invent one', () => {
  it.each([
    'No goal is set for this SIP.',
    'This SIP has no goal set.',
    "You haven't set a goal.",
    'Is SIP ke liye koi goal set nahi hai.',
    'इस SIP के लिए कोई लक्ष्य तय नहीं है।',
    'Your SIP has Rs 14,000 put in so far.',
  ])('passes: %s', (text) => ok(text, noGoal));

  it.each([
    'Your goal is close.',
    'This keeps you moving towards your goal.',
    'Your target is within reach.',
    'Aapka goal abhi door hai.',
    'आपका लक्ष्य अभी दूर है।',
    'Your SIP will run until Mar 2031.',
  ])('fails: %s', (text) => {
    expect(broken(text, noGoal).length).toBeGreaterThan(0);
  });
});

describe('(c) a past goal date is never called upcoming', () => {
  it.each([
    'The date for your Home down payment, Jun 2026, has passed.',
    'Your goal has no time left: the goal date has passed.',
    'Goal ki date nikal chuki hai.',
    'लक्ष्य की तारीख निकल चुकी है।',
    'Your goal date has passed, and your next instalment is on 2 Nov 2026.',
    'You have Rs 14,000 put in.',
  ])('passes: %s', (text) => ok(text, passed));

  it.each([
    'Your goal is coming up.',
    'Your upcoming goal is Home down payment.',
    'Your Home down payment is 4 months away.',
    'You still have time left for your goal.',
    'Home down payment ke liye 3 mahine baaki hain.',
    'लक्ष्य के लिए अभी समय बाकी है।',
  ])('fails: %s', (text) => {
    expect(broken(text, passed).join()).toContain('upcoming');
  });

  it('says nothing of the kind for a goal still ahead', () => {
    ok('Your goal is 4 years 5 months away, with 53 instalments still to come.');
  });
});

describe('Every invariant is must-pass', () => {
  const check = (text: string, f: SipFacts) => runChecks(text, ['Rs 14,000'], [], [], 'en', undefined, f);

  it('fails the answer as a whole', () => {
    for (const [text, f] of [
      ['Your goal is by Dec 2035. This is not investment advice.', facts],
      ['Your goal is close. This is not investment advice.', noGoal],
      ['Your goal is coming up. This is not investment advice.', passed],
    ] as const) {
      const c = check(text, f);
      expect(c.goal_facts, text).toBe(false);
      expect(c.goal_problems.length).toBeGreaterThan(0);
      expect(allPassed(c), text).toBe(false);
    }
  });

  it('passes a true answer', () => {
    const c = check('Your SIP has Rs 14,000 put in so far. This is not investment advice.', facts);
    expect(c.goal_facts).toBe(true);
    expect(allPassed(c)).toBe(true);
  });
});

describe('Historical falls never imply a floor or a recovery', () => {
  const claims = loadClaimPatterns();
  const flagged = (text: string) => claims.some((p) => p.regex.test(text));

  it.each([
    ["won't fall more than this", "This fund won't fall more than -18%."],
    ['will not fall further', 'It will not fall further.'],
    ['always recovers', 'This fund always recovers.'],
    ['always bounced back', 'It has always bounced back.'],
    ['will bounce back', 'Your SIP will bounce back.'],
    ['usually recovers', 'A fund usually recovers after this.'],
    ['historically recovered', 'It historically recovered within a year.'],
    ['a floor', 'That was the floor for this fund.'],
    ['the bottom', 'The fund has bottomed out.'],
    ['the worst is over', 'The worst is over.'],
    ['a recovery', 'A recovery may follow.'],
    ['a rebound', 'It rebounded last time.'],
    ['Hinglish floor', 'Isse zyada nahi girega.'],
    ['Hinglish floor 2', 'Fund aur nahi girega.'],
    ['Hinglish recovery', 'Fund hamesha wapas aata hai.'],
    ['Hinglish come back', 'Value wapas aa jayega.'],
    ['Hinglish recover', 'Yeh recover ho jayega.'],
    ['Hindi floor', 'यह इससे ज़्यादा नहीं गिरेगा।'],
    ['Hindi floor 2', 'अब और नहीं गिरेगा।'],
    ['Hindi recovery', 'फंड हमेशा वापस आता है।'],
    ['Hindi come back', 'यह वापस आएगा।'],
    ['Hindi overcome', 'यह उबर जाएगा।'],
  ])('fails %s', (_what, text) => {
    expect(flagged(text), text).toBe(true);
  });

  it.each([
    "The biggest fall in this fund's demo history was -21.0% in May 2023.",
    'The worst fall since your SIP started was -20.7%.',
    'fund ki demo history ki sabse badi giravat -21.0% (May 2023)',
    'SIP शुरू होने के बाद सबसे बड़ी गिरावट -20.7%',
    'Each instalment buys units at the NAV on its date.',
  ])('leaves a plain statement of history alone: %s', (text) => {
    expect(flagged(text), text).toBe(false);
  });
});

describe('No answer states an expected or typical return', () => {
  const claims = loadClaimPatterns();
  const flagged = (text: string) => claims.some((p) => p.regex.test(text));

  it.each([
    'The typical return on this kind of fund is high.',
    'Average returns are better over time.',
    'Expected returns depend on the market.',
    'Equity funds usually give more than that.',
    'Returns are generally higher later.',
    'On average returns are higher.',
    'Aam taur par return zyada hota hai.',
    'Usually is fund ka return accha hota hai.',
    'औसत रिटर्न ज़्यादा होता है।',
    'आम तौर पर रिटर्न अच्छा होता है।',
  ])('fails: %s', (text) => {
    expect(flagged(text), text).toBe(true);
  });

  it.each(['This app can’t say what return to expect.', 'Your value moves with the NAV, up and down.', 'Returns can add to this or take away from it.'])(
    'leaves this alone: %s',
    (text) => {
      expect(flagged(text), text).toBe(false);
    },
  );
});
