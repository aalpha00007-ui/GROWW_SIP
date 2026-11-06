import type { Route } from '../loading/fixtures';
import type { Understanding } from './ai';

export const MIN_CONFIDENCE = 0.6;

/** Why a reason is declined: it asks for advice, or for a market prediction (the card first says it can't predict). */
export type DeclineKind = 'advice' | 'prediction';

/** The goal is behind them: they said so, or its date has passed. */
export type GoalDone = 'said' | 'date_passed';

export type Decision = { outcome: 'declined'; kind: DeclineKind } | { outcome: 'fallback' } | { outcome: 'answer'; route: Route; goalDone?: GoalDone };

/**
 * The investor's own words saying the goal is reached, in English, Hinglish or Hindi. Alongside call 1's flag: reading
 * "I have saved enough for the home down payment" as a shortage of money is exactly the mistake this is here for
 * (case s14, runs #16 to #27), so that reading doesn't get the last word.
 */
const GOAL_REACHED = [
  /\bsaved (?:up )?enough\b/i,
  /\bhave enough (?:money )?(?:saved|now|for (?:my|the|our) )/i,
  /\b(?:reached|achieved|met|hit|completed|finished)\s+(?:my|the|our|this)\s+(?:\w+\s+){0,3}(?:goal|target)\b/i,
  /\b(?:goal|target)\s+(?:is |has been |was |got )?(?:now )?(?:reached|achieved|met|complete|completed|done|fulfilled)\b/i,
  /\b(?:goal|target|lakshya)\s+(?:poora|pura|complete|achieve|hasil)\s+ho\s+(?:gaya|gya)\b/i,
  /\b(?:paise|paisa|rakam)\s+(?:poore|pure|jama|jud)\s+ho\s+(?:gaye|gaya|gya)\b/i,
  /लक्ष्य\s+(?:पूरा|हासिल)\s+(?:हो\s+गया|कर\s+लिया)/,
  /(?:पैसे|रकम)\s+(?:पूरे|जमा|जुड़)\s+(?:हो\s+गए|हो\s+गई)/,
];
const NEGATED = /(?:\bnot\b|\bnever\b|n['’]t\b|\bno\b)[^.!?]{0,24}$/i;

export function saysGoalReached(text: string): boolean {
  return GOAL_REACHED.some((pattern) => {
    const found = pattern.exec(text);
    return found !== null && !NEGATED.test(text.slice(0, found.index));
  });
}

/**
 * Step 5: code, not the AI, picks what happens next (architecture Phase 5). A goal that is reached or past gets the
 * neutral route, which treats stopping as a legitimate choice, whatever theme the reason read as: it is not a cash
 * shortage or a market worry. A misread of what stopping does, or a payment problem, is still answered first.
 */
export function decideRoute(u: Understanding, goal: { datePassed: boolean; saidInWords: boolean } = { datePassed: false, saidInWords: false }): Decision {
  if (u.asks_for_prediction) return { outcome: 'declined', kind: 'prediction' };
  if (u.asks_for_advice) return { outcome: 'declined', kind: 'advice' };
  if (u.confidence < MIN_CONFIDENCE) return { outcome: 'fallback' };
  if (u.misreads_cancel || u.primary_theme === 'Confusion') return { outcome: 'answer', route: 'explain' };
  if (u.primary_theme === 'Payment & mandate issues') return { outcome: 'answer', route: 'autopay' };
  if (u.goal_completed || goal.saidInWords) return { outcome: 'answer', route: 'neutral', goalDone: 'said' };
  if (goal.datePassed) return { outcome: 'answer', route: 'neutral', goalDone: 'date_passed' };
  if (u.primary_theme === 'Returns' || u.primary_theme === 'Market fear' || u.primary_theme === 'Expectation mismatch') {
    return { outcome: 'answer', route: 'doubt' };
  }
  if (u.primary_theme === 'Need money') return { outcome: 'answer', route: 'cash' };
  return { outcome: 'answer', route: 'neutral' };
}
