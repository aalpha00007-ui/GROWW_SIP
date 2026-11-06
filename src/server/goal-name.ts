// A goal's name goes into every AI answer for its SIP, so a name the answer checks refuse would send that SIP to the
// facts-only card every time, at the moment the check-in matters most. These are the same checks, run on the name when
// it is saved: a date, an amount in words, or a promise of returns. The date and the target have their own fields.
import type { SipFacts } from '../pipeline/chunking/facts';
import { numberTokens } from '../pipeline/chunking/format';
import { loadAdvicePatterns, loadClaimPatterns, type AdvicePattern } from '../pipeline/loading/fixtures';
import { runChecks } from '../pipeline/retrieval/checks';

let patterns: { advice: AdvicePattern[]; claims: AdvicePattern[] } | null = null;

export function goalNameFits(name: string): boolean {
  patterns ??= { advice: loadAdvicePatterns(), claims: loadClaimPatterns() };
  // Digits are fine: the facts hold the name, so "2 BHK" in an answer matches them. With no goal date, any date is refused.
  const facts = { goal: { name, target_month: null }, fund_biggest_fall: null, next_due_date: null } as unknown as SipFacts;
  const checks = runChecks(name, numberTokens(name), patterns.advice, patterns.claims, 'en', undefined, facts);
  return checks.no_advice && checks.grounded && checks.no_claims && checks.goal_facts;
}
