import fs from 'node:fs';
import path from 'node:path';
import type { WalkSpec } from './walk';

export const DATA_DIR = path.join(process.cwd(), 'data');

export const PERSONA_KEYS = ['riya', 'arjun', 'meera', 'kabir', 'sana', 'vikram', 'dev'] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

const GOAL_KINDS = ['home', 'education', 'retirement', 'emergency', 'custom'] as const;
const ASSET_KINDS = ['stock', 'etf', 'us_stock', 'gold', 'silver', 'bond'] as const;
const IPO_STATUSES = ['open', 'upcoming', 'closed'] as const;

/** Months of daily NAVs and of daily asset prices that the seed generates. */
export const NAV_MONTHS = 30;
export const PRICE_MONTHS = 12;

export interface FundSeed {
  id: number;
  name: string;
  category: string;
  risk_level: string;
  min_sip: number;
  exit_load_text: string;
  expense_ratio: number;
  walk: WalkSpec;
}

export interface AssetSeed {
  id: number;
  kind: (typeof ASSET_KINDS)[number];
  name: string;
  symbol: string;
  sector: string | null;
  extra: Record<string, unknown>;
  walk: WalkSpec;
}

export interface IpoSeed {
  id: number;
  name: string;
  status: (typeof IPO_STATUSES)[number];
  price_band: string;
  lot_size: number;
  opens_in_days: number;
  closes_in_days: number;
}

export interface Market {
  funds: FundSeed[];
  assets: AssetSeed[];
  ipos: IpoSeed[];
}

export interface GoalSeed {
  ref: string;
  kind: (typeof GOAL_KINDS)[number];
  name: string;
  /** 'YYYY-MM' */
  target_month?: string;
  /** Target month = the SIP's first instalment month + (instalments - 1). */
  target_from_sip?: { sip: string; instalments: number };
}

export interface SipSeed {
  ref: string;
  fund: string;
  amount: number;
  day_of_month: number;
  started_months_ago: number;
  goal?: string;
  /** 1-based positions of instalments that were skipped instead of paid. */
  skipped_instalments?: number[];
  /** The SIP was stopped this many months ago: no instalments after that, units still held. */
  stopped_months_ago?: number;
}

export interface PersonaSeed {
  key: PersonaKey;
  display_name: string;
  /** The situation the welcome screen's persona card describes. */
  about: string;
  mandates: { bank_label: string; method: 'UPI' | 'NACH' }[];
  goals: GoalSeed[];
  sips: SipSeed[];
  demo_orders: { symbol: string; side: 'buy' | 'sell'; qty: number; days_ago: number }[];
  watchlist: string[];
}

export class DataError extends Error {}

export function check(condition: unknown, file: string, message: string): asserts condition {
  if (!condition) throw new DataError(`${file}: ${message}`);
}

export function readDataFile(relativePath: string): string {
  return fs.readFileSync(path.join(DATA_DIR, relativePath), 'utf8');
}

function readJson(relativePath: string): any {
  try {
    return JSON.parse(readDataFile(relativePath));
  } catch (err) {
    throw new DataError(`${relativePath}: ${(err as Error).message}`);
  }
}

export function loadMarket(): Market {
  const fundsFile = 'raw/market/funds.json';
  const funds: FundSeed[] = readJson(fundsFile).funds;
  check(Array.isArray(funds) && funds.length > 0, fundsFile, 'needs a non-empty "funds" list');
  for (const f of funds) {
    const where = `fund ${f.id ?? '?'}`;
    check(isPositiveInt(f.id), fundsFile, `${where}: id must be a positive integer`);
    check(isText(f.name) && isText(f.category) && isText(f.risk_level), fundsFile, `${where}: name, category and risk_level are required`);
    check(isPositiveInt(f.min_sip), fundsFile, `${where}: min_sip must be a positive integer`);
    check(isText(f.exit_load_text), fundsFile, `${where}: exit_load_text is required`);
    check(typeof f.expense_ratio === 'number' && f.expense_ratio >= 0 && f.expense_ratio < 100, fundsFile, `${where}: expense_ratio out of range`);
    checkWalk(f.walk, fundsFile, where, true);
  }
  checkUnique(funds.map((f) => f.id), fundsFile, 'fund id');
  checkUnique(funds.map((f) => f.name), fundsFile, 'fund name');

  const assetsFile = 'raw/market/assets.json';
  const assets: AssetSeed[] = readJson(assetsFile).assets;
  check(Array.isArray(assets), assetsFile, 'needs an "assets" list');
  for (const a of assets) {
    const where = `asset ${a.id ?? '?'}`;
    check(isPositiveInt(a.id), assetsFile, `${where}: id must be a positive integer`);
    check(ASSET_KINDS.includes(a.kind), assetsFile, `${where}: kind must be one of ${ASSET_KINDS.join(', ')}`);
    check(isText(a.name) && isText(a.symbol), assetsFile, `${where}: name and symbol are required`);
    check(a.sector === null || isText(a.sector), assetsFile, `${where}: sector must be text or null`);
    check(isPlainObject(a.extra), assetsFile, `${where}: extra must be an object`);
    checkWalk(a.walk, assetsFile, where, false);
  }
  checkUnique(assets.map((a) => a.id), assetsFile, 'asset id');
  checkUnique(assets.map((a) => a.name), assetsFile, 'asset name');
  checkUnique(assets.map((a) => a.symbol), assetsFile, 'asset symbol');

  const iposFile = 'raw/market/ipos.json';
  const ipos: IpoSeed[] = readJson(iposFile).ipos;
  check(Array.isArray(ipos), iposFile, 'needs an "ipos" list');
  for (const ipo of ipos) {
    const where = `ipo ${ipo.id ?? '?'}`;
    check(isPositiveInt(ipo.id), iposFile, `${where}: id must be a positive integer`);
    check(isText(ipo.name) && isText(ipo.price_band), iposFile, `${where}: name and price_band are required`);
    check(IPO_STATUSES.includes(ipo.status), iposFile, `${where}: status must be one of ${IPO_STATUSES.join(', ')}`);
    check(isPositiveInt(ipo.lot_size), iposFile, `${where}: lot_size must be a positive integer`);
    check(Number.isInteger(ipo.opens_in_days) && Number.isInteger(ipo.closes_in_days), iposFile, `${where}: opens_in_days and closes_in_days must be whole days`);
    check(ipo.opens_in_days <= ipo.closes_in_days, iposFile, `${where}: closes before it opens`);
  }
  checkUnique(ipos.map((i) => i.id), iposFile, 'ipo id');

  return { funds, assets, ipos };
}

export function loadPersonas(market: Market): PersonaSeed[] {
  return PERSONA_KEYS.map((key) => {
    const file = `raw/personas/${key}.json`;
    const p = readJson(file);
    check(p.key === key, file, `key must be "${key}"`);
    check(isText(p.display_name), file, 'display_name is required');
    check(isText(p.about), file, 'about is required');

    const persona: PersonaSeed = {
      key,
      display_name: p.display_name,
      about: p.about,
      mandates: p.mandates ?? [],
      goals: p.goals ?? [],
      sips: p.sips ?? [],
      demo_orders: p.demo_orders ?? [],
      watchlist: p.watchlist ?? [],
    };

    for (const m of persona.mandates) {
      check(isText(m.bank_label), file, 'every mandate needs a bank_label');
      check(m.method === 'UPI' || m.method === 'NACH', file, 'mandate method must be UPI or NACH');
    }

    const sipRefs = new Set(persona.sips.map((s) => s.ref));
    for (const g of persona.goals) {
      const where = `goal "${g.ref}"`;
      check(isText(g.ref), file, 'every goal needs a ref');
      check(GOAL_KINDS.includes(g.kind), file, `${where}: kind must be one of ${GOAL_KINDS.join(', ')}`);
      check(isText(g.name) && g.name.length <= 40, file, `${where}: name must be 1-40 characters`);
      check(!(g.target_month && g.target_from_sip), file, `${where}: give target_month or target_from_sip, not both`);
      if (g.target_month !== undefined) {
        check(/^\d{4}-(0[1-9]|1[0-2])$/.test(g.target_month), file, `${where}: target_month must look like 2030-12`);
      }
      if (g.target_from_sip !== undefined) {
        check(sipRefs.has(g.target_from_sip.sip), file, `${where}: target_from_sip names an unknown SIP`);
        check(isPositiveInt(g.target_from_sip.instalments), file, `${where}: instalments must be a positive integer`);
      }
    }
    checkUnique(persona.goals.map((g) => g.ref), file, 'goal ref');

    const goalRefs = new Set(persona.goals.map((g) => g.ref));
    for (const s of persona.sips) {
      const where = `SIP "${s.ref}"`;
      const fund = market.funds.find((f) => f.name === s.fund);
      check(isText(s.ref), file, 'every SIP needs a ref');
      check(fund, file, `${where}: unknown fund "${s.fund}"`);
      check(isPositiveInt(s.amount) && s.amount >= fund.min_sip, file, `${where}: amount must be a whole number of at least ${fund.min_sip}`);
      check(Number.isInteger(s.day_of_month) && s.day_of_month >= 1 && s.day_of_month <= 28, file, `${where}: day_of_month must be 1-28`);
      check(Number.isInteger(s.started_months_ago) && s.started_months_ago >= 0 && s.started_months_ago < NAV_MONTHS, file, `${where}: started_months_ago must be 0-${NAV_MONTHS - 1} (NAV history covers ${NAV_MONTHS} months)`);
      check(s.goal === undefined || goalRefs.has(s.goal), file, `${where}: unknown goal "${s.goal}"`);
      if (s.stopped_months_ago !== undefined) {
        check(Number.isInteger(s.stopped_months_ago) && s.stopped_months_ago >= 0 && s.stopped_months_ago < s.started_months_ago, file, `${where}: stopped_months_ago must be 0-${s.started_months_ago - 1}`);
      }
      for (const n of s.skipped_instalments ?? []) {
        check(Number.isInteger(n) && n >= 1 && n <= s.started_months_ago, file, `${where}: skipped instalment ${n} is outside 1-${s.started_months_ago}`);
      }
    }
    checkUnique(persona.sips.map((s) => s.ref), file, 'SIP ref');

    for (const o of persona.demo_orders) {
      check(market.assets.some((a) => a.symbol === o.symbol), file, `demo order: unknown symbol "${o.symbol}"`);
      check(o.side === 'buy' || o.side === 'sell', file, 'demo order side must be buy or sell');
      check(typeof o.qty === 'number' && o.qty > 0, file, 'demo order qty must be positive');
      check(Number.isInteger(o.days_ago) && o.days_ago >= 0 && o.days_ago < 365, file, `demo order days_ago must be 0-364 (prices cover ${PRICE_MONTHS} months)`);
    }
    for (const symbol of persona.watchlist) {
      check(market.assets.some((a) => a.symbol === symbol), file, `watchlist: unknown symbol "${symbol}"`);
    }
    checkUnique(persona.watchlist, file, 'watchlist symbol');

    return persona;
  });
}

function checkWalk(walk: WalkSpec, file: string, where: string, allowFall: boolean): void {
  check(isPlainObject(walk), file, `${where}: walk is required`);
  check(typeof walk.start === 'number' && walk.start > 0, file, `${where}: walk.start must be positive`);
  check(typeof walk.drift === 'number' && typeof walk.vol === 'number' && walk.vol >= 0, file, `${where}: walk needs drift and a non-negative vol`);
  if (walk.end_fall == null) return;
  check(allowFall, file, `${where}: end_fall applies to funds only`);
  check(Array.isArray(walk.end_fall) && walk.end_fall.length === 2, file, `${where}: end_fall must be [low, high]`);
  const [low, high] = walk.end_fall;
  check(low > 0 && low <= high && high < 1, file, `${where}: end_fall must satisfy 0 < low <= high < 1`);
}

function checkUnique(values: unknown[], file: string, what: string): void {
  const seen = new Set<unknown>();
  for (const v of values) {
    check(!seen.has(v), file, `duplicate ${what} ${JSON.stringify(v)}`);
    seen.add(v);
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
