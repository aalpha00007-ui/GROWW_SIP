// Explore, the fund page and its order card (PRD F2, F13), starting a SIP and a one-time investment.
// Funds are made up and shown as simulated. The goal line says what will be put in, never what it will be
// worth; only the fund page's return calculator estimates a value, from the fund's demo 3Y return, and says so.
import type { Db } from '../db/client';
import { dayMonthYear, monthYear, ordinal, percent } from '../pipeline/chunking/format';
import { inr } from './money';
import { addDays, addMonths, firstDueDate, monthlyDueDates } from '../pipeline/loading/dates';
import { loadMarket } from '../pipeline/loading/raw';
import { logEvent, tooltipDismissed } from './events';
import { demoBalance } from './shell';
import { GOAL_NAME_MAX, goalChoices, goalOptions, insertGoal, oneTimeGoal, parseGoal, TARGET_MAX, TARGET_MIN } from './sip-actions';
import { MAX_AMOUNT } from './sip';

interface FundRow {
  id: number;
  name: string;
  category: string;
  sub_category: string;
  risk_level: string;
  min_sip: number;
  exit_load_text: string;
  expense_ratio: string;
  aum_cr: number;
  rating: number;
  nav: string;
  nav_date: string;
  /** The NAV 3 years before the latest one (or on the closest earlier date). */
  nav_3y: string | null;
}

const NAV = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nav = (value: string | number) => `₹${NAV.format(Number(value))}`;
const WHOLE = new Intl.NumberFormat('en-IN');
/** Quick-add chips in the order card: each adds to the amount. */
const QUICK_ADD = [1000, 2000, 5000];
const DEFAULT_AMOUNT = 1000;
/** A made-up mandate for everyone: never a real bank or account number. */
export const DEMO_MANDATE = 'Pay via mandate · Demo Bank ····0000';

/** Every fund with the latest NAV this visitor sees (their demo market falls included), and the NAV 3 years before it. */
async function funds(db: Db, investorId: string): Promise<FundRow[]> {
  return (
    await db.query<FundRow>(
      `WITH latest AS (
         SELECT DISTINCT ON (fund_id) fund_id, nav, nav_date FROM visible_nav_history($1) ORDER BY fund_id, nav_date DESC
       )
       SELECT f.id, f.name, f.category, f.sub_category, f.risk_level, f.min_sip, f.exit_load_text, f.expense_ratio::text,
         f.aum_cr, f.rating, l.nav::text, l.nav_date::text,
         (SELECT h.nav::text FROM nav_history h WHERE h.fund_id = f.id AND h.nav_date <= (l.nav_date - interval '3 years')::date
          ORDER BY h.nav_date DESC LIMIT 1) AS nav_3y
       FROM funds f JOIN latest l ON l.fund_id = f.id ORDER BY f.id`,
      [investorId],
    )
  ).rows;
}

/** The 3-year return a year at a time (0.142 for 14.2%); null without 3 years of NAVs. */
function return3y(f: FundRow): number | null {
  return f.nav_3y === null ? null : (Number(f.nav) / Number(f.nav_3y)) ** (1 / 3) - 1;
}

export interface FundCard {
  id: number;
  name: string;
  initials: string;
  /** 'Large cap · Very High risk' */
  about: string;
  /** '+14.2%' or '-3.1%': the 3-year return, a year at a time. Null without 3 years of NAVs. */
  return3y: string | null;
  /** '₹18,420 Cr' */
  size: string;
  rating: number;
}

function card(f: FundRow): FundCard {
  const r = return3y(f);
  return {
    id: f.id,
    name: f.name,
    initials: initials(f.name),
    about: `${f.sub_category} · ${f.risk_level} risk`,
    return3y: r === null ? null : percent(r * 100, true),
    size: `₹${WHOLE.format(f.aum_cr)} Cr`,
    rating: f.rating,
  };
}

/** 'Banyan Flexi Cap Fund' -> 'BF' */
export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

/** "Popular funds" on Explore: 8 made-up funds, two rows of four. */
const POPULAR = [
  'Kestrel Nifty 50 Index Fund', 'Banyan Flexi Cap Fund', 'Peepal Large Cap Fund', 'Monsoon Midcap Fund',
  'Jasmine Midcap Fund', 'Mosaic Small Cap Fund', 'Oakleaf Tax Saver Fund', 'Marigold Gold Fund',
];

const POPULAR_FOR_SIPS = [
  'Kestrel Nifty 50 Index Fund', 'Banyan Flexi Cap Fund', 'Saal Top 100 Fund', 'Sparrow Mid Cap Fund',
  'Hummingbird Small Cap Fund', 'Teak Balanced Advantage Fund', 'Lotus ELSS Tax Saver Fund', 'Cedar Large & Mid Cap Fund',
];

export type CollectionIcon = 'trendUp' | 'sipStar' | 'gold' | 'largeCap' | 'midCap' | 'smallCap' | 'index' | 'elss';

/** Explore's collections: each opens a list of 6-8 made-up funds. */
export const COLLECTIONS: { key: string; label: string; icon: CollectionIcon; about: string; pick: (all: FundRow[]) => FundRow[] }[] = [
  {
    key: 'high-return',
    label: 'Highest 3Y return (demo)',
    icon: 'trendUp',
    about: "The 8 made-up funds with the highest 3-year return in this demo. Past returns don't guarantee future returns.",
    pick: (all) => all.filter((f) => return3y(f) !== null).sort((a, b) => return3y(b)! - return3y(a)!).slice(0, 8),
  },
  {
    key: 'popular-sip',
    label: 'Popular for SIPs',
    icon: 'sipStar',
    about: 'Made-up funds that demo investors often start SIPs in. Popular is not the same as right for you.',
    pick: (all) => POPULAR_FOR_SIPS.flatMap((name) => all.filter((f) => f.name === name)),
  },
  { key: 'gold-silver', label: 'Gold & Silver', icon: 'gold', about: 'Made-up funds that follow gold and silver prices.', pick: bySub('Gold', 'Silver') },
  { key: 'large-cap', label: 'Large cap', icon: 'largeCap', about: 'Made-up funds that invest mostly in the biggest companies.', pick: bySub('Large cap') },
  { key: 'mid-cap', label: 'Mid cap', icon: 'midCap', about: 'Made-up funds that invest mostly in mid-sized companies.', pick: bySub('Mid cap') },
  {
    key: 'small-cap',
    label: 'Small cap',
    icon: 'smallCap',
    about: 'Made-up funds that invest mostly in smaller companies. They tend to swing the most.',
    pick: bySub('Small cap'),
  },
  { key: 'index', label: 'Index funds', icon: 'index', about: 'Made-up funds that copy a market index instead of picking companies.', pick: bySub('Index') },
  { key: 'elss', label: 'Tax saver (ELSS)', icon: 'elss', about: 'Made-up tax-saving funds with a 3-year lock-in.', pick: bySub('ELSS') },
];

function bySub(...subs: string[]) {
  return (all: FundRow[]) => all.filter((f) => subs.includes(f.sub_category)).sort((a, b) => b.aum_cr - a.aum_cr);
}

/** Mutual Funds -> Explore, left column: Popular funds, Collections and the new fund offers. */
export async function exploreFunds(db: Db, investorId: string) {
  const all = await funds(db, investorId);
  return {
    popular: POPULAR.flatMap((name) => all.filter((f) => f.name === name).map(card)),
    collections: COLLECTIONS.map(({ key, label, icon }) => ({ key, label, icon, href: `/collections/${key}` })),
    nfos: loadMarket().nfos.map((n) => ({
      name: n.name,
      initials: initials(n.name),
      category: n.category,
      closes: n.closes_in_days === 1 ? 'Closes tomorrow' : `Closes in ${n.closes_in_days} days`,
      minAmount: `Min. ${inr(n.min_amount)}`,
    })),
  };
}

/** One collection's funds; null for an unknown key. */
export async function collection(db: Db, investorId: string, key: string) {
  const found = COLLECTIONS.find((c) => c.key === key);
  if (!found) return null;
  return { label: found.label, about: found.about, funds: found.pick(await funds(db, investorId)).map(card) };
}

/** All mutual funds: category chips, a risk filter and the list (spec §8). */
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
      .map((f) => ({ ...card(f), category: f.category, risk: f.risk_level, minSip: `Min SIP ${inr(f.min_sip)}`, nav: nav(f.nav) })),
  };
}

/** The fund page: facts, the NAV chart, the return calculator's rate and the order card. Null for a fund that does not exist. */
export async function fundPage(db: Db, investorId: string, fundId: number, today: string) {
  if (!Number.isInteger(fundId)) return null;
  const fund = (await funds(db, investorId)).find((f) => f.id === fundId);
  if (!fund) return null;
  const [history, balance, tipDone, choices, watching] = await Promise.all([
    db.query<{ d: string; nav: string }>('SELECT nav_date::text AS d, nav::text FROM visible_nav_history($1) WHERE fund_id = $2 ORDER BY nav_date', [
      investorId,
      fundId,
    ]),
    demoBalance(db, investorId),
    tooltipDismissed(db, investorId),
    goalChoices(db, investorId),
    db.query('SELECT 1 FROM fund_watchlist WHERE investor_id = $1 AND fund_id = $2', [investorId, fundId]),
  ]);
  const rate = return3y(fund);
  return {
    id: fund.id,
    name: fund.name,
    initials: initials(fund.name),
    chips: [fund.category, fund.sub_category, `${fund.risk_level} risk`].filter((c, i, all) => all.indexOf(c) === i),
    nav: nav(fund.nav),
    navDate: `NAV on ${dayMonthYear(fund.nav_date)}`,
    stats: [
      { label: 'NAV', value: nav(fund.nav), note: dayMonthYear(fund.nav_date) },
      { label: 'Min. for SIP', value: inr(fund.min_sip) },
      { label: 'Fund size', value: `₹${WHOLE.format(fund.aum_cr)} Cr` },
      { label: 'Expense ratio', value: `${Number(fund.expense_ratio).toFixed(2)}%` },
      { label: 'Rating', value: `${fund.rating} of 5`, stars: fund.rating },
    ],
    facts: [
      { label: 'Category', value: fund.sub_category === fund.category ? fund.category : `${fund.category} · ${fund.sub_category}` },
      { label: 'Risk', value: fund.risk_level },
      { label: 'Minimum SIP', value: inr(fund.min_sip) },
      { label: 'Exit load', value: fund.exit_load_text },
      { label: 'Expense ratio', value: `${Number(fund.expense_ratio).toFixed(2)}%` },
    ],
    /** [date, NAV] from the oldest: weekly before the last 30 months, then daily, then any demo market-fall days. */
    chart: history.rows.map((r) => [r.d, Number(r.nav)] as [string, number]),
    /** The demo 3Y return a year at a time, for the return calculator: 0.142 is 14.2%. */
    rate3y: rate === null ? null : Math.round(rate * 10_000) / 10_000,
    rate3yText: rate === null ? null : percent(rate * 100, true),
    /** In Mutual Funds -> Watchlist. */
    watched: watching.rows.length > 0,
    box: {
      minAmount: fund.min_sip,
      maxAmount: MAX_AMOUNT,
      amountRange: `From ${inr(fund.min_sip)} to ${inr(MAX_AMOUNT)}`,
      defaultAmount: Math.max(DEFAULT_AMOUNT, fund.min_sip),
      quickAdd: QUICK_ADD.map((value) => ({ value, label: `+${inr(value)}` })),
      days: Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `Monthly on ${ordinal(i + 1)}` })),
      defaultDay: Math.min(Number(today.slice(8, 10)), 28),
      mandate: DEMO_MANDATE,
      balance: `Pay from demo balance · ${inr(balance)}`,
      goalStep: goalStepOptions(today, choices),
      /** The one-time "New: tell us what this SIP is for" tooltip, until the investor closes it. */
      showGoalTip: !tipDone,
    },
  };
}

/** Mutual Funds -> Watchlist: the funds the investor added from a fund page, the latest first. */
export async function watchedFunds(db: Db, investorId: string): Promise<FundCard[]> {
  const [all, watched] = await Promise.all([
    funds(db, investorId),
    db.query<{ fund_id: number }>('SELECT fund_id FROM fund_watchlist WHERE investor_id = $1 ORDER BY created_at DESC, fund_id', [investorId]),
  ]);
  return watched.rows.flatMap((w) => all.filter((f) => f.id === w.fund_id).map(card));
}

/** POST /api/watchlist {fundId, watch}: adds the fund to the watchlist (watch: true) or takes it off. */
export async function setWatch(
  db: Db,
  investorId: string,
  input: unknown,
): Promise<{ status: 200; watched: boolean } | { status: 400 | 404; error: string }> {
  const body = (input ?? {}) as { fundId?: unknown; watch?: unknown };
  if (typeof body.watch !== 'boolean') return { status: 400, error: 'Say whether to add the fund or take it off.' };
  const [fund] = (await db.query<{ id: number }>('SELECT id FROM funds WHERE id = $1', [Number.isInteger(body.fundId) ? body.fundId : 0])).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  if (body.watch) await db.query('INSERT INTO fund_watchlist (investor_id, fund_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [investorId, fund.id]);
  else await db.query('DELETE FROM fund_watchlist WHERE investor_id = $1 AND fund_id = $2', [investorId, fund.id]);
  return { status: 200, watched: body.watch };
}

/**
 * What the goal step offers: the 8 chips, the name limit, the years for "By when?", the target amount range, and
 * for a one-time investment the investor's own goals to add the money to.
 */
export function goalStepOptions(today: string, existing: { id: number; label: string }[] = []) {
  const year = Number(today.slice(0, 4));
  return {
    kinds: goalOptions(today, null).kinds,
    nameMax: GOAL_NAME_MAX,
    years: Array.from({ length: 51 }, (_, i) => String(year + i)),
    targetMin: TARGET_MIN,
    targetMax: TARGET_MAX,
    existing,
    firstMonth: addMonths(`${today.slice(0, 7)}-01`, 1).slice(0, 7),
  };
}

/**
 * POST /api/invest {fundId, amount, goal?, cartItemId?}: a one-time investment at the latest NAV this visitor sees,
 * paid from the demo balance. The goal is one of the investor's goals ({goalId}) or a new one from the goal step.
 */
export async function investOnce(
  db: Db,
  investorId: string,
  input: unknown,
  today: string,
): Promise<{ status: 200; message: string } | { status: 400 | 404; error: string }> {
  const body = (input ?? {}) as { fundId?: unknown; amount?: unknown; cartItemId?: unknown; goal?: unknown };
  const [fund] = (
    await db.query<{ id: number; name: string; min_sip: number; nav: string }>(
      `SELECT f.id, f.name, f.min_sip, (SELECT nav::text FROM visible_nav_history($2) WHERE fund_id = f.id ORDER BY nav_date DESC LIMIT 1) AS nav
       FROM funds f WHERE f.id = $1`,
      [Number.isInteger(body.fundId) ? body.fundId : 0, investorId],
    )
  ).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  const amount = body.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < fund.min_sip || amount > MAX_AMOUNT) {
    return { status: 400, error: `Enter a whole amount from ${inr(fund.min_sip)} to ${inr(MAX_AMOUNT)}.` };
  }
  const goal = await oneTimeGoal(db, investorId, body.goal, today);
  if (!goal.ok) return { status: 400, error: goal.error };
  const balance = await demoBalance(db, investorId);
  if (amount > balance) return { status: 400, error: `That is more than your demo balance of ${inr(balance)}.` };
  const units = Math.round((amount / Number(fund.nav)) * 10_000) / 10_000;
  await db.transaction(async (tx) => {
    const goalId = goal.goalId ?? (goal.create ? await insertGoal(tx, investorId, goal.create) : null);
    await tx.query('INSERT INTO lumpsums (investor_id, fund_id, goal_id, amount, nav, units) VALUES ($1, $2, $3, $4, $5, $6)', [
      investorId,
      fund.id,
      goalId,
      amount,
      fund.nav,
      units,
    ]);
    if (Number.isInteger(body.cartItemId)) {
      await tx.query('UPDATE cart_items SET removed_at = now() WHERE id = $1 AND investor_id = $2 AND removed_at IS NULL', [body.cartItemId, investorId]);
    }
  });
  const forGoal = goal.name ? ` for ${goal.name}` : '';
  return { status: 200, message: `${inr(amount)} invested in ${fund.name}${forGoal} at ${nav(fund.nav)} a unit. Demo order, no real money.` };
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

/**
 * POST /api/sips {fundId, amount, frequency, day, goal?, goalStep?, source?, cartItemId?}: start a monthly SIP
 * from today (PRD F2, brief phase 4). The first instalment is paid at once from the demo balance at the latest
 * NAV this visitor sees, as the SIP's first due date, so a market fall shows a dip straight away. Logs
 * sip_started, and goal_saved or goal_skipped. A demo order: no real money moves.
 */
export async function startSip(db: Db, investorId: string, input: unknown, today: string): Promise<{ status: 200; id: number } | { status: 400 | 404; error: string }> {
  const body = (input ?? {}) as { fundId?: unknown; amount?: unknown; frequency?: unknown; day?: unknown; goal?: unknown; goalStep?: unknown; source?: unknown; cartItemId?: unknown };
  const [fund] = (
    await db.query<{ id: number; min_sip: number; nav: string }>(
      `SELECT f.id, f.min_sip, (SELECT nav::text FROM visible_nav_history($2) WHERE fund_id = f.id ORDER BY nav_date DESC LIMIT 1) AS nav
       FROM funds f WHERE f.id = $1`,
      [Number.isInteger(body.fundId) ? body.fundId : 0, investorId],
    )
  ).rows;
  if (!fund) return { status: 404, error: 'We could not find that fund.' };
  if (body.frequency !== undefined && body.frequency !== 'monthly') return { status: 400, error: 'Only monthly SIPs are in this prototype.' };
  const checked = checkSip(body.amount, body.day, fund.min_sip);
  if (checked) return checked;
  const amount = body.amount as number;
  const day = body.day as number;
  const firstDue = firstDueDate(today, day);
  const parsed = parseGoal(body.goal, { today, firstDue });
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const { goal } = parsed;
  const balance = await demoBalance(db, investorId);
  if (amount > balance) return { status: 400, error: `The first instalment of ${inr(amount)} is more than your demo balance of ${inr(balance)}.` };
  const source = body.source === 'cart' ? 'cart' : 'fund_page';

  const id = await db.transaction(async (tx) => {
    const goalId = goal ? await insertGoal(tx, investorId, goal) : null;
    const { rows } = await tx.query<{ id: number }>(
      'INSERT INTO sips (investor_id, fund_id, goal_id, amount, day_of_month, started_on) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [investorId, fund.id, goalId, amount, day, today],
    );
    const sipId = rows[0].id;
    await tx.query('INSERT INTO instalments (sip_id, due_on, paid_on, amount, nav, units) VALUES ($1, $2, $3, $4, $5, $6)', [
      sipId,
      firstDue,
      today,
      amount,
      fund.nav,
      Math.round((amount / Number(fund.nav)) * 10_000) / 10_000,
    ]);
    if (Number.isInteger(body.cartItemId)) {
      await tx.query('UPDATE cart_items SET removed_at = now() WHERE id = $1 AND investor_id = $2 AND removed_at IS NULL', [body.cartItemId, investorId]);
    }
    await logEvent(tx, investorId, 'sip_started', { sip_id: sipId, fund_id: fund.id, with_goal: goal !== null, source });
    if (goal) await logEvent(tx, investorId, 'goal_saved', { sip_id: sipId, where: 'start', kind: goal.kind });
    else if (body.goalStep === 'skipped') await logEvent(tx, investorId, 'goal_skipped', { sip_id: sipId });
    return sipId;
  });
  return { status: 200, id };
}

export function checkSip(amount: unknown, day: unknown, minSip: number): { status: 400; error: string } | null {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < minSip || amount > MAX_AMOUNT) {
    return { status: 400, error: `Enter a whole amount from ${inr(minSip)} to ${inr(MAX_AMOUNT)}.` };
  }
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 28) return { status: 400, error: 'Pick a date from the 1st to the 28th.' };
  return null;
}
