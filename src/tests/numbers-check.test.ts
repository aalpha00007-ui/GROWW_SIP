// Task 1: the "Numbers match your SIP" check, on a SIP's real facts unit, the way the check-in runs it.
// Pure code: no database and no AI.
import { describe, expect, it } from 'vitest';
import { buildFactsUnit, type SipFacts } from '../pipeline/chunking/facts';
import { numberTokens } from '../pipeline/chunking/format';
import { loadExplainers } from '../pipeline/loading/fixtures';
import { runChecks } from '../pipeline/retrieval/checks';

// Riya's first SIP on the day of a fall: Rs 2,000 a month, 7 paid, 53 to go, a goal in Mar 2031.
const facts: SipFacts = {
  sip_id: 1, today: '2026-10-27', as_of: '2026-10-27', fund_name: 'Banyan Flexi Cap Fund', fund_category: 'Equity',
  amount: 2000, months_invested: 7, instalments_paid: 7, instalments_skipped: 0, invested: 14000, current_value: 12086,
  worst_fall_since_start_pct: -14.2, fund_biggest_fall: { pct: -18.43, date: '2025-03-14' }, latest_nav: 45.21, peak_nav_since_start: 48.1,
  next_due_date: '2026-11-02', goal: { name: 'Home down payment', target_month: '2031-03-01' }, instalments_planned: 60,
};
const unit = buildFactsUnit(facts);
const pauseNumbers = numberTokens(loadExplainers().pause.text);

/** The numbers check as the check-in runs it; `pause` adds the pause explainer, as the cash route does. */
function check(text: string, { pause = false } = {}) {
  const explained = pause ? pauseNumbers : [];
  const c = runChecks(`${text} This is not investment advice.`, [...unit.numbers, ...explained], [], [], 'en', {
    instalments: [...unit.kinds.instalments, ...explained],
    units: unit.kinds.units,
    dates: unit.kinds.dates,
  });
  return { grounded: c.grounded, ungrounded: c.ungrounded };
}

describe('The numbers check: what it lets through', () => {
  it('knows which fact numbers count instalments and which count units', () => {
    expect(unit.kinds).toEqual({ instalments: ['7', '0', '60', '53'], units: ['44.2', '41.6'], dates: ['27 Oct', '2 Nov'] });
    expect(pauseNumbers).toEqual(['1', '3']);
  });

  it.each([
    ['an amount as the facts write it', 'You have put in Rs 14,000 of the Rs 1,20,000 planned (12%).'],
    ['the rupee sign', 'You have put in ₹14,000 so far.'],
    ['"Rs." with a dot', 'You have put in Rs. 14,000 so far.'],
    ['rupees as a word', 'You have put in 14,000 rupees.'],
    ['an amount without its comma', 'Rs 14000 is in so far.'],
    ['a fall with or without its sign', 'Your SIP is down 13.7%; the worst fall since start is -14.2%, against 18.4% in the demo history.'],
    ['a whole percent for "-14.0%"-style facts', 'The plan is 12% put in.'],
    ['instalment counts', '53 instalments are still to come; 7 instalments are paid and 0 skipped, of 60 planned.'],
    ['time to go and dates', 'The goal is 4 years 5 months away, in Mar 2031; the next instalment is on 2 Nov 2026.'],
    ['a date with the month in full', 'The next instalment is on 2 November.'],
    ['units at the latest and the peak NAV', 'One instalment buys 44.2 units now, against 41.6 units at the peak NAV.'],
    ['months invested', 'You have invested for 7 months.'],
    ['Hindi words around ASCII digits', 'आपकी 53 किस्तें बाकी हैं, और एक किस्त अभी 44.2 यूनिट खरीदती है।'],
    ['Hinglish words for instalments', 'Abhi 53 kishtein baaki hain.'],
    ['an answer with no numbers at all', 'You can keep, skip, pause or lower the amount.'],
    // Live run v9-stop-1-3 (1 Nov 2026): the instalment's amount is not a count of instalments.
    ['the instalment amount before the word "instalment"', 'You can keep, skip, pause, or lower the Rs 2,000 instalment.'],
    ['the instalment amount with the rupee sign', 'You can lower the ₹2,000 instalment.'],
  ])('passes %s', (_what, text) => {
    expect(check(text)).toEqual({ grounded: true, ungrounded: [] });
  });

  it('passes the pause explainer\'s "1 to 3 instalments" on the cash route, which gets that explainer', () => {
    expect(check('You can pause the next 1 to 3 instalments.', { pause: true })).toEqual({ grounded: true, ungrounded: [] });
  });
});

describe('The numbers check: what it stops', () => {
  it.each([
    ['an amount the facts never state', 'You have put in Rs 15,000 so far.', ['Rs 15,000']],
    ['a made-up instalment amount', 'You can lower the Rs 2,500 instalment.', ['Rs 2,500']],
    ['a made-up instalment amount with the rupee sign', 'You can lower the ₹2,500 instalment.', ['2,500']],
    ['an amount it worked out itself', 'You are Rs 1,914 down and need Rs 1,06,000 more.', ['Rs 1,06,000']],
    ['a percentage the facts never state', 'Your SIP is down 13.8%.', ['13.8%']],
    ['a duration that is not the time to go', 'Your goal is 5 years away.', ['5 years']],
    ['a fact number counted as the wrong thing', '12 instalments are still to come.', ['12 instalments']],
    ['units counted as instalments', '44.2 instalments are left.', ['44.2 instalments']],
    ['instalments counted as units', 'One instalment buys 53 units now.', ['53 units']],
    ['a count the facts never state', '99 instalments are still to come.', ['99']],
    ['a made-up date', 'The next instalment is on 5 Nov 2026.', ['5 Nov']],
    ['a real day with the wrong month', 'The next instalment is on 2 December 2026.', ['2 December']],
    ['a number written as a word', 'You have five instalments to go.', ['five']],
    ['lakh and crore', 'Your goal needs Rs 1.2 lakh.', ['Rs 1', 'lakh']],
    ['digits in Devanagari, which can\'t be checked', 'आपकी ५३ किस्तें बाकी हैं।', ['५३']],
    ['the wrong kind in Hindi words', 'आपकी 12 किस्तें बाकी हैं।', ['12 किस्तें']],
  ])('stops %s', (_what, text, ungrounded) => {
    expect(check(text)).toEqual({ grounded: false, ungrounded });
  });

  it('stops "1 to 3 instalments" when the route has no pause explainer to say so', () => {
    expect(check('You can pause the next 1 to 3 instalments.')).toEqual({ grounded: false, ungrounded: ['1', '3'] });
  });
});
