// Explore, the fund page and its SIP box (PRD F2, F13), and starting a SIP. Funds are made up and shown
// as simulated. The goal line says what will be put in, never what it will be worth.
import type { Db } from '../db/client';
import { dayMonthYear, monthYear } from '../pipeline/chunking/format';
import { inr } from './money';
import { addDays, addMonths, firstDueDate, monthlyDueDates } from '../pipeline/loading/dates';
import { goalOptions, insertGoal, parseGoal } from './sip-actions';
import { MAX_AMOUNT } from './sip';

interface FundRow {
  id: number;
  name: string;
  category: string;
  risk_level: string;
  min_sip: number;
  exit_load_text: string;
  expense_ratio: string;
  nav: string;
  nav_date: string;
}

const NAV = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nav = (value: string) => `₹${NAV.format(Number(value))}`;
/** Preset amounts in the SIP box. They set the amount; the page adds nothing up (spec §5). */
const AMOUNT_CHIPS = [1000, 2000, 5000];
const DEFAULT_AMOUNT = 1000;

/** Every fund with the latest NAV this visitor sees (their demo market falls included). */
async function funds(db: Db, investorId: string): Promise<FundRow[]> {
  return (
    await db.query<FundRow>(
      `WITH latest AS (
         SELECT DISTINCT ON (fund_id) fund_id, nav, nav_date FROM visible_nav_history($1) ORDER BY fund_id, nav_date DESC
       )
       SELECT f.id, f.name, f.category, f.risk_level, f.min_sip, f.exit_load_text, f.expense_ratio::text,
         l.nav::text, l.nav_date::text
       FROM funds f JOIN latest l ON l.fund_id = f.id ORDER BY f.id`,
      [investorId],
    )
  ).rows;
}

/** The Mutual funds tab: category chips, a risk filter and the list (spec §8 /explore). */
export async function fundList(db: Db, investorId: string, filters: { category?: string; risk?: string }) {
  const all = await funds(db, investorId);
  const category = all.some((f) => f.category === filters.category) ? filters.category : undefined;
  const risk = all.some((f) => f.risk_level === filters.risk) ? filters.risk : undefined;
  return {
    category: category ?? null,
    risk: risk ?? null,
    categories: [...new Set(all.map((f) => f.category))],
    risks: [...new Set(all.map((f) => f.risk_level))],
    funds: all
      .filter((f) => (!category || f.category === category) && (!risk || f.risk_level === risk))
      .map((f) => ({ id: f.id, name: f.name, category: f.category, risk: f.risk_level, minSip: `Min SIP ${inr(f.min_sip)}`, nav: nav(f.nav) })),
  };
}

/** The fund page and its SIP box; null for a fund that does not exist. */
export async function fundPage(db: Db, investorId: string, fundId: number, today: string) {
  if (!Number.isInteger(fundId)) return null;
  const fund = (await funds(db, investorId)).find((f) => f.id === fundId);
  if (!fund) return null;
  const [mandate] = (
    await db.query<{ bank_label: string; method: string }>(
      'SELECT bank_label, method FROM mandates WHERE investor_id = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1',
      [investorId],
    )
  ).rows;
  return {
    id: fund.id,
    name: fund.name,
    category: fund.category,
    risk: fund.risk_level,
    nav: nav(fund.nav),
    navDate: `NAV on ${dayMonthYear(fund.nav_date)}`,
    facts: [
      { label: 'Category', value: fund.category },
      { label: 'Risk', value: fund.risk_level },
      { label: 'Minimum SIP', value: inr(fund.min_sip) },
      { label: 'Exit load', value: fund.exit_load_text },
      { label: 'Expense ratio', value: `${Number(fund.expense_ratio).toFixed(2)}%` },
    ],
    box: {
      minAmount: fund.min_sip,
      maxAmount: MAX_AMOUNT,
      amountRange: `From ${inr(fund.min_sip)} to ${inr(MAX_AMOUNT)}`,
      defaultAmount: Math.max(DEFAULT_AMOUNT, fund.min_sip),
      amountChips: AMOUNT_CHIPS.map((value) => ({ value, label: inr(value) })),
      days: Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${ordinal(i + 1)} of every month` })),
      defaultDay: Math.min(Number(today.slice(8, 10)), 28),
      mandate: mandate ? `Autopay from ${mandate.bank_label} (${mandate.method})` : 'No autopay yet: you would pay each instalment yourself',
      goalOptions: goalOptions(today, null),
    },
  };
}

export type GoalPreview = { status: 200; instalments: number; putInTotal: string; line: string } | { status: 400 | 404; error: string };

/**
 * GET /api/goal-preview: "60 x ₹2,000 = ₹1,20,000 put in by Oct 2031. That is what you put in,
 * not what it will be worth." (spec §2A). Counts the due dates from the first instalment to the target month.
 */
export async function goalPreview(db: Db, q: { fundId: number; amount: number; day: number; targetMonth: string }, today: string): Promise<GoalPreview> {
  const [fund] = (await db.query<{ min_sip: number }>('SELECT min_sip FROM funds WHERE id = $1', [Number.isInteger(q.fundId) ? q.fundId : 0])).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  const checked = checkSip(q.amount, q.day, fund.min_sip);
  if (checked) return checked;
  const parsed = parseGoal({ kind: 'custom', name: 'preview', targetMonth: q.targetMonth }, { today, firstDue: firstDueDate(today, q.day) });
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const target = parsed.goal!.target!;
  const instalments = monthlyDueDates(today, q.day, addDays(addMonths(target, 1), -1)).length;
  const putInTotal = inr(instalments * q.amount);
  return {
    status: 200,
    instalments,
    putInTotal,
    line: `${instalments} x ${inr(q.amount)} = ${putInTotal} put in by ${monthYear(target)}. That is what you put in, not what it will be worth.`,
  };
}

/** POST /api/sips: start a monthly SIP from today, with an optional goal (PRD F2). A demo order: no money moves. */
export async function startSip(db: Db, investorId: string, input: unknown, today: string): Promise<{ status: 200; id: number } | { status: 400 | 404; error: string }> {
  const body = (input ?? {}) as { fundId?: unknown; amount?: unknown; frequency?: unknown; day?: unknown; goal?: unknown };
  const [fund] = (await db.query<{ id: number; min_sip: number }>('SELECT id, min_sip FROM funds WHERE id = $1', [Number.isInteger(body.fundId) ? body.fundId : 0])).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  if (body.frequency !== undefined && body.frequency !== 'monthly') return { status: 400, error: 'Only monthly SIPs are in this prototype.' };
  const checked = checkSip(body.amount, body.day, fund.min_sip);
  if (checked) return checked;
  const amount = body.amount as number;
  const day = body.day as number;
  const parsed = parseGoal(body.goal, { today, firstDue: firstDueDate(today, day) });
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const { goal } = parsed;

  const id = await db.transaction(async (tx) => {
    const goalId = goal ? await insertGoal(tx, investorId, goal) : null;
    const { rows } = await tx.query<{ id: number }>(
      'INSERT INTO sips (investor_id, fund_id, goal_id, amount, day_of_month, started_on) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [investorId, fund.id, goalId, amount, day, today],
    );
    return rows[0].id;
  });
  return { status: 200, id };
}

function checkSip(amount: unknown, day: unknown, minSip: number): { status: 400; error: string } | null {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < minSip || amount > MAX_AMOUNT) {
    return { status: 400, error: `Enter a whole amount from ${inr(minSip)} to ${inr(MAX_AMOUNT)}.` };
  }
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 28) return { status: 400, error: 'Pick a date from the 1st to the 28th.' };
  return null;
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
