// Must-pass invariants on what an answer says about the investor's goal. Each is plain code on the answer as the
// investor would see it, in English, Hindi and Hinglish; a break sends them to the facts-only card.
//   (a) any goal date in the reply is the stored goal date;
//   (b) with no goal stored, the reply never invents one;
//   (c) with the goal's date past, the reply never calls it upcoming.
// Placeholders keep digits out of the writer's hands, but not meaning: run #27 said "buying the house this Dec 2030",
// the right date doing the wrong job, and a month can be written with no digits at all ("this December").
import type { SipFacts } from '../chunking/facts';
import { monthsBetween } from '../chunking/format';
import { HI_MONTHS } from './slots';

const EN_MONTHS = ['jan(?:uary)?', 'feb(?:ruary)?', 'mar(?:ch)?', 'apr(?:il)?', 'may', 'june?', 'july?', 'aug(?:ust)?', 'sep(?:t(?:ember)?)?', 'oct(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?'];
const EN_DATE = new RegExp(`\\b(?:(\\d{1,2})\\s+)?(${EN_MONTHS.join('|')})\\b\\.?(?:,?\\s+(\\d{4}))?`, 'gi');
const HI_DATE = new RegExp(`(?:(\\d{1,2})\\s+)?(${HI_MONTHS.join('|')})(?:\\s+(\\d{4}))?`, 'g');

const SENTENCES = /(?<=[.!?।])\s+|\n+/;
const GOAL_WORDS = /\b(?:goals?|targets?|lakshya)\b|लक्ष्य/i;
const FALL_WORDS = /\b(?:falls?|fell|drops?|dips?|giravat|girawat|history)\b|गिरावट|इतिहास/i;
const INSTALMENT_WORDS = /\b(?:instalments?|installments?|kisht\w*|due)\b|किस्त/i;
/** Words that say something isn't there: "No goal is set", "koi goal nahi", "कोई लक्ष्य नहीं". */
const NEGATION = /\b(?:no|not|none|without|nahi|nahin|nhi|koi)\b|n['’]t\b|नहीं|कोई|बिना/i;
/** "This Dec 2030": a date as if it were now. */
const THIS_BEFORE = /\b(?:this|isi)\s+$|इस(?:ी)?\s+$/i;
/** Words that put the goal in the future, in any language. */
const AHEAD = /\b(?:upcoming|coming up|ahead|to go|left|remaining|away|soon|will reach|approaching|on the way|still have|still has|yet to|baaki|baki|bacha|bachi|bache|aane wala|aane wali)\b|आने वाल|बाकी|बचा|बची|बचे/i;
/** Phrases that use those words to say the opposite, or about an instalment rather than the goal. */
const NOT_AHEAD = /\bno time left\b|\b(?:upcoming|next|coming)\s+(?:instalment|installment|kisht)\w*/gi;

export interface GoalCheck {
  ok: boolean;
  problems: string[];
}

interface Mention {
  text: string;
  month: number;
  year: number | null;
  day: number | null;
  sentence: string;
  /** The sentence up to the mention. */
  before: string;
}

function mentions(answer: string): Mention[] {
  return answer.split(SENTENCES).flatMap((sentence) => {
    const en = [...sentence.matchAll(EN_DATE)].flatMap((m) => {
      const name = m[2].toLowerCase();
      // "may" is usually the verb: a month only with a day or a year beside it.
      if (name === 'may' && !m[1] && !m[3]) return [];
      return [mention(m, EN_MONTHS.findIndex((p) => new RegExp(`^(?:${p})$`).test(name)) + 1, sentence)];
    });
    const hi = [...sentence.matchAll(HI_DATE)].map((m) => mention(m, HI_MONTHS.indexOf(m[2]) + 1, sentence));
    return [...en, ...hi];
  });
}

function mention(m: RegExpMatchArray, month: number, sentence: string): Mention {
  return {
    text: m[0].trim(),
    month,
    year: m[3] ? Number(m[3]) : null,
    day: m[1] ? Number(m[1]) : null,
    sentence,
    before: sentence.slice(0, m.index),
  };
}

const parts = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
};

export function goalFactsCheck(answer: string, facts: SipFacts): GoalCheck {
  const problems: string[] = [];
  const goal = facts.goal;
  const name = goal?.name.toLowerCase() ?? null;
  const aboutGoal = (sentence: string) => GOAL_WORDS.test(sentence) || (name !== null && sentence.toLowerCase().includes(name));
  const goalDate = goal?.target_month ? parts(goal.target_month) : null;
  const fall = facts.fund_biggest_fall ? parts(facts.fund_biggest_fall.date) : null;
  const next = facts.next_due_date ? parts(facts.next_due_date) : null;

  // (a) Every date is the goal's, or another date the facts hold, used for what it is.
  for (const m of mentions(answer)) {
    const sameMonth = (d: { year: number; month: number } | null) => d !== null && d.month === m.month && (m.year === null || m.year === d.year);
    if (sameMonth(goalDate)) {
      if (THIS_BEFORE.test(m.before) && monthsBetween(facts.today, goal!.target_month!) !== 0) problems.push(`calls the goal date this month: ${m.text}`);
      continue;
    }
    const inGoalSentence = aboutGoal(m.sentence);
    if (sameMonth(fall) && m.year !== null && (!inGoalSentence || FALL_WORDS.test(m.sentence))) continue;
    if (sameMonth(next) && (m.day === null || m.day === next!.day) && (!inGoalSentence || INSTALMENT_WORDS.test(m.sentence))) continue;
    problems.push(`a date that is not the goal date: ${m.text}`);
  }

  // (b) No goal stored: "goal" may only appear to say there is none.
  if (!goal) {
    for (const sentence of answer.split(SENTENCES)) {
      if (GOAL_WORDS.test(sentence) && !NEGATION.test(sentence)) problems.push(`mentions a goal, and none is set: ${sentence.trim()}`);
    }
  }

  // (c) The goal's date is past: nothing about it is still to come.
  if (goal?.target_month && monthsBetween(facts.today, goal.target_month) < 0) {
    for (const sentence of answer.split(SENTENCES)) {
      if (aboutGoal(sentence) && AHEAD.test(sentence.replace(NOT_AHEAD, ' '))) problems.push(`calls a past goal date upcoming: ${sentence.trim()}`);
    }
  }

  return { ok: problems.length === 0, problems };
}
