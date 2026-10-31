// What an AI card shows (PRD F8-F10), shaped for the screen. Answer: the checked text and the quality
// strip, each tick from a real check. Declined and fallback: fixed text, the facts table and the links, with
// one quality-check line in the strip's place saying why only facts are shown. Both AI features show a
// confidence label.
import type { FactLine } from '../pipeline/chunking/facts';
import type { Outcome } from '../pipeline/loading/fixtures';
import { CHECK_KEYS, CHECK_LABELS, type CheckInResult, type CheckKey } from '../pipeline/retrieval/checkin';

export interface CheckInCard {
  outcome: Outcome;
  aiCheckId: number;
  /** "What I understood": the reason in a line, in the investor's language; null for the dip explainer and the fallback. */
  understood: string | null;
  text: string;
  /** For screen readers: 'hi' for Hindi, 'hi-Latn' for Hinglish, 'en' otherwise. */
  lang: string;
  /** An answer's ticks, one per check. */
  strip: { label: string; ok: boolean }[] | null;
  /** In the strip's place when no answer is shown: "Quality check: advice question detected → showing facts only". */
  gate: string | null;
  /**
   * 'Confidence: High'. Before you stop: how sure the AI is what the reason means. The dip explainer has no
   * reason to read: how much of a goal it can connect the dip to.
   */
  confidence: string | null;
  facts: FactLine[] | null;
  links: { label: string; url: string }[] | null;
  /** The autopay route answers with a link to the autopay settings. */
  appLink: { label: string; href: string } | null;
  asOf: string;
}

/** What went wrong, per failed check, for the quality-check line. */
const CHECK_PROBLEMS: Record<CheckKey, string> = {
  no_advice: 'the answer sounded like advice',
  grounded: "a number didn't match your SIP",
  disclaimer: 'the disclaimer was missing',
  length: 'the answer was too long',
  no_claims: 'the answer made an unsupported claim',
  in_language: "the answer wasn't in your language",
};

type Shown = Extract<CheckInResult, { status: 200 }>;

/** Why only facts are shown, in plain words; null for an answer. */
export function gateLine(result: Pick<Shown, 'outcome' | 'declineKind' | 'fallbackReason'>): string | null {
  if (result.outcome === 'answer') return null;
  let what: string;
  if (result.outcome === 'declined') what = result.declineKind === 'prediction' ? 'market prediction question detected' : 'advice question detected';
  else {
    const reason = result.fallbackReason ?? { kind: 'error' as const };
    if (reason.kind === 'checks') what = reason.failed.map((k) => CHECK_PROBLEMS[k]).join('; ');
    else if (reason.kind === 'unsure') what = 'not sure what you meant';
    else if (reason.kind === 'facts') what = "your SIP's numbers didn't add up";
    // A timeout, an error, or no MISTRAL_API_KEY on the server.
    else what = 'AI unavailable';
  }
  return `Quality check: ${what} → showing facts only`;
}

function confidence(result: Shown): string | null {
  if (result.understood) return `Confidence: ${result.understood.confidenceLabel}`;
  if (result.moment !== 'is_this_normal' || result.outcome !== 'answer') return null;
  if (result.goalDetail === 'plan') return 'Confidence: High';
  return result.goalDetail === 'no_target_month' ? 'Confidence: Medium · no goal date' : 'Confidence: Low · no goal set';
}

export function checkInCard(result: Shown): CheckInCard {
  const { outcome, checks, understood } = result;
  const answered = outcome === 'answer';
  return {
    outcome,
    aiCheckId: result.aiCheckId,
    understood: outcome !== 'fallback' && understood ? understood.summary : null,
    text: result.text,
    lang: result.language === 'hi' ? 'hi' : result.language === 'hinglish' ? 'hi-Latn' : 'en',
    // Every answer shown passed "Short enough" too, so the strip leaves it out.
    strip: answered && checks ? CHECK_KEYS.filter((k) => k !== 'length').map((k) => ({ label: CHECK_LABELS[k], ok: checks[k] })) : null,
    gate: gateLine(result),
    confidence: confidence(result),
    facts: answered ? null : result.facts.lines,
    links: answered ? null : result.links.map((l) => ({ label: l.label, url: l.url })),
    appLink: answered && result.route === 'autopay' ? { label: 'Your autopay settings', href: '/settings' } : null,
    asOf: `Numbers as of ${result.facts.as_of}`,
  };
}
