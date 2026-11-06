// What an AI card shows (PRD F8-F10), shaped for the screen. Answer: the checked text, with "How this answer was
// checked" folded under it, each line from a real check. Declined and fallback: fixed text, the facts table and the
// links, with one quality-check line saying why only facts are shown. No confidence label: it read like a guarantee.
import type { FactLine } from '../pipeline/chunking/facts';
import { pricesAsOf } from '../pipeline/chunking/format';
import type { ExpectationQuestion } from '../pipeline/retrieval/expectations';
import type { Outcome } from '../pipeline/loading/fixtures';
import { CHECK_KEYS, type CheckInResult, type CheckKey } from '../pipeline/retrieval/checkin';
import type { Language } from '../pipeline/retrieval/prompts';

export interface CheckInCard {
  outcome: Outcome | 'asked';
  aiCheckId: number;
  /** "What I understood": the reason in a line, in the investor's language; null for the dip explainer and the fallback. */
  understood: string | null;
  text: string;
  /** For screen readers: 'hi' for Hindi, 'hi-Latn' for Hinglish, 'en' otherwise. */
  lang: string;
  /**
   * "How this answer was checked", collapsed under an answer: what was checked and that it can miss things. It says
   * what was done, never that the answer is right: a row of ticks or a "Confidence: High" reads like a guarantee.
   */
  checked: { summary: string; items: { label: string; ok: boolean }[]; note: string } | null;
  /** When no answer is shown: "Quality check: advice question detected → showing facts only". */
  gate: string | null;
  /** The chips to answer first, for unmet expectations. */
  question: ExpectationQuestion | null;
  facts: FactLine[] | null;
  links: { label: string; url: string }[] | null;
  /** The autopay route answers with a link to the Autopay section of Settings. */
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
    summary: string;
    note: string;
  }
> = {
  en: {
    line: (what) => `Quality check: ${what} → showing facts only`,
    checks: {
      no_advice: 'Checked for advice words',
      grounded: 'Numbers compared with your SIP',
      disclaimer: 'Disclaimer included',
      length: 'Length checked',
      no_claims: 'Checked for unsupported claims',
      in_language: 'Language checked',
      goal_facts: 'Goal details compared with your SIP',
    },
    problems: {
      no_advice: 'the answer sounded like advice',
      grounded: "a number didn't match your SIP",
      disclaimer: 'the disclaimer was missing',
      length: 'the answer was too long',
      no_claims: 'the answer made an unsupported claim',
      in_language: "the answer wasn't in your language",
      goal_facts: "a goal detail didn't match your SIP",
    },
    advice: 'advice question detected',
    prediction: 'market prediction question detected',
    unsure: 'not sure what you meant',
    facts: "your SIP's numbers didn't add up",
    unavailable: 'AI unavailable',
    summary: 'How this answer was checked',
    note: 'These are automatic checks by code. They catch common mistakes and can still miss some.',
  },
  hinglish: {
    line: (what) => `Quality check: ${what} → sirf facts dikha rahe hain`,
    checks: {
      no_advice: 'Advice wale shabd check kiye',
      grounded: 'Numbers aapke SIP se milaye',
      disclaimer: 'Disclaimer shamil hai',
      length: 'Lambai check ki',
      no_claims: 'Bina saboot ke daave check kiye',
      in_language: 'Bhasha check ki',
      goal_facts: 'Goal ki details aapke SIP se milayi',
    },
    problems: {
      no_advice: 'jawab advice jaisa laga',
      grounded: 'ek number aapke SIP se match nahi hua',
      disclaimer: 'disclaimer nahi tha',
      length: 'jawab bahut lamba tha',
      no_claims: 'jawab mein bina saboot ka daava tha',
      in_language: 'jawab aapki bhasha mein nahi tha',
      goal_facts: 'goal ki ek baat aapke SIP se match nahi hui',
    },
    advice: 'advice ka sawaal mila',
    prediction: 'market ke andaaze ka sawaal mila',
    unsure: 'samajh nahi aaya aap kya kehna chahte hain',
    facts: 'aapke SIP ke numbers aapas mein mel nahi kha rahe the',
    unavailable: 'AI abhi uplabdh nahi hai',
    summary: 'Yeh jawab kaise check hua',
    note: 'Yeh code ke automatic checks hain. Yeh aam galtiyan pakadte hain, phir bhi kuch chhoot sakti hain.',
  },
  hi: {
    line: (what) => `गुणवत्ता जाँच: ${what} → सिर्फ़ तथ्य दिखा रहे हैं`,
    checks: {
      no_advice: 'सलाह वाले शब्द जाँचे',
      grounded: 'आंकड़े आपके SIP से मिलाए',
      disclaimer: 'डिस्क्लेमर शामिल है',
      length: 'लंबाई जाँची',
      no_claims: 'बेबुनियाद दावे जाँचे',
      in_language: 'भाषा जाँची',
      goal_facts: 'लक्ष्य की जानकारी आपके SIP से मिलाई',
    },
    problems: {
      no_advice: 'जवाब सलाह जैसा लगा',
      grounded: 'एक आंकड़ा आपके SIP से मेल नहीं खाया',
      disclaimer: 'डिस्क्लेमर नहीं था',
      length: 'जवाब बहुत लंबा था',
      no_claims: 'जवाब में बेबुनियाद दावा था',
      in_language: 'जवाब आपकी भाषा में नहीं था',
      goal_facts: 'लक्ष्य की एक बात आपके SIP से मेल नहीं खाई',
    },
    advice: 'सलाह का सवाल मिला',
    prediction: 'बाज़ार के अनुमान का सवाल मिला',
    unsure: 'समझ नहीं आया आप क्या कहना चाहते हैं',
    facts: 'आपके SIP के आंकड़े आपस में मेल नहीं खा रहे थे',
    unavailable: 'AI अभी उपलब्ध नहीं है',
    summary: 'यह जवाब कैसे जाँचा गया',
    note: 'ये कोड की अपने आप चलने वाली जाँचें हैं। ये आम गलतियाँ पकड़ती हैं, फिर भी कुछ छूट सकती हैं।',
  },
};

type Shown = Extract<CheckInResult, { status: 200 }>;

/** Why only facts are shown, in plain words in the reply's language; null for an answer. */
export function gateLine(result: Pick<Shown, 'outcome' | 'declineKind' | 'fallbackReason' | 'language'>): string | null {
  if (result.outcome === 'answer' || result.outcome === 'asked') return null;
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

export function checkInCard(result: Shown): CheckInCard {
  const { outcome, checks, understood } = result;
  const answered = outcome === 'answer';
  const strip = STRIP[stripLanguage(result.language)];
  return {
    outcome,
    aiCheckId: result.aiCheckId,
    understood: outcome !== 'fallback' && understood ? understood.summary : null,
    text: result.text,
    lang: result.language === 'hi' ? 'hi' : result.language === 'hinglish' ? 'hi-Latn' : 'en',
    checked:
      answered && checks
        ? {
            summary: strip.summary,
            items: CHECK_KEYS.map((k) => ({ label: strip.checks[k], ok: checks[k] })),
            note: strip.note,
          }
        : null,
    gate: gateLine(result),
    question: result.question,
    facts: answered || outcome === 'asked' ? null : result.facts.lines,
    links: answered || outcome === 'asked' ? null : result.links.map((l) => ({ label: l.label, url: l.url })),
    appLink: answered && result.route === 'autopay' ? { label: 'Your autopay in Settings', href: '/settings#autopay' } : null,
    asOf: pricesAsOf(result.facts.as_of),
  };
}
