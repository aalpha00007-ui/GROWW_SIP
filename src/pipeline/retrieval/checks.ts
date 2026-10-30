import type { AdvicePattern } from '../loading/fixtures';
import { numberTokens } from '../chunking/format';
import { DISCLAIMER, MAX_WORDS } from './prompts';

export interface QualityChecks {
  no_advice: boolean;
  grounded: boolean;
  disclaimer: boolean;
  length: boolean;
  words: number;
  /** Advice patterns the answer matched. */
  advice_found: string[];
  /** Numbers in the answer that are not in the facts or explainers. */
  ungrounded: string[];
}

/**
 * Step 8: four deterministic checks on every AI answer. Any failure means the investor gets the
 * fallback card. "Grounded" covers what the build spec names: rupee amounts, percentages, month
 * and year counts, and calendar years.
 */
export function runChecks(answer: string, allowedNumbers: string[], patterns: AdvicePattern[]): QualityChecks {
  // A sign, the comma grouping or a trailing ".0" does not change the number: "Rs 2000" is the facts'
  // "Rs 2,000", and "a fall of 6%" states the facts' "-6.0%".
  const plain = (token: string) => token.replace(/^[+-]/, '').replace(/,/g, '').replace(/\.0+(?=%|$)/, '');
  const allowed = new Set(allowedNumbers.map(plain));
  const checkable = (token: string) => /Rs |%| years?$| months?$/.test(token) || /^(19|20)\d{2}$/.test(token);
  const ungrounded = numberTokens(answer).filter((t) => checkable(t) && !allowed.has(plain(t)));
  const adviceFound = patterns.filter((p) => p.regex.test(answer)).map((p) => p.pattern);
  const words = answer.trim().split(/\s+/).length;
  return {
    no_advice: adviceFound.length === 0,
    grounded: ungrounded.length === 0,
    disclaimer: answer.includes(DISCLAIMER),
    length: words <= MAX_WORDS,
    words,
    advice_found: adviceFound,
    ungrounded,
  };
}

export function allPassed(checks: QualityChecks): boolean {
  return checks.no_advice && checks.grounded && checks.disclaimer && checks.length;
}
