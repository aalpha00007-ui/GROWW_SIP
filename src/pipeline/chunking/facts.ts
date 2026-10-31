import { dayMonthYear, duration, monthsBetween, monthYear, months, numberTokens, percent, rupees, signedRupees } from './format';

/**
 * One SIP's facts as numbers, read for this investor at request time (Phase 5 does the SQL).
 * Nothing here is stored: totals and returns are computed when asked (PRD Appendix B).
 */
export interface SipFacts {
  sip_id: number;
  /** The request date, 'YYYY-MM-DD'. */
  today: string;
  /** The latest NAV date this investor sees, demo market falls included. */
  as_of: string;
  fund_name: string;
  fund_category: string;
  /** The fund's exit load, as the fund page states it ('1% if redeemed within 1 year', 'Nil'). */
  exit_load?: string;
  /** The fund's biggest fall from a high in its demo NAV history (-18.4) and the date it bottomed. History, not a prediction. */
  fund_biggest_fall?: { pct: number; date: string } | null;
  /** Rupees per instalment. */
  amount: number;
  months_invested: number;
  instalments_paid: number;
  instalments_skipped: number;
  /** Rupees put in so far. */
  invested: number;
  /** Units held x latest NAV, in rupees. */
  current_value: number;
  /** Largest drop from a peak since the SIP started, as a negative percent (-14.2); null before the first instalment. */
  worst_fall_since_start_pct: number | null;
  /** The latest NAV this investor sees, and the highest since the first instalment was bought (null before it). */
  latest_nav?: number;
  peak_nav_since_start?: number | null;
  /** Null once the SIP is stopped. */
  next_due_date: string | null;
  /** target_amount: whole rupees the investor aims for; null or absent when none was given. */
  goal: { name: string; target_month: string | null; target_amount?: number | null } | null;
  /** Instalments due from the start to the goal's target month; null without a target month. */
  instalments_planned: number | null;
}

export interface FactLine {
  label: string;
  value: string;
}

/** The facts unit for one SIP: the whole bundle is passed on, never split (architecture Phase 2). */
export interface FactsUnit {
  kind: 'facts';
  sip_id: number;
  /** For "Numbers as of <date>" on every card. */
  as_of: string;
  lines: FactLine[];
  /** The lines as one block, for the prompt and the fallback card's facts table. */
  text: string;
  /** Every number the unit states, as written, for the grounding check. */
  numbers: string[];
  /** Which of them count instalments, which count units, and the dates ('2 Nov'): "53 instalments" must be an instalment count. */
  kinds: { instalments: string[]; units: string[]; dates: string[] };
}

/**
 * A check on the facts before the AI sees them. A SIP worth less than was put in has fallen at least that far
 * from its start, so its worst fall can't be smaller. If it is, the facts are wrong (as on the day of a demo fall,
 * before this was fixed): the check-in shows the safe fallback instead of an AI answer. Null when they agree.
 */
export function factsProblem(facts: SipFacts): string | null {
  if (facts.instalments_paid === 0 || facts.invested === 0) return null;
  const change = ((facts.current_value - facts.invested) / facts.invested) * 100;
  if (change >= -0.05) return null;
  const worst = facts.worst_fall_since_start_pct;
  // The worst fall is rounded to one decimal, so allow that much.
  if (worst !== null && worst <= change + 0.05) return null;
  return `change vs put in is ${change.toFixed(2)}% but the worst fall since start is ${worst === null ? 'missing' : `${worst}%`}`;
}

/** Put in so far plus the instalments still to come by the goal date; null without a plan. Never a value. */
export function plannedPutIn(facts: SipFacts): number | null {
  if (facts.instalments_planned === null) return null;
  const toGo = facts.next_due_date ? Math.max(0, facts.instalments_planned - facts.instalments_paid - facts.instalments_skipped) : 0;
  return facts.invested + toGo * facts.amount;
}

export function buildFactsUnit(facts: SipFacts): FactsUnit {
  const lines: FactLine[] = [
    { label: 'Fund', value: `${facts.fund_name} (${facts.fund_category})` },
    { label: 'Instalment', value: `${rupees(facts.amount)} a month` },
  ];
  // Getting money out is a redemption, which may have an exit load: the cash route says so.
  if (facts.exit_load) lines.push({ label: 'Exit load', value: facts.exit_load });

  if (facts.instalments_paid === 0) {
    // Before the first instalment there is nothing invested, so no returns are shown.
    if (facts.next_due_date) lines.push({ label: 'First instalment', value: `due on ${dayMonthYear(facts.next_due_date)}` });
  } else {
    const change = facts.current_value - facts.invested;
    lines.push(
      { label: 'Months invested', value: months(facts.months_invested) },
      { label: 'Instalments paid', value: String(facts.instalments_paid) },
      { label: 'Instalments skipped', value: String(facts.instalments_skipped) },
      { label: 'Put in so far', value: rupees(facts.invested) },
      { label: 'Value today', value: rupees(facts.current_value) },
      { label: 'Change vs put in', value: `${signedRupees(change)} (${percent((change / facts.invested) * 100, true)})` },
    );
    if (facts.worst_fall_since_start_pct !== null) {
      lines.push({ label: 'Worst fall since start', value: percent(facts.worst_fall_since_start_pct) });
    }
  }
  // History for context, from the fund's demo NAVs: never a prediction (Fix 5).
  if (facts.fund_biggest_fall) {
    lines.push({
      label: "Biggest fall from a high in this fund's demo history",
      value: `${percent(facts.fund_biggest_fall.pct)} (${monthYear(facts.fund_biggest_fall.date)})`,
    });
  }
  if (facts.instalments_paid > 0 && facts.next_due_date) {
    // Each future instalment buys units at the NAV on its date: what one buys at the latest NAV, next to the high.
    if (facts.latest_nav) {
      const units = (nav: number) => `${(facts.amount / nav).toFixed(1)} units`;
      const peak = facts.peak_nav_since_start;
      const high = peak && peak > facts.latest_nav ? ` (${units(peak)} at the peak NAV since this SIP started)` : '';
      lines.push({ label: 'One instalment at the latest NAV buys', value: `${units(facts.latest_nav)}${high}` });
    }
    lines.push({ label: 'Next instalment', value: dayMonthYear(facts.next_due_date) });
  }
  lines.push(...goalLines(facts));

  const asOf = dayMonthYear(facts.as_of);
  const text = [`Facts about this SIP, as of ${asOf}:`, ...lines.map((l) => `- ${l.label}: ${l.value}`)].join('\n');
  const numbersIn = (...labels: string[]) => lines.filter((l) => labels.includes(l.label)).flatMap((l) => numberTokens(l.value));
  return {
    kind: 'facts', sip_id: facts.sip_id, as_of: asOf, lines, text, numbers: numberTokens(text),
    kinds: {
      instalments: numbersIn('Instalments paid', 'Instalments skipped', 'Instalments planned'),
      units: numbersIn('One instalment at the latest NAV buys'),
      dates: [...new Set([...text.matchAll(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g)].map((m) => `${m[1]} ${m[2]}`))],
    },
  };
}

function goalLines(facts: SipFacts): FactLine[] {
  const { goal } = facts;
  // Never invent a goal: say plainly when there is none.
  if (!goal) return [{ label: 'Goal', value: 'No goal is set for this SIP' }];
  // The target the investor gave, so the AI can set it next to what is planned. Never a forecast of value.
  const target: FactLine[] = goal.target_amount ? [{ label: 'Target amount', value: rupees(goal.target_amount) }] : [];
  if (!goal.target_month) return [{ label: 'Goal', value: `${goal.name} (no target month)` }, ...target];

  const lines: FactLine[] = [{ label: 'Goal', value: `${goal.name}, by ${monthYear(goal.target_month)}` }];
  const left = monthsBetween(facts.today, goal.target_month);
  if (left < 0) return [...lines, { label: 'Time to go', value: 'Goal date reached' }, ...target];

  lines.push({ label: 'Time to go', value: left === 0 ? 'this month' : duration(left) });
  if (facts.instalments_planned !== null) {
    const toGo = Math.max(0, facts.instalments_planned - facts.instalments_paid - facts.instalments_skipped);
    lines.push({ label: 'Instalments planned', value: `${facts.instalments_planned} (${toGo} to go)` });
    lines.push(...target);
    // What will have been put in by the goal date if the SIP carries on (a stopped SIP adds nothing more).
    const planned = plannedPutIn(facts)!;
    lines.push({ label: 'Planned put in by goal date', value: rupees(planned) });
    // How far into the plan the money is: most of a young plan's money is still to be put in.
    if (facts.invested > 0 && planned > 0) {
      lines.push({
        label: 'Share of the planned amount put in so far',
        value: `${rupees(facts.invested)} of ${rupees(planned)} (${Math.round((facts.invested / planned) * 100)}%)`,
      });
    }
  } else {
    lines.push(...target);
  }
  return lines;
}
