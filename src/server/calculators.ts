// The public calculators: SIP, goal planner and SWP. Plain maths on a yearly return the visitor assumes, never a
// prediction. The monthly rate is i = annual % / 12 / 100, and every instalment goes in at the start of its month.

export const INFLATION_PCT = 6;

export const monthlyRate = (annualPct: number) => annualPct / 12 / 100;

/** What a monthly SIP could grow to: P × ((1+i)^n − 1) / i × (1+i). A 0% return just adds up the instalments. */
export function sipFutureValue(monthly: number, months: number, annualPct: number): number {
  const i = monthlyRate(annualPct);
  return i === 0 ? monthly * months : monthly * (((1 + i) ** months - 1) / i) * (1 + i);
}

export interface YearPoint {
  year: number;
  invested: number;
  value: number;
}

export interface SipPlan {
  invested: number;
  value: number;
  gains: number;
  /** Year 0 to the last year, for the chart. */
  byYear: YearPoint[];
}

export function sipPlan(monthly: number, years: number, annualPct: number): SipPlan {
  const byYear = Array.from({ length: years + 1 }, (_, year) => ({
    year,
    invested: monthly * year * 12,
    value: sipFutureValue(monthly, year * 12, annualPct),
  }));
  const { invested, value } = byYear[years];
  return { invested, value, gains: value - invested, byYear };
}

export interface GoalPlan {
  /** The amount to reach: the goal, or the goal grown by inflation. */
  target: number;
  /** Whole rupees a month, at least ₹1: a small goal far off at a high return would otherwise round to ₹0. */
  monthly: number;
  invested: number;
  byYear: YearPoint[];
}

/** The monthly SIP for a goal: target / [((1+i)^n − 1) / i × (1+i)]. With inflation, target = goal × 1.06^years. */
export function goalPlan(goal: number, years: number, annualPct: number, adjustForInflation: boolean): GoalPlan {
  const target = adjustForInflation ? goal * (1 + INFLATION_PCT / 100) ** years : goal;
  const monthly = Math.max(1, Math.round(target / sipFutureValue(1, years * 12, annualPct)));
  const { invested, byYear } = sipPlan(monthly, years, annualPct);
  return { target, monthly, invested, byYear };
}

export interface SwpPlan {
  withdrawn: number;
  finalBalance: number;
  /** Months of full withdrawals before the money ran out; null when it lasts the whole time. */
  lastsMonths: number | null;
  /** The balance at the end of each year, 0 once the money has run out. */
  byYear: { year: number; balance: number }[];
}

/** Monthly withdrawals: each month balance = balance × (1+i) − withdrawal, until the time is up or the money runs out. */
export function swpPlan(start: number, withdrawal: number, years: number, annualPct: number): SwpPlan {
  const i = monthlyRate(annualPct);
  let balance = start;
  let withdrawn = 0;
  let lastsMonths: number | null = null;
  const byYear = [{ year: 0, balance: start }];
  for (let month = 1; month <= years * 12; month++) {
    if (lastsMonths === null) {
      balance *= 1 + i;
      // A rounding hair under the withdrawal still counts as enough.
      if (balance + 1e-6 < withdrawal) {
        withdrawn += balance;
        balance = 0;
        lastsMonths = month - 1;
      } else {
        balance = Math.max(0, balance - withdrawal);
        withdrawn += withdrawal;
      }
    }
    if (month % 12 === 0) byYear.push({ year: month / 12, balance });
  }
  return { withdrawn, finalBalance: balance, lastsMonths, byYear };
}

/** 100 -> '8 years 4 months', 12 -> '1 year', 5 -> '5 months' */
export function yearsAndMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return [y > 0 && part(y, 'year'), (m > 0 || y === 0) && part(m, 'month')].filter(Boolean).join(' ');
}
