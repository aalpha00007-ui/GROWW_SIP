// The writer (call 2) never writes a number. It writes named placeholders such as {instalments_to_go}, and the
// server fills each one with the number AND the words that say what it is, in the reply's language:
// {instalments_to_go} becomes "53 instalments still to come", never a bare "53". So a number can't be given a
// meaning it doesn't have ("53 instalments planned", "a goal of Rs 85,500"): wherever the model puts it, it
// carries its own meaning. A reply with a digit or number word of the model's own, or a placeholder this SIP
// doesn't have, is not shown (checkin.ts falls back to the facts-only card).
import type { SipFacts } from '../chunking/facts';
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
const toGo = (c: Context) => c.facts.instalments_to_go ?? 0;

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
    name: 'scheduled_skips',
    available: (c) => c.facts.scheduled_skips > 0,
    phrase: (f, c) => {
      const n = c.facts.scheduled_skips;
      return pick(f, `${f.num(n)} ${plural(n, 'instalment', 'instalments')} set to be skipped`, `${f.num(n)} ${plural(n, 'kisht', 'kishtein')} skip hone wali hain`, `${f.num(n)} ${plural(n, 'किस्त', 'किस्तें')} आगे छोड़ी जानी हैं`);
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
      // Hinglish and Hindi shortened in v14 (10 words to 8): run #26's Hinglish doubt answer ran long.
      return pick(f, `a fall of ${p}, the worst since your SIP started`, `${p}, SIP ke shuru se sabse badi giravat`, `${p}, SIP की शुरुआत से सबसे बड़ी गिरावट`);
    },
  },
  {
    name: 'fund_biggest_fall',
    available: (c) => Boolean(c.facts.fund_biggest_fall),
    phrase: (f, c) => {
      const { pct, date } = c.facts.fund_biggest_fall!;
      const p = f.pct(pct);
      const when = f.monthYear(date);
      // Short on purpose (v12): the dip answer uses it with five other placeholders and must stay within MAX_WORDS.
      return pick(
        f,
        `a ${p} fall in ${when}, the biggest in this fund's demo history`,
        `${p} (${when}), fund ki demo history mein sabse badi giravat`,
        `${p} (${when}), फंड के डेमो इतिहास में सबसे बड़ी गिरावट`,
      );
    },
  },
  {
    name: 'units_now',
    available: (c) => paid(c) && c.facts.next_due_date !== null && Boolean(c.facts.latest_nav),
    phrase: (f, c) => {
      const u = f.num((c.facts.amount / c.facts.latest_nav!).toFixed(1));
      return pick(f, `${u} units per instalment at the latest NAV`, `latest NAV par ek kisht mein ${u} units`, `ताज़ा NAV पर एक किस्त में ${u} यूनिट`);
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
        `${u} units per instalment at the SIP's peak NAV`,
        `SIP ke peak NAV par ek kisht mein ${u} units`,
        `SIP के सबसे ऊँचे NAV पर एक किस्त में ${u} यूनिट`,
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
      const rs = f.rs(c.facts.planned_put_in!);
      return pick(f, `${rs} planned to be put in by the goal date`, `goal ki date tak ${rs} lagane ka plan`, `लक्ष्य की तारीख तक ${rs} लगाने की योजना`);
    },
  },
  {
    name: 'share_put_in_pct',
    available: (c) => planned(c) && c.facts.invested > 0 && (c.facts.planned_put_in ?? 0) > 0,
    phrase: (f, c) => {
      const share = `${f.num(Math.round((c.facts.invested / c.facts.planned_put_in!) * 100))}%`;
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

/**
 * v15: words of a value left out where the model's own words next to the placeholder already say them. Eval run
 * #27 and the live site (3 Nov) showed investors "invested for 8 months invested", "53 instalments still to come
 * left over 4 years 4 months to go" and "Each instalment buys 30.6 units per instalment at the latest NAV now":
 * the writer is told not to repeat a value's meaning, and Mistral does anyway. A part is left out only when the
 * words around the placeholder say the same thing, so every number still says what it is, in the model's words or
 * the value's. The number itself, and the word that says what it counts ("instalments", "units"), always stay.
 */
interface Trim {
  /** The words left out: a string where it first appears in the value, a pattern where it matches. */
  text: string | RegExp;
  /** Patterns on the words around the placeholder, with "_" where the placeholder is. Every one must match. */
  when: RegExp[];
  /** What goes in their place; nothing unless given. */
  by?: string;
}

/** Whole English words or phrases, any case. */
const words = (alternatives: string) => new RegExp(`\\b(?:${alternatives})\\b`, 'i');
const EN_FALL = words('falls?|fell|fallen|drops?|dropped|dips?|declines?|declined|slump|crash');
const EN_MOST = words('worst|biggest|largest|deepest|steepest|sharpest');
const EN_SINCE = words('since|started|starting|start|began|beginning');
const EN_LEFT = words('left|remaining|remains?|to come|to go|ahead|pending|more');
const EN_PER_INSTALMENT = words('instalments?|installments?|each|every|per');
const HL_FALL = words('fall|giravat|girawat|girav|gira|giri|gire|drop|dip');
const HL_MOST = words('sabse|worst|biggest');
const HL_LEFT = words('bacha|bachi|bache|baaki|baki|left|remaining');
const HL_PUT_IN = words('lagay\\w*|lagaa\\w*|lagai\\w*|put in|invest\\w*|daal\\w*|jama');
const HL_PER_INSTALMENT = words('kisht\\w*|instalments?|har|per|each|prati');
const HI_PER_INSTALMENT = /किस्त|हर|प्रति/;

const TRIMS: Record<string, Partial<Record<SlotLanguage, Trim[]>>> = {
  instalment_amount: {
    en: [
      { text: ' a month', when: [words('a month|per month|each month|every month|monthly|instalments? of|instalment amount')] },
      // "skip the next {instalment_amount}", "lower the {instalment_amount}": the instalment, not "a month".
      { text: ' a month', when: [/\b(?:next|lower|lowering|reduce|reducing|change|changing|raise|raising)\s+(?:the\s+|your\s+)?_/i], by: ' instalment' },
    ],
    hinglish: [{ text: 'har mahine ', when: [words('har mahine|monthly|mahina|mahine|agl[aei]|next|kisht\\w*|instalments?|kam')] }],
    hi: [{ text: 'हर महीने ', when: [/हर महीने|मासिक|अगल|किस्त|कम/] }],
  },
  months_invested: {
    en: [{ text: ' invested', when: [words('invest\\w*|ago|running')] }],
    hinglish: [{ text: ' se invest', when: [/_\s+(?:se|ke|ka|ki|mein|tak|baad)\b|\binvest|\bchal/i] }],
    hi: [{ text: ' से निवेश', when: [/_\s+(?:से|के|का|की|में|तक|बाद)(?![\p{L}\p{M}])|निवेश|चल/u] }],
  },
  instalments_paid: {
    en: [{ text: ' paid', when: [words('paid|made|completed|deducted|gone through')] }],
    hinglish: [{ text: ' bhari', when: [words('bhar\\w*|paid|jama|diye|kat\\w*')] }],
    hi: [{ text: / भरी गईं?$/, when: [/भर|जमा|चुका|कट/] }],
  },
  instalments_skipped: {
    en: [{ text: ' skipped', when: [words('skip\\w*|miss\\w*')] }],
  },
  put_in_so_far: {
    en: [
      { text: ' put in', when: [words('put in|putting in|invested|contributed|paid in|added')] },
      { text: ' so far', when: [words('so far|till now|until now|to date|already|by now')] },
    ],
    hinglish: [
      { text: 'ab tak ', when: [words('ab tak|abhi tak|so far|till now')] },
      { text: ' lagaye', when: [HL_PUT_IN] },
    ],
    hi: [
      { text: 'अब तक ', when: [/अब तक|अभी तक/] },
      { text: 'लगाए ', when: [/लगा|निवेश|डाल|जमा/] },
    ],
  },
  value_today: {
    en: [{ text: /^a value today of /, when: [words('value|worth|valued|stands at')] }],
    hinglish: [{ text: 'aaj ki value ', when: [words('value|worth|keemat|kimat')] }],
    hi: [{ text: 'आज की वैल्यू ', when: [/वैल्यू|मूल्य|कीमत/] }],
  },
  change_vs_put_in: {
    en: [{ text: ' against what was put in', when: [words('against|compared|versus|vs|put in|invested')] }],
    hinglish: [{ text: 'lagaye paise ke mukable ', when: [words('mukable|mukabale|compared|against|lagaye|invest\\w*')] }],
  },
  worst_fall: {
    en: [
      { text: /^a fall of /, when: [EN_FALL] },
      { text: ', the worst', when: [EN_MOST] },
      { text: ' since your SIP started', when: [EN_SINCE] },
    ],
    hinglish: [{ text: ', SIP ke shuru se sabse badi giravat', when: [HL_MOST, HL_FALL] }],
    hi: [{ text: ', SIP की शुरुआत से सबसे बड़ी गिरावट', when: [/सबसे/, /गिरावट|गिर/] }],
  },
  fund_biggest_fall: {
    en: [
      { text: /^a /, when: [EN_FALL] },
      { text: ' fall', when: [EN_FALL] },
      { text: ', the biggest', when: [EN_MOST] },
      { text: " in this fund's demo history", when: [words('history')] },
    ],
    hinglish: [{ text: ', fund ki demo history mein sabse badi giravat', when: [HL_MOST, HL_FALL] }],
    hi: [{ text: ', फंड के डेमो इतिहास में सबसे बड़ी गिरावट', when: [/सबसे/, /गिरावट|गिर/] }],
  },
  units_now: {
    en: [
      { text: ' per instalment', when: [EN_PER_INSTALMENT] },
      { text: ' at the latest NAV', when: [words('now|today|currently|current|latest|nav')] },
    ],
    hinglish: [
      { text: 'latest NAV par ', when: [words('nav|abhi|aaj|ab|latest|current')] },
      { text: 'ek kisht mein ', when: [HL_PER_INSTALMENT] },
    ],
    hi: [
      { text: 'ताज़ा NAV पर ', when: [/NAV|अभी|आज|ताज़ा|ताजा/] },
      { text: 'एक किस्त में ', when: [HI_PER_INSTALMENT] },
    ],
  },
  units_at_peak: {
    en: [
      { text: ' per instalment', when: [EN_PER_INSTALMENT] },
      { text: " at the SIP's peak NAV", when: [words('peak')] },
    ],
    hinglish: [{ text: 'ek kisht mein ', when: [HL_PER_INSTALMENT] }],
    hi: [{ text: 'एक किस्त में ', when: [HI_PER_INSTALMENT] }],
  },
  time_to_goal: {
    // "in {time_to_goal}", "{time_to_goal} left", "{time_to_goal} away": not "4 years 4 months to go" there.
    en: [{ text: ' to go', when: [/\b(?:left|remaining|remains?|away|to go|ahead|more)\b|\b(?:in|within|until|till|before|over)\s+_/i] }],
    // "{goal_name} ke liye {time_to_goal} bacha hai": the goal is named already, and "bacha" says what is left.
    hinglish: [
      { text: 'goal tak ', when: [/\{goal_name\}|\bgoal\b/i] },
      { text: ' baaki', when: [HL_LEFT] },
    ],
    hi: [
      { text: 'लक्ष्य तक ', when: [/\{goal_name\}|लक्ष्य/] },
      { text: ' बाकी', when: [/बचा|बची|बचे|बाकी|शेष|रह/] },
    ],
  },
  instalments_planned: {
    en: [{ text: ' in all', when: [words('in all|in total|total|overall')] }],
  },
  instalments_to_go: {
    en: [{ text: ' still to come', when: [EN_LEFT] }],
    hinglish: [{ text: ' abhi baaki', when: [HL_LEFT] }],
    hi: [{ text: 'अभी बाकी ', when: [/बाकी|बची|बचे|शेष|रह/] }],
  },
  share_put_in_pct: {
    en: [
      { text: ' of the planned amount', when: [words('plan|plans|planned|target')] },
      { text: ' put in so far', when: [words('put in|invested|contributed|paid in|reached|completed|done')] },
    ],
    hinglish: [
      { text: 'plan ki rakam ka ', when: [words('plan|target')] },
      { text: ' ab tak lagaya', when: [HL_PUT_IN] },
    ],
    hi: [
      { text: 'योजना की रकम का ', when: [/योजना|प्लान/] },
      { text: ' अब तक लगाया', when: [/लगा|निवेश|डाल|जमा/] },
    ],
  },
  target_amount: {
    en: [{ text: /^a target of /, when: [words('target')] }],
  },
};

/** Where a clause ends: the words around a placeholder are looked for in its own clause only. */
const CLAUSE_END = /[.!?।;:,()\n—–]/;
/** How many words on each side of a placeholder count as around it. */
const AROUND_WORDS = 8;

/** The model's words around the placeholder at [start, end) in its clause, with "_" where the placeholder is. */
export function around(text: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !CLAUSE_END.test(text[from - 1])) from--;
  let to = end;
  while (to < text.length && !CLAUSE_END.test(text[to])) to++;
  const before = wordsOf(text.slice(from, start)).slice(-AROUND_WORDS);
  const after = wordsOf(text.slice(end, to)).slice(0, AROUND_WORDS);
  return [...before, '_', ...after].join(' ');
}

/** A placeholder's value without the parts the words around it already say (TRIMS). */
export function trimmedValue(name: string, value: string, lang: SlotLanguage, nearby: string): string {
  let v = value;
  for (const t of TRIMS[name]?.[lang] ?? []) {
    if (t.when.every((p) => p.test(nearby))) v = v.replace(t.text, () => t.by ?? '');
  }
  return v.trim();
}

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
    if (facts.scheduled_skips > 0) lines.push('Some instalments ahead are set to be skipped.');
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

/** A word of the model's own text: letters and marks in any script (the model writes no digits). */
const WORD = "[\\p{L}\\p{M}'’]+";
/** Up to this many words the model repeats next to a placeholder are dropped ("an exit load of {exit_load}"). */
const MAX_DOUBLED = 4;
const AFTER = new RegExp(`\\{([^{}]*)\\}((?:[ \\t]+${WORD}){1,${MAX_DOUBLED}})`, 'gu');
const BEFORE = new RegExp(`(?<![\\p{L}\\p{M}'’])((?:${WORD}[ \\t]+){1,${MAX_DOUBLED}})\\{([^{}]*)\\}`, 'gu');
/** A word that already says which one: "your", "the", "Today's". An English value's own "a" or "the" goes after it. */
const DETERMINER_BEFORE = /(?:\b(?:the|a|an|your|my|our|their|its|this|that|these|those|his|her)|\p{L}['’]s)\s+$/iu;
const sameWord = (w: string) => w.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => sameWord(w) === sameWord(b[i]));

/**
 * Puts each placeholder's value in. A placeholder that starts a sentence starts with a capital letter. A rupee
 * sign or "Rs" the model put before an amount placeholder, or a "%" after one, is dropped: the value has its own.
 * So are words the model wrote again right next to a placeholder whose value already has them at that edge
 * ("{pause_length} instalments" would read "1 to 3 instalments instalments"; "an exit load of {exit_load}" would
 * read "an exit load of an exit load of 1% ..."), and an English value's "a" after a word like "your" or "the"
 * ("your a value today of ..."). Since v15 each placeholder also leaves out the parts of its value that the
 * model's words around it already say (TRIMS): "invested for {months_invested}" reads "invested for 8 months".
 * Unknown placeholders are left as they are; writtenNumbers has already failed the reply for them.
 */
export function fillSlots(raw: string, slots: Slot[], language: Language): string {
  const lang = slotLanguage(language);
  const full = new Map(slots.map((s) => [s.name, s.values[lang]]));
  // Each placeholder gets a value of its own, keyed by where it is: the same one can need different words in two places.
  const values = new Map<string, string>();
  const keyed = raw.replace(SLOT, (whole: string, name: string, offset: number) => {
    const value = full.get(name.trim());
    if (value === undefined) return whole;
    const key = `${name.trim()}#${values.size}`;
    values.set(key, trimmedValue(name.trim(), value, lang, around(raw, offset, offset + whole.length)));
    return `{${key}}`;
  });
  const text = keyed
    .replace(/(?:\bRs\.?|₹|\bINR)\s*(?=\{)/g, '')
    .replace(/\}\s*%/g, '}')
    .replace(AFTER, (whole, name: string, tail: string) => {
      const value = values.get(name.trim());
      if (value === undefined) return whole;
      const next = wordsOf(tail);
      const end = wordsOf(value);
      for (let k = Math.min(next.length, end.length); k >= 1; k--) {
        if (sameWords(next.slice(0, k), end.slice(-k))) return `{${name}}${tail.replace(new RegExp(`^(?:[ \\t]+${WORD}){${k}}`, 'u'), '')}`;
      }
      return whole;
    })
    .replace(BEFORE, (whole, head: string, name: string) => {
      const value = values.get(name.trim());
      if (value === undefined) return whole;
      const before = wordsOf(head);
      const start = wordsOf(value);
      for (let k = Math.min(before.length, start.length); k >= 1; k--) {
        if (sameWords(before.slice(-k), start.slice(0, k))) {
          const kept = before.slice(0, before.length - k).join(' ');
          return `${kept ? `${kept} ` : ''}{${name}}`;
        }
      }
      return whole;
    });
  return text.replace(SLOT, (whole, name: string, offset: number) => {
    let value = values.get(name.trim());
    if (value === undefined) return whole;
    const preceding = text.slice(0, offset);
    if (lang === 'en' && /^(?:a|an|the)\s/i.test(value) && DETERMINER_BEFORE.test(preceding)) value = value.replace(/^(?:a|an|the)\s+/i, '');
    const startsSentence = /(?:^|[.!?।]\s+|\n\s*)$/.test(preceding);
    return startsSentence ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  });
}

/** Words that say one number is bigger or smaller than another, in English, Hinglish and Hindi. */
const COMPARATIVES = [
  /\b(?:larger|bigger|greater|smaller|higher|lower|deeper|steeper|worse|better|more|less|fewer)\s+than\b/giu,
  /\bse\s+(?:zyada|jyada|zyaada|adhik|kam|bada|badi|bade|chhota|chhoti|chhote|behtar|bura|buri|gehra|gehri)\b/giu,
  new RegExp('(?<![\\p{L}\\p{M}])से\\s+(?:ज़्यादा|ज्यादा|अधिक|कम|बड़ा|बड़ी|बड़े|छोटा|छोटी|छोटे|बेहतर|बुरा|बुरी|गहरा|गहरी)(?![\\p{L}\\p{M}])'.normalize('NFC'), 'gu'),
];

/**
 * Comparisons the model made between two placeholders in one sentence ("{worst_fall} is larger than
 * {fund_biggest_fall}"). The prompt forbids them: the model never sees the numbers, so it can't know which is
 * bigger, and -20.7% "larger than" -21.0% is simply wrong. Setting two numbers side by side ("next to",
 * "against") is not a comparison and passes.
 */
export function comparisons(raw: string): string[] {
  const found: string[] = [];
  for (const sentence of raw.normalize('NFC').split(/[.!?।]+/)) {
    if ((sentence.match(SLOT) ?? []).length < 2) continue;
    for (const pattern of COMPARATIVES) found.push(...(sentence.match(pattern) ?? []));
  }
  return found;
}
