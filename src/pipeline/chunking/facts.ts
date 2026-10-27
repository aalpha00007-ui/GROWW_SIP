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
  /** Null once the SIP is stopped. */
  next_due_date: string | null;
  goal: { name: string; target_month: string | null } | null;
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
}

export function buildFactsUnit(facts: SipFacts): FactsUnit {
  const lines: FactLine[] = [
    { label: 'Fund', value: `${facts.fund_name} (${facts.fund_category})` },
    { label: 'Instalment', value: `${rupees(facts.amount)} a month` },
  ];

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
    if (facts.next_due_date) lines.push({ label: 'Next instalment', value: dayMonthYear(facts.next_due_date) });
  }
  lines.push(...goalLines(facts));

  const asOf = dayMonthYear(facts.as_of);
  const text = [`Facts about this SIP, as of ${asOf}:`, ...lines.map((l) => `- ${l.label}: ${l.value}`)].join('\n');
  return { kind: 'facts', sip_id: facts.sip_id, as_of: asOf, lines, text, numbers: numberTokens(text) };
}

function goalLines(facts: SipFacts): FactLine[] {
  const { goal } = facts;
  // Never invent a goal: say plainly when there is none.
  if (!goal) return [{ label: 'Goal', value: 'No goal is set for this SIP' }];
  if (!goal.target_month) return [{ label: 'Goal', value: `${goal.name} (no target month)` }];

  const lines: FactLine[] = [{ label: 'Goal', value: `${goal.name}, by ${monthYear(goal.target_month)}` }];
  const left = monthsBetween(facts.today, goal.target_month);
  if (left < 0) return [...lines, { label: 'Time to go', value: 'Goal date reached' }];

  lines.push({ label: 'Time to go', value: left === 0 ? 'this month' : duration(left) });
  if (facts.instalments_planned !== null) {
    const toGo = Math.max(0, facts.instalments_planned - facts.instalments_paid - facts.instalments_skipped);
    lines.push({ label: 'Instalments planned', value: `${facts.instalments_planned} (${toGo} to go)` });
  }
  return lines;
}
