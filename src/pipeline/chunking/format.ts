// Every number is formatted once, Indian style (architecture Phase 2): Rs 1,20,000 · 4.2% · 5 months.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Whole rupees with Indian grouping: 'Rs 1,20,000', '-Rs 580'. */
export function rupees(amount: number): string {
  const whole = Math.round(amount) + 0; // + 0 turns -0 into 0
  return whole < 0 ? `-Rs ${INR.format(-whole)}` : `Rs ${INR.format(whole)}`;
}

/** A change in rupees, always with its sign: '+Rs 1,200', '-Rs 580', 'Rs 0'. */
export function signedRupees(amount: number): string {
  const whole = Math.round(amount) + 0;
  return whole > 0 ? `+${rupees(whole)}` : rupees(whole);
}

/** One decimal: '4.2%'. With `signed`, a change carries its sign: '+4.2%', '-13.7%'. */
export function percent(value: number, signed = false): string {
  const rounded = Math.round(value * 10) / 10 + 0;
  const text = `${rounded.toFixed(1)}%`;
  return signed && rounded > 0 ? `+${text}` : text;
}

export function months(count: number): string {
  return `${count} ${count === 1 ? 'month' : 'months'}`;
}

/** '4 years 5 months', '1 year', '5 months'. */
export function duration(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12);
  const rest = totalMonths % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (rest > 0 || years === 0) parts.push(months(rest));
  return parts.join(' ');
}

/** '2026-11-02' -> '2 Nov 2026' */
export function dayMonthYear(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** '2031-03-01' -> 'Mar 2031' */
export function monthYear(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** Whole calendar months from one date's month to another's: Oct 2026 -> Mar 2031 is 53. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

// Rupee amounts, percentages, durations, then any other number (counts, days, years).
const NUMBER_TOKEN = /[+-]?Rs \d+(?:,\d+)*|[+-]?\d+(?:\.\d+)?%|\d+ (?:years?|months?)\b|\d+(?:,\d+)*(?:\.\d+)?/g;

/** The numbers a text states, as written. The facts unit lists its own so an answer can be checked against them. */
export function numberTokens(text: string): string[] {
  return [...new Set(text.match(NUMBER_TOKEN) ?? [])];
}
