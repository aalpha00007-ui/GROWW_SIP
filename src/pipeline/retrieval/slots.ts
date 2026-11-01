// The writer (call 2) never writes a number. It writes named placeholders such as {instalments_to_go}, and the
// server fills each one with the number AND the words that say what it is, in the reply's language:
// {instalments_to_go} becomes "53 instalments still to come", never a bare "53". So a number can't be given a
// meaning it doesn't have ("53 instalments planned", "a goal of Rs 85,500"): wherever the model puts it, it
// carries its own meaning. A reply with a digit or number word of the model's own, or a placeholder this SIP
// doesn't have, is not shown (checkin.ts falls back to the facts-only card).
import { plannedPutIn, type SipFacts } from '../chunking/facts';
import { dayMonthYear, duration, monthsBetween, monthYear, months, percent, rupees, signedRupees } from '../chunking/format';
import type { Language } from './prompts';

/** The languages a reply is filled in: anything else is answered in English. */
export type SlotLanguage = 'en' | 'hinglish' | 'hi';

export interface Slot {
  name: string;
  /** What the placeholder becomes, per language. */
  values: Record<SlotLanguage, string>;
  /** What it becomes in English with every number shown as #: what the writer is told, so it never sees a number. */
  reads: string;
}

/** The pause explainer's range, "1 to 3 instalments" (data/raw/explainers/pause.md; a test keeps them in step). */
export const PAUSE_RANGE = [1, 3] as const;

const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

/** Numbers formatted for one language, or masked as # for the writer's prompt. */
interface Fmt {
  lang: SlotLanguage;
  rs(n: number): string;
  signedRs(n: number): string;
  pct(n: number, signed?: boolean): string;
  num(n: number | string): string;
  date(d: string): string;
  monthYear(d: string): string;
  duration(totalMonths: number): string;
  months(n: number): string;
}

function fmt(lang: SlotLanguage): Fmt {
  const hiDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return `${day} ${HI_MONTHS[m - 1]} ${y}`;
  };
  const hiMonthYear = (d: string) => {
    const [y, m] = d.split('-').map(Number);
    return `${HI_MONTHS[m - 1]} ${y}`;
  };
  const localMonths = (n: number) => (lang === 'en' ? months(n) : lang === 'hinglish' ? `${n} ${n === 1 ? 'mahina' : 'mahine'}` : `${n} ${n === 1 ? 'महीना' : 'महीने'}`);
  return {
    lang,
    rs: rupees,
    signedRs: signedRupees,
    pct: percent,
    num: (n) => String(n),
    date: lang === 'hi' ? hiDate : dayMonthYear,
    monthYear: lang === 'hi' ? hiMonthYear : monthYear,
    duration: (total) => {
      if (lang === 'en') return duration(total);
      const years = Math.floor(total / 12);
      const rest = total % 12;
      const y = years > 0 ? `${years} ${lang === 'hinglish' ? 'saal' : 'साल'}` : '';
      return [y, rest > 0 || years === 0 ? localMonths(rest) : ''].filter(Boolean).join(' ');
    },
    months: localMonths,
  };
}

/** The English wording with every number as #: "# instalments still to come". */
const MASK: Fmt = {
  lang: 'en',
  rs: () => 'Rs #',
  signedRs: () => 'Rs #, with its sign',
  pct: () => '#%',
  num: () => '#',
  date: () => '<a date>',
  monthYear: () => '<a month and year>',
  duration: () => '<years and months>',
  months: () => '# months',
};

const pick = (f: Fmt, en: string, hinglish: string, hi: string) => (f.lang === 'en' ? en : f.lang === 'hinglish' ? hinglish : hi);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

interface Context {
  facts: SipFacts;
  /** Months from today to the goal's target month; null without one. */
  left: number | null;
  /** The route's explainers include the pause range (pause or stop). */
  pause: boolean;
}

interface SlotDef {
  name: string;
  available(c: Context): boolean;
  phrase(f: Fmt, c: Context): string;
}

const paid = (c: Context) => c.facts.instalments_paid > 0;
const planned = (c: Context) => c.left !== null && c.left >= 0 && c.facts.instalments_planned !== null;
const toGo = (c: Context) => Math.max(0, c.facts.instalments_planned! - c.facts.instalments_paid - c.facts.instalments_skipped);

const DEFS: SlotDef[] = [
  {
    name: 'instalment_amount',
    available: () => true,
    phrase: (f, c) => pick(f, `${f.rs(c.facts.amount)} a month`, `har mahine ${f.rs(c.facts.amount)}`, `हर महीने ${f.rs(c.facts.amount)}`),
  },
  {
    name: 'first_instalment_date',
    available: (c) => !paid(c) && c.facts.next_due_date !== null,
    phrase: (f, c) => f.date(c.facts.next_due_date!),
  },
  {
    name: 'months_invested',
    available: paid,
    phrase: (f, c) => pick(f, `${f.months(c.facts.months_invested)} invested`, `${f.months(c.facts.months_invested)} se invest`, `${f.months(c.facts.months_invested)} से निवेश`),
  },
  {
    name: 'instalments_paid',
    available: paid,
    phrase: (f, c) => {
      const n = c.facts.instalments_paid;
      return pick(f, `${f.num(n)} ${plural(n, 'instalment', 'instalments')} paid`, `${f.num(n)} ${plural(n, 'kisht', 'kishtein')} bhari`, `${f.num(n)} ${plural(n, 'किस्त भरी गई', 'किस्तें भरी गईं')}`);
    },
  },
  {
    name: 'instalments_skipped',
    available: paid,
    phrase: (f, c) => {
      const n = c.facts.instalments_skipped;
      if (n === 0) return pick(f, 'no instalments skipped', 'koi kisht skip nahi ki', 'कोई किस्त नहीं छोड़ी');
      return pick(f, `${f.num(n)} ${plural(n, 'instalment', 'instalments')} skipped`, `${f.num(n)} ${plural(n, 'kisht', 'kishtein')} skip ki`, `${f.num(n)} ${plural(n, 'किस्त छोड़ी', 'किस्तें छोड़ीं')}`);
    },
  },
  {
    name: 'put_in_so_far',
    available: paid,
    phrase: (f, c) => pick(f, `${f.rs(c.facts.invested)} put in so far`, `ab tak ${f.rs(c.facts.invested)} lagaye`, `अब तक लगाए ${f.rs(c.facts.invested)}`),
  },
  {
    name: 'value_today',
    available: paid,
    phrase: (f, c) => pick(f, `a value today of ${f.rs(c.facts.current_value)}`, `aaj ki value ${f.rs(c.facts.current_value)}`, `आज की वैल्यू ${f.rs(c.facts.current_value)}`),
  },
  {
    name: 'change_vs_put_in',
    available: paid,
    phrase: (f, c) => {
      const change = c.facts.current_value - c.facts.invested;
      const both = `${f.signedRs(change)} (${f.pct((change / c.facts.invested) * 100, true)})`;
      return pick(f, `${both} against what was put in`, `lagaye paise ke mukable ${both}`, `लगाए पैसों के मुकाबले ${both}`);
    },
  },
  {
    name: 'worst_fall',
    available: (c) => paid(c) && c.facts.worst_fall_since_start_pct !== null,
    phrase: (f, c) => {
      const worst = c.facts.worst_fall_since_start_pct!;
      if (worst > -0.05) return pick(f, 'no fall since your SIP started', 'SIP shuru hone ke baad koi giravat nahi', 'SIP शुरू होने के बाद कोई गिरावट नहीं');
      const p = f.pct(worst);
      return pick(f, `a fall of ${p}, the worst since your SIP started`, `${p} ki giravat, SIP shuru hone ke baad sabse badi`, `${p} की गिरावट, SIP शुरू होने के बाद सबसे बड़ी`);
    },
  },
  {
    name: 'fund_biggest_fall',
    available: (c) => Boolean(c.facts.fund_biggest_fall),
    phrase: (f, c) => {
      const { pct, date } = c.facts.fund_biggest_fall!;
      const p = f.pct(pct);
      const when = f.monthYear(date);
      return pick(
        f,
        `a fall of ${p} in ${when}, the biggest from a high in this fund's demo history`,
        `${p} ki giravat (${when}), is fund ki demo history mein high se sabse badi`,
        `${p} की गिरावट (${when}), इस फंड के डेमो इतिहास में ऊँचाई से सबसे बड़ी`,
      );
    },
  },
  {
    name: 'units_now',
    available: (c) => paid(c) && c.facts.next_due_date !== null && Boolean(c.facts.latest_nav),
    phrase: (f, c) => {
      const u = f.num((c.facts.amount / c.facts.latest_nav!).toFixed(1));
      return pick(f, `${u} units for one instalment at the latest NAV`, `latest NAV par ek kisht mein ${u} units`, `ताज़ा NAV पर एक किस्त में ${u} यूनिट`);
    },
  },
  {
    name: 'units_at_peak',
    available: (c) =>
      paid(c) && c.facts.next_due_date !== null && Boolean(c.facts.latest_nav) && Boolean(c.facts.peak_nav_since_start && c.facts.peak_nav_since_start > c.facts.latest_nav!),
    phrase: (f, c) => {
      const u = f.num((c.facts.amount / c.facts.peak_nav_since_start!).toFixed(1));
      return pick(
        f,
        `${u} units for one instalment at the peak NAV since your SIP started`,
        `SIP shuru hone ke baad peak NAV par ek kisht mein ${u} units`,
        `SIP शुरू होने के बाद सबसे ऊँचे NAV पर एक किस्त में ${u} यूनिट`,
      );
    },
  },
  {
    name: 'next_instalment_date',
    available: (c) => paid(c) && c.facts.next_due_date !== null,
    phrase: (f, c) => f.date(c.facts.next_due_date!),
  },
  {
    name: 'exit_load',
    available: (c) => Boolean(c.facts.exit_load),
    phrase: (f, c) => exitLoad(f, c.facts.exit_load!),
  },
  { name: 'goal_name', available: (c) => c.facts.goal !== null, phrase: (_f, c) => c.facts.goal!.name },
  {
    name: 'goal_date',
    available: (c) => Boolean(c.facts.goal?.target_month),
    phrase: (f, c) => f.monthYear(c.facts.goal!.target_month!),
  },
  {
    name: 'time_to_goal',
    available: (c) => c.left !== null,
    phrase: (f, c) => {
      const left = c.left!;
      if (left < 0) return pick(f, 'no time left: the goal date has passed', 'goal ki date nikal chuki hai', 'लक्ष्य की तारीख निकल चुकी है');
      if (left === 0) return pick(f, 'less than a month to go', 'goal tak ek mahine se kam baaki', 'लक्ष्य तक एक महीने से कम बाकी');
      return pick(f, `${f.duration(left)} to go`, `goal tak ${f.duration(left)} baaki`, `लक्ष्य तक ${f.duration(left)} बाकी`);
    },
  },
  {
    name: 'instalments_planned',
    available: planned,
    phrase: (f, c) => {
      const n = c.facts.instalments_planned!;
      return pick(f, `${f.num(n)} instalments planned in all`, `kul ${f.num(n)} kishtein plan mein`, `कुल ${f.num(n)} किस्तों की योजना`);
    },
  },
  {
    name: 'instalments_to_go',
    available: planned,
    phrase: (f, c) => {
      const n = toGo(c);
      return pick(f, `${f.num(n)} ${plural(n, 'instalment', 'instalments')} still to come`, `${f.num(n)} ${plural(n, 'kisht', 'kishtein')} abhi baaki`, `अभी बाकी ${f.num(n)} ${plural(n, 'किस्त', 'किस्तें')}`);
    },
  },
  {
    name: 'planned_total',
    available: planned,
    phrase: (f, c) => {
      const rs = f.rs(plannedPutIn(c.facts)!);
      return pick(f, `${rs} planned to be put in by the goal date`, `goal ki date tak ${rs} lagane ka plan`, `लक्ष्य की तारीख तक ${rs} लगाने की योजना`);
    },
  },
  {
    name: 'share_put_in_pct',
    available: (c) => planned(c) && c.facts.invested > 0 && (plannedPutIn(c.facts) ?? 0) > 0,
    phrase: (f, c) => {
      const share = `${f.num(Math.round((c.facts.invested / plannedPutIn(c.facts)!) * 100))}%`;
      return pick(f, `${share} of the planned amount put in so far`, `plan ki rakam ka ${share} ab tak lagaya`, `योजना की रकम का ${share} अब तक लगाया`);
    },
  },
  {
    name: 'target_amount',
    available: (c) => Boolean(c.facts.goal?.target_amount),
    phrase: (f, c) => {
      const rs = f.rs(c.facts.goal!.target_amount!);
      return pick(f, `a target of ${rs}`, `${rs} ka target`, `${rs} का लक्ष्य`);
    },
  },
  {
    name: 'pause_length',
    available: (c) => c.pause,
    phrase: (f) => {
      const [from, to] = PAUSE_RANGE.map((n) => f.num(n));
      return pick(f, `${from} to ${to} instalments`, `${from} se ${to} kishtein`, `${from} से ${to} किस्तें`);
    },
  },
];

/** "1% if redeemed within 1 year", "Nil", "Nil after 7 days": the fund's exit load as a phrase. */
function exitLoad(f: Fmt, text: string): string {
  const load = /^(\d+(?:\.\d+)?)% if redeemed within (\d+) (year|years|month|months|day|days)$/.exec(text);
  if (load) {
    const [, rate, n, unit] = load;
    const u = unit.replace(/s$/, '');
    const en = `an exit load of ${f.num(rate)}% if redeemed within ${f.num(n)} ${Number(n) === 1 ? u : `${u}s`}`;
    const words = { year: ['saal', 'साल'], month: ['mahine', 'महीने'], day: ['din', 'दिन'] }[u as 'year' | 'month' | 'day'];
    return pick(f, en, `${f.num(n)} ${words[0]} ke andar redeem karne par ${f.num(rate)}% exit load`, `${f.num(n)} ${words[1]} के अंदर निकालने पर ${f.num(rate)}% एग्ज़िट लोड`);
  }
  if (text === 'Nil') return pick(f, 'no exit load', 'koi exit load nahi', 'कोई एग्ज़िट लोड नहीं');
  // Rarer forms ("Nil (3-year lock-in)") keep the fund page's own words.
  return f === MASK ? 'the exit load, as the fund states it' : pick(f, `an exit load of ${text}`, `exit load: ${text}`, `एग्ज़िट लोड: ${text}`);
}

/** The placeholders this SIP has, with their values in each language. `pause`: the route's explainers give the pause range. */
export function slotsFor(facts: SipFacts, options: { pause: boolean }): Slot[] {
  const target = facts.goal?.target_month;
  const c: Context = { facts, left: target ? monthsBetween(facts.today, target) : null, pause: options.pause };
  return DEFS.filter((d) => d.available(c)).map((d) => ({
    name: d.name,
    values: { en: d.phrase(fmt('en'), c), hinglish: d.phrase(fmt('hinglish'), c), hi: d.phrase(fmt('hi'), c) },
    reads: d.phrase(MASK, c),
  }));
}

/** What is true about the SIP, in words with no numbers, so the writer knows the situation without seeing a number. */
export function situation(facts: SipFacts): string[] {
  const lines: string[] = [];
  if (facts.instalments_paid === 0) lines.push('No instalment has been paid yet.');
  else {
    const change = Math.round(facts.current_value) - Math.round(facts.invested);
    lines.push(`The value today is ${change < 0 ? 'below' : change > 0 ? 'above' : 'the same as'} what was put in.`);
    lines.push(facts.instalments_skipped > 0 ? 'Some instalments have been skipped.' : 'No instalment has been skipped.');
  }
  const { goal } = facts;
  if (!goal) lines.push('No goal is set for this SIP.');
  else if (!goal.target_month) lines.push('A goal is set, with no target month.');
  else if (monthsBetween(facts.today, goal.target_month) < 0) lines.push('A goal is set, and its date has passed.');
  else lines.push('A goal is set, with a target month.');
  if (goal?.target_amount) lines.push('The investor gave a target amount for the goal.');
  return lines;
}

export const slotLanguage = (language: Language): SlotLanguage => (language === 'hi' || language === 'hinglish' ? language : 'en');

const SLOT = /\{([^{}]*)\}/g;
/** Every kind of digit, in any script: 0-9, Devanagari ०-९, and the others. */
const DIGITS = /\p{Nd}+(?:[.,]\p{Nd}+)*/gu;
/** Number words the model might write instead of digits. "one" is left out: it is also a pronoun ("the next one"). */
const EN_NUMBER_WORDS =
  /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|lakhs?|lacs?|crores?|millions?|billions?|half|twice|double|triple|dozens?)\b/gi;
/**
 * Hinglish number words. Left out: "ek" is "one" (see above); "do" is also the English verb and the Hindi "give";
 * "saath" (sixty) is also "with" ("ke saath"). Those can't be told from the numbers.
 */
const HINGLISH_NUMBER_WORDS =
  /\b(teen|chaar|char|paanch|panch|chhe|chhah|chheh|saat|aath|nau|das|gyarah|barah|bees|tees|chalees|chalis|pachaas|pachas|sau|hazaar|hazar|hajar|karod|aadha|aadhi|dugna|dugne|dugni|tigna)\b/gi;
/** Hindi number words. "एक" (one) is left out, as above. */
const HI_NUMBER_WORDS =
  /(?<![\p{L}\p{M}])(दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ|दस|ग्यारह|बारह|बीस|तीस|चालीस|पचास|साठ|सौ|हज़ार|हजार|लाख|करोड़|आधा|आधी|आधे|दोगुना|दुगना|तिगुना)(?![\p{L}\p{M}])/gu;

/**
 * Everything in the model's own text that could state a number: digits in any script, number words in English,
 * Hinglish and Hindi, placeholders this SIP doesn't have, and stray braces. Empty when the text is clean.
 */
export function writtenNumbers(raw: string, allowed: Iterable<string>): string[] {
  const names = new Set(allowed);
  const found: string[] = [];
  for (const [whole, name] of raw.matchAll(SLOT)) if (!names.has(name.trim())) found.push(whole);
  const prose = raw.replace(SLOT, ' ');
  if (/[{}]/.test(prose)) found.push('a stray brace');
  for (const pattern of [DIGITS, EN_NUMBER_WORDS, HINGLISH_NUMBER_WORDS, HI_NUMBER_WORDS]) found.push(...(prose.match(pattern) ?? []));
  return found;
}

/**
 * Puts each placeholder's value in. A placeholder that starts a sentence starts with a capital letter. A rupee
 * sign or "Rs" the model put before an amount placeholder, or a "%" after one, is dropped: the value has its own.
 * Unknown placeholders are left as they are; writtenNumbers has already failed the reply for them.
 */
export function fillSlots(raw: string, slots: Slot[], language: Language): string {
  const values = new Map(slots.map((s) => [s.name, s.values[slotLanguage(language)]]));
  const text = raw.replace(/(?:\bRs\.?|₹|\bINR)\s*(?=\{)/g, '').replace(/\}\s*%/g, '}');
  return text.replace(SLOT, (whole, name: string, offset: number) => {
    const value = values.get(name.trim());
    if (value === undefined) return whole;
    const startsSentence = /(?:^|[.!?।]\s+|\n\s*)$/.test(text.slice(0, offset));
    return startsSentence ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  });
}
