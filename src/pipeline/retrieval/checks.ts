import type { AdvicePattern } from '../loading/fixtures';
import type { SipFacts } from '../chunking/facts';
import { numberTokens } from '../chunking/format';
import { goalFactsCheck } from './goal-check';
import { writtenIn } from './language';
import { DISCLAIMER, disclaimerFor, LOCAL_DISCLAIMERS, MAX_WORDS, type Language } from './prompts';

export interface QualityChecks {
  no_advice: boolean;
  grounded: boolean;
  disclaimer: boolean;
  length: boolean;
  /** No unsupported claims: the fall is not called normal or temporary, no recovery is promised, no "don't worry". */
  no_claims: boolean;
  /** Written in the investor's language: Hindi, Hinglish, or English for everything else. */
  in_language: boolean;
  /** What it says of the goal is true: the stored date, no goal invented, a past date never upcoming. */
  goal_facts: boolean;
  /** What goal_facts found. */
  goal_problems: string[];
  words: number;
  /** Advice patterns the answer matched. */
  advice_found: string[];
  /** Numbers in the answer that are not in the facts or explainers, or not of the kind it says. */
  ungrounded: string[];
  /** Claim patterns the answer matched. */
  claims_found: string[];
  /**
   * Why the writer was asked for a second draft (checkin.ts), when it was: the first was too long once filled
   * in, stated a number itself, or compared two numbers. These checks ran on the second draft. Absent otherwise.
   */
  second_draft?: ('length' | 'numbers' | 'comparison')[];
}

/** The words the length check counts: the reply and its one disclaimer, in any language. */
export function answerWords(answer: string): number {
  return answer.trim().split(/\s+/).length;
}

const occurrences = (text: string, part: string) => text.split(part).length - 1;

/** Exactly once, in the reply's language, and not in another. The banner has it in English on every page. */
export function disclaimerOk(answer: string, language: Language): boolean {
  const others = [DISCLAIMER, ...Object.values(LOCAL_DISCLAIMERS)].filter((d) => d !== disclaimerFor(language));
  return occurrences(answer, disclaimerFor(language)) === 1 && others.every((d) => !answer.includes(d));
}

/** Which fact numbers are which: a count of instalments, a number of units, or a day and month ('2 Nov'). */
export interface NumberKinds {
  instalments: string[];
  units: string[];
  dates: string[];
}

/** A number with the word that says what it counts: "53 instalments", "30.6 units", "53 किस्तें", "53 kishtein". */
const COUNTED = /(\d[\d,]*(?:\.\d+)?)\s*(instalments?|installments?|kisht\w*|kist\w*|किस्त\S*|किश्त\S*|units?|यूनिट\S*)/gi;
/** A rupee sign or "Rs" right before a number: the number is an amount, whatever word follows it. */
const RUPEES_BEFORE = /(?:\bRs\.?|₹|\bINR)\s*$/i;
/** A day and month: "2 Nov", "2 November". */
export const DAY_MONTH = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/g;
/** Number words can't be matched to a fact, so they fail. "one" is left out: "one instalment" names no amount. */
const NUMBER_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakhs?|crores?)\b/gi;

/**
 * Step 8: seven deterministic checks on every AI answer. Any failure means the investor gets the fallback card.
 * "Grounded" covers every number the answer states:
 * - rupee amounts, percentages, and month and year counts must match a fact as written;
 * - a number that says what it counts must be a fact number of that kind: "53 instalments" a count of
 *   instalments, "30.6 units" a number of units (not just any number the facts happen to state), and a
 *   day and month ("2 Nov") a date the facts state;
 * - any other number (a date's day or year) must be a number the facts or explainers state;
 * - digits in another script and number words can't be checked, so they fail.
 */
export function runChecks(
  answer: string,
  allowedNumbers: string[],
  patterns: AdvicePattern[],
  claimPatterns: AdvicePattern[],
  language: Language = 'en',
  kinds?: NumberKinds,
  /** The SIP's facts, for what the answer says of its goal. */
  facts?: SipFacts,
): QualityChecks {
  // A sign, the comma grouping or a trailing ".0" does not change the number: "Rs 2000" is the facts'
  // "Rs 2,000", and "a fall of 6%" states the facts' "-6.0%".
  const plain = (token: string) => token.replace(/^[+-]/, '').replace(/,/g, '').replace(/\.0+(?=%|$)/, '');
  const allowed = new Set(allowedNumbers.map(plain));
  // A bare number may be a number the facts state with its unit: "14,000 rupees" is the facts' "Rs 14,000".
  const bare = (token: string) => plain(token).replace(/^Rs /, '').replace(/%$| years?$| months?$/, '');
  const allowedBare = new Set(allowedNumbers.map(bare));
  const typed = (token: string) => /Rs |%| years?$| months?$/.test(token);
  const ungrounded = numberTokens(answer).filter((t) => (typed(t) ? !allowed.has(plain(t)) : !allowedBare.has(bare(t))));
  // Counted numbers must also be of the right kind. One the facts don't state at all is already listed above.
  if (kinds) {
    const ofKind = { instalments: new Set(kinds.instalments.map(bare)), units: new Set(kinds.units.map(bare)) };
    for (const match of answer.matchAll(COUNTED)) {
      const [whole, number, word] = match;
      // "the Rs 2,000 instalment" names the instalment's amount, not a count of instalments. The amount
      // itself is checked as a rupee amount above, so it must still match the facts exactly.
      if (RUPEES_BEFORE.test(answer.slice(0, match.index))) continue;
      const kind = /^(units?|यूनिट)/i.test(word) ? ofKind.units : ofKind.instalments;
      if (allowedBare.has(bare(number)) && !kind.has(bare(number))) ungrounded.push(whole.trim());
    }
    const dates = new Set(kinds.dates);
    for (const [whole, day, month] of answer.matchAll(DAY_MONTH)) {
      if (allowedBare.has(day) && !dates.has(`${day} ${month}`)) ungrounded.push(whole);
    }
  }
  ungrounded.push(...(answer.match(/[०-९]+/g) ?? []), ...(answer.match(NUMBER_WORDS) ?? []));
  const adviceFound = patterns.filter((p) => p.regex.test(answer)).map((p) => p.pattern);
  const claimsFound = claimPatterns.filter((p) => p.regex.test(answer)).map((p) => p.pattern);
  const words = answerWords(answer);
  const goal = facts ? goalFactsCheck(answer, facts) : { ok: true, problems: [] };
  return {
    no_advice: adviceFound.length === 0,
    grounded: ungrounded.length === 0,
    disclaimer: disclaimerOk(answer, language),
    length: words <= MAX_WORDS,
    no_claims: claimsFound.length === 0,
    in_language: writtenIn(answer, language),
    goal_facts: goal.ok,
    goal_problems: goal.problems,
    words,
    advice_found: adviceFound,
    ungrounded,
    claims_found: claimsFound,
  };
}

export function allPassed(checks: QualityChecks): boolean {
  return checks.no_advice && checks.grounded && checks.disclaimer && checks.length && checks.no_claims && checks.in_language && checks.goal_facts;
}
