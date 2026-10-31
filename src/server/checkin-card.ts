// What an AI card shows (PRD F8-F10), shaped for the screen. Answer: the checked text and the quality
// strip, each tick from a real check. Declined and fallback: fixed text, the facts table and the links.
import type { FactLine } from '../pipeline/chunking/facts';
import type { Outcome } from '../pipeline/loading/fixtures';
import { CHECK_LABELS, type CheckInResult, type FallbackReason } from '../pipeline/retrieval/checkin';

export interface CheckInCard {
  outcome: Outcome;
  aiCheckId: number;
  /** "What I understood": the reason in a line; null for the dip explainer and the fallback. */
  understood: string | null;
  text: string;
  /** On the fallback card: which step stopped the answer, in plain words. */
  why: string | null;
  strip: { label: string; ok: boolean }[] | null;
  /** 'Confidence: High'; only when a reason was read. */
  confidence: string | null;
  facts: FactLine[] | null;
  links: { label: string; url: string }[] | null;
  /** The autopay route answers with a link to the autopay settings. */
  appLink: { label: string; href: string } | null;
  asOf: string;
}

/** Why the AI's answer isn't shown, in plain words. */
export function fallbackWhy(reason: FallbackReason): string {
  switch (reason.kind) {
    case 'checks':
      return `The answer didn't pass a check: ${reason.failed.join(', ')}.`;
    case 'unsure':
      return "The AI wasn't sure enough what you meant.";
    case 'timeout':
      return 'The AI took too long to answer.';
    case 'facts':
      return "This SIP's numbers didn't add up, so the AI wasn't asked.";
    default:
      return 'The AI service returned an error.';
  }
}

export function checkInCard(result: Extract<CheckInResult, { status: 200 }>): CheckInCard {
  const { outcome, checks, understood } = result;
  const answered = outcome === 'answer';
  return {
    outcome,
    aiCheckId: result.aiCheckId,
    understood: outcome !== 'fallback' && understood ? understood.summary : null,
    text: result.text,
    why: result.fallbackReason ? fallbackWhy(result.fallbackReason) : null,
    strip:
      answered && checks
        ? [
            { label: CHECK_LABELS.no_advice, ok: checks.no_advice },
            { label: CHECK_LABELS.grounded, ok: checks.grounded },
            { label: CHECK_LABELS.disclaimer, ok: checks.disclaimer },
            { label: CHECK_LABELS.no_claims, ok: checks.no_claims },
          ]
        : null,
    confidence: answered && understood ? `Confidence: ${understood.confidenceLabel}` : null,
    facts: answered ? null : result.facts.lines,
    links: answered ? null : result.links.map((l) => ({ label: l.label, url: l.url })),
    appLink: answered && result.route === 'autopay' ? { label: 'Your autopay settings', href: '/settings' } : null,
    asOf: `Numbers as of ${result.facts.as_of}`,
  };
}
