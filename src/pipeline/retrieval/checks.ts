import type { AdvicePattern } from '../loading/fixtures';
import { numberTokens } from '../chunking/format';
import { writtenIn } from './language';
import { DISCLAIMER, LOCAL_DISCLAIMERS, MAX_WORDS, type Language } from './prompts';

export interface QualityChecks {
  no_advice: boolean;
  grounded: boolean;
  disclaimer: boolean;
  length: boolean;
  /** No unsupported claims: the fall is not called normal or temporary, no recovery is promised, no "don't worry". */
  no_claims: boolean;
  /** Written in the investor's language: Hindi, Hinglish, or English for everything else. */
  in_language: boolean;
  words: number;
  /** Advice patterns the answer matched. */
  advice_found: string[];
  /** Numbers in the answer that are not in the facts or explainers, or not of the kind it says. */
  ungrounded: string[];
  /** Claim patterns the answer matched. */
  claims_found: string[];
}

/** Which fact numbers are which: a count of instalments, a number of units, or a day and month ('2 Nov'). */
export interface NumberKinds {
  instalments: string[];
  units: string[];
  dates: string[];
}

/** A number with the word that says what it counts: "53 instalments", "30.6 units", "53 किस्तें", "53 kishtein". */
const COUNTED = /(\d[\d,]*(?:\.\d+)?)\s*(instalments?|installments?|kisht\w*|kist\w*|किस्त\S*|किश्त\S*|units?|यूनिट\S*)/gi;
/** A day and month: "2 Nov", "2 November". */
export const DAY_MONTH = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/g;
/** Number words can't be matched to a fact, so they fail. "one" is left out: "one instalment" names no amount. */
const NUMBER_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakhs?|crores?)\b/gi;

/**
 * Step 8: six deterministic checks on every AI answer. Any failure means the investor gets the fallback card.
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
    for (const [whole, number, word] of answer.matchAll(COUNTED)) {
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
  // The limit covers the reply and the English disclaimer, as it always has. The Hindi or Hinglish disclaimer is
  // fixed text added for those languages, so it doesn't eat into the reply's words.
  const local = language === 'hi' || language === 'hinglish' ? LOCAL_DISCLAIMERS[language] : null;
  const words = (local ? answer.replace(local, ' ') : answer).trim().split(/\s+/).length;
  return {
    no_advice: adviceFound.length === 0,
    grounded: ungrounded.length === 0,
    // In Hindi or Hinglish, the disclaimer in that language too, then the English one.
    disclaimer: answer.includes(DISCLAIMER) && (local ? answer.includes(local) : true),
    length: words <= MAX_WORDS,
    no_claims: claimsFound.length === 0,
    in_language: writtenIn(answer, language),
    words,
    advice_found: adviceFound,
    ungrounded,
    claims_found: claimsFound,
  };
}

export function allPassed(checks: QualityChecks): boolean {
  return checks.no_advice && checks.grounded && checks.disclaimer && checks.length && checks.no_claims && checks.in_language;
}
