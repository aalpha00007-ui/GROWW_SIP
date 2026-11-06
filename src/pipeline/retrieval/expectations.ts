// "Returns below expectations": the app asks what the investor expected and by when before it answers, because the
// useful reply depends on it. Chips only, so nothing typed here reaches the model, and no chip names a number: the
// app never states an expected or typical return. No server code here: the browser shows these chips too.
import type { Language } from './prompts';

export const EXPECTED_KEYS = ['monthly_growth', 'set_rate', 'not_sure'] as const;
export const BY_WHEN_KEYS = ['within_a_year', 'goal_date', 'not_sure'] as const;

export interface Expectation {
  expected: (typeof EXPECTED_KEYS)[number];
  byWhen: (typeof BY_WHEN_KEYS)[number];
}

export function isExpectation(value: unknown): value is Expectation {
  const v = value as Partial<Expectation> | null;
  return Boolean(v) && (EXPECTED_KEYS as readonly unknown[]).includes(v?.expected) && (BY_WHEN_KEYS as readonly unknown[]).includes(v?.byWhen);
}

export interface ExpectationQuestion {
  title: string;
  expectedLabel: string;
  byWhenLabel: string;
  action: string;
  expected: { key: Expectation['expected']; label: string }[];
  byWhen: { key: Expectation['byWhen']; label: string }[];
}

const QUESTIONS: Record<'en' | 'hinglish' | 'hi', ExpectationQuestion> = {
  en: {
    title: 'What did you expect, and by when?',
    expectedLabel: 'What did you expect?',
    byWhenLabel: 'By when?',
    action: 'Show my SIP’s facts',
    expected: [
      { key: 'monthly_growth', label: 'Growth every month' },
      { key: 'set_rate', label: 'A set % a year' },
      { key: 'not_sure', label: 'Not sure' },
    ],
    byWhen: [
      { key: 'within_a_year', label: 'Within a year' },
      { key: 'goal_date', label: 'By my goal date' },
      { key: 'not_sure', label: 'Not sure' },
    ],
  },
  hinglish: {
    title: 'Aapne kya socha tha, aur kab tak?',
    expectedLabel: 'Aapne kya socha tha?',
    byWhenLabel: 'Kab tak?',
    action: 'Mere SIP ke facts dikhao',
    expected: [
      { key: 'monthly_growth', label: 'Har mahine badhat' },
      { key: 'set_rate', label: 'Saal ka fix %' },
      { key: 'not_sure', label: 'Pakka nahi pata' },
    ],
    byWhen: [
      { key: 'within_a_year', label: 'Ek saal ke andar' },
      { key: 'goal_date', label: 'Goal ki date tak' },
      { key: 'not_sure', label: 'Pakka nahi pata' },
    ],
  },
  hi: {
    title: 'आपने क्या सोचा था, और कब तक?',
    expectedLabel: 'आपने क्या सोचा था?',
    byWhenLabel: 'कब तक?',
    action: 'मेरे SIP के तथ्य दिखाएँ',
    expected: [
      { key: 'monthly_growth', label: 'हर महीने बढ़त' },
      { key: 'set_rate', label: 'साल का तय %' },
      { key: 'not_sure', label: 'पक्का नहीं पता' },
    ],
    byWhen: [
      { key: 'within_a_year', label: 'एक साल के अंदर' },
      { key: 'goal_date', label: 'लक्ष्य की तारीख तक' },
      { key: 'not_sure', label: 'पक्का नहीं पता' },
    ],
  },
};

export const expectationQuestion = (language: Language): ExpectationQuestion => QUESTIONS[language === 'hi' || language === 'hinglish' ? language : 'en'];

/** For the writer, in words with no numbers. */
export function expectationLine({ expected, byWhen }: Expectation): string {
  const what = { monthly_growth: 'growth every month', set_rate: 'a set percentage a year', not_sure: 'something they are not sure of' }[expected];
  const when = { within_a_year: 'within a year', goal_date: 'by their goal date', not_sure: 'with no set time' }[byWhen];
  return `They say returns are below what they expected: they expected ${what}, ${when}.`;
}
