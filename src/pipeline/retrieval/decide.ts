import type { Route } from '../loading/fixtures';
import type { Understanding } from './ai';

export const MIN_CONFIDENCE = 0.6;

/** Why a reason is declined: it asks for advice, or for a market prediction (the card first says it can't predict). */
export type DeclineKind = 'advice' | 'prediction';

export type Decision = { outcome: 'declined'; kind: DeclineKind } | { outcome: 'fallback' } | { outcome: 'answer'; route: Route };

/** Step 5: code, not the AI, picks what happens next (architecture Phase 5). */
export function decideRoute(u: Understanding): Decision {
  if (u.asks_for_prediction) return { outcome: 'declined', kind: 'prediction' };
  if (u.asks_for_advice) return { outcome: 'declined', kind: 'advice' };
  if (u.confidence < MIN_CONFIDENCE) return { outcome: 'fallback' };
  if (u.misreads_cancel || u.primary_theme === 'Confusion') return { outcome: 'answer', route: 'explain' };
  if (u.primary_theme === 'Returns' || u.primary_theme === 'Market fear' || u.primary_theme === 'Expectation mismatch') {
    return { outcome: 'answer', route: 'doubt' };
  }
  if (u.primary_theme === 'Need money') return { outcome: 'answer', route: 'cash' };
  if (u.primary_theme === 'Payment & mandate issues') return { outcome: 'answer', route: 'autopay' };
  return { outcome: 'answer', route: 'neutral' };
}
