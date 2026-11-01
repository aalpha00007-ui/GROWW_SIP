// What an AI card shows (PRD F8-F10), shaped for the screen. Answer: the checked text and the quality
// strip, each tick from a real check. Declined and fallback: fixed text, the facts table and the links, with
// one quality-check line in the strip's place saying why only facts are shown. Both AI features show a
// confidence label.
import type { FactLine } from '../pipeline/chunking/facts';
import type { Outcome } from '../pipeline/loading/fixtures';
import { CHECK_KEYS, CHECK_LABELS, type CheckInResult, type CheckKey } from '../pipeline/retrieval/checkin';
import type { Language } from '../pipeline/retrieval/prompts';

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

/** The strip's own language: the reply's, so Hindi and Hinglish cards are checked in Hindi and Hinglish. */
type StripLanguage = 'en' | 'hinglish' | 'hi';
const stripLanguage = (language: Language): StripLanguage => (language === 'hi' || language === 'hinglish' ? language : 'en');

/**
 * Every word on the quality strip, as fixed translations (never written by the AI). English is the original;
 * Hinglish is Hindi in Latin letters; Hindi is in Devanagari.
 */
const STRIP: Record<
  StripLanguage,
  {
    line: (what: string) => string;
    checks: Record<CheckKey, string>;
    problems: Record<CheckKey, string>;
    advice: string;
    prediction: string;
    unsure: string;
    facts: string;
    unavailable: string;
    confidence: Record<'High' | 'Medium' | 'Low', string>;
    noGoalDate: string;
    noGoal: string;
  }
> = {
  en: {
    line: (what) => `Quality check: ${what} → showing facts only`,
    checks: CHECK_LABELS,
    problems: {
      no_advice: 'the answer sounded like advice',
      grounded: "a number didn't match your SIP",
      disclaimer: 'the disclaimer was missing',
      length: 'the answer was too long',
      no_claims: 'the answer made an unsupported claim',
      in_language: "the answer wasn't in your language",
    },
    advice: 'advice question detected',
    prediction: 'market prediction question detected',
    unsure: 'not sure what you meant',
    facts: "your SIP's numbers didn't add up",
    unavailable: 'AI unavailable',
    confidence: { High: 'Confidence: High', Medium: 'Confidence: Medium', Low: 'Confidence: Low' },
    noGoalDate: 'no goal date',
    noGoal: 'no goal set',
  },
  hinglish: {
    line: (what) => `Quality check: ${what} → sirf facts dikha rahe hain`,
    checks: {
      no_advice: 'Investment advice nahi',
      grounded: 'Numbers aapke SIP se match',
      disclaimer: 'Disclaimer dikhaya',
      length: 'Chhota jawab',
      no_claims: 'Koi bina saboot ka daava nahi',
      in_language: 'Aapki bhasha mein',
    },
    problems: {
      no_advice: 'jawab advice jaisa laga',
      grounded: 'ek number aapke SIP se match nahi hua',
      disclaimer: 'disclaimer nahi tha',
      length: 'jawab bahut lamba tha',
      no_claims: 'jawab mein bina saboot ka daava tha',
      in_language: 'jawab aapki bhasha mein nahi tha',
    },
    advice: 'advice ka sawaal mila',
    prediction: 'market ke andaaze ka sawaal mila',
    unsure: 'samajh nahi aaya aap kya kehna chahte hain',
    facts: 'aapke SIP ke numbers aapas mein mel nahi kha rahe the',
    unavailable: 'AI abhi uplabdh nahi hai',
    confidence: { High: 'Bharosa: zyada', Medium: 'Bharosa: theek', Low: 'Bharosa: kam' },
    noGoalDate: 'goal ki date nahi',
    noGoal: 'koi goal nahi',
  },
  hi: {
    line: (what) => `गुणवत्ता जाँच: ${what} → सिर्फ़ तथ्य दिखा रहे हैं`,
    checks: {
      no_advice: 'निवेश सलाह नहीं',
      grounded: 'आंकड़े आपके SIP से मेल खाते हैं',
      disclaimer: 'डिस्क्लेमर दिखाया',
      length: 'छोटा जवाब',
      no_claims: 'कोई बेबुनियाद दावा नहीं',
      in_language: 'आपकी भाषा में',
    },
    problems: {
      no_advice: 'जवाब सलाह जैसा लगा',
      grounded: 'एक आंकड़ा आपके SIP से मेल नहीं खाया',
      disclaimer: 'डिस्क्लेमर नहीं था',
      length: 'जवाब बहुत लंबा था',
      no_claims: 'जवाब में बेबुनियाद दावा था',
      in_language: 'जवाब आपकी भाषा में नहीं था',
    },
    advice: 'सलाह का सवाल मिला',
    prediction: 'बाज़ार के अनुमान का सवाल मिला',
    unsure: 'समझ नहीं आया आप क्या कहना चाहते हैं',
    facts: 'आपके SIP के आंकड़े आपस में मेल नहीं खा रहे थे',
    unavailable: 'AI अभी उपलब्ध नहीं है',
    confidence: { High: 'भरोसा: ज़्यादा', Medium: 'भरोसा: ठीक', Low: 'भरोसा: कम' },
    noGoalDate: 'लक्ष्य की तारीख नहीं',
    noGoal: 'कोई लक्ष्य नहीं',
  },
};

type Shown = Extract<CheckInResult, { status: 200 }>;

/** Why only facts are shown, in plain words in the reply's language; null for an answer. */
export function gateLine(result: Pick<Shown, 'outcome' | 'declineKind' | 'fallbackReason' | 'language'>): string | null {
  if (result.outcome === 'answer') return null;
  const s = STRIP[stripLanguage(result.language)];
  let what: string;
  if (result.outcome === 'declined') what = result.declineKind === 'prediction' ? s.prediction : s.advice;
  else {
    const reason = result.fallbackReason ?? { kind: 'error' as const };
    if (reason.kind === 'checks') what = reason.failed.map((k) => s.problems[k]).join('; ');
    else if (reason.kind === 'unsure') what = s.unsure;
    else if (reason.kind === 'facts') what = s.facts;
    // A timeout, an error, or no MISTRAL_API_KEY on the server.
    else what = s.unavailable;
  }
  return s.line(what);
}

function confidence(result: Shown): string | null {
  const s = STRIP[stripLanguage(result.language)];
  if (result.understood) return s.confidence[result.understood.confidenceLabel];
  if (result.moment !== 'is_this_normal' || result.outcome !== 'answer') return null;
  if (result.goalDetail === 'plan') return s.confidence.High;
  return result.goalDetail === 'no_target_month' ? `${s.confidence.Medium} · ${s.noGoalDate}` : `${s.confidence.Low} · ${s.noGoal}`;
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
    strip: answered && checks
      ? CHECK_KEYS.filter((k) => k !== 'length').map((k) => ({ label: STRIP[stripLanguage(result.language)].checks[k], ok: checks[k] }))
      : null,
    gate: gateLine(result),
    confidence: confidence(result),
    facts: answered ? null : result.facts.lines,
    links: answered ? null : result.links.map((l) => ({ label: l.label, url: l.url })),
    appLink: answered && result.route === 'autopay' ? { label: 'Your autopay settings', href: '/settings' } : null,
    asOf: `Numbers as of ${result.facts.as_of}`,
  };
}
