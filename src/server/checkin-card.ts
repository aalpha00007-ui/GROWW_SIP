// What an AI card shows (PRD F8-F10), shaped for the screen. Answer: the checked text and the quality
// strip, each tick from a real check. Declined and fallback: fixed text, the facts table and the links.
import type { FactLine } from '../pipeline/chunking/facts';
import type { Outcome } from '../pipeline/loading/fixtures';
import type { CheckInResult } from '../pipeline/retrieval/checkin';

export interface CheckInCard {
  outcome: Outcome;
  aiCheckId: number;
  /** "What I understood": the reason in a line; null for the dip explainer and the fallback. */
  understood: string | null;
  text: string;
  strip: { label: string; ok: boolean }[] | null;
  /** 'Confidence: High'; only when a reason was read. */
  confidence: string | null;
  facts: FactLine[] | null;
  links: { label: string; url: string }[] | null;
  /** The autopay route answers with a link to the autopay settings. */
  appLink: { label: string; href: string } | null;
  asOf: string;
}

export function checkInCard(result: Extract<CheckInResult, { status: 200 }>): CheckInCard {
  const { outcome, checks, understood } = result;
  const answered = outcome === 'answer';
  return {
    outcome,
    aiCheckId: result.aiCheckId,
    understood: outcome !== 'fallback' && understood ? understood.summary : null,
    text: result.text,
    strip:
      answered && checks
        ? [
            { label: 'No investment advice', ok: checks.no_advice },
            { label: 'Numbers match your SIP', ok: checks.grounded },
            { label: 'Disclaimer shown', ok: checks.disclaimer },
          ]
        : null,
    confidence: answered && understood ? `Confidence: ${understood.confidenceLabel}` : null,
    facts: answered ? null : result.facts.lines,
    links: answered ? null : result.links.map((l) => ({ label: l.label, url: l.url })),
    appLink: answered && result.route === 'autopay' ? { label: 'Your autopay settings', href: '/profile' } : null,
    asOf: `Numbers as of ${result.facts.as_of}`,
  };
}
