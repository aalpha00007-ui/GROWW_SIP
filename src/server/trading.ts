// Stocks and F&O (brief phase 5): display-only pages. Stock prices are the made-up stocks' demo prices in
// asset_prices; bonds, sample holdings, positions, orders and F&O contracts come from raw/market/trading.json.
// Candles come from a fixed seed, so they look the same on every load. Nothing here can be bought or sold.
// The sample trades and watchlist belong to the demo personas only: a new demo account starts empty.
import type { Db } from '../db/client';
import { dayMonthYear, monthsBetween, monthYear } from '../pipeline/chunking/format';
import { addDays } from '../pipeline/loading/dates';
import { loadMarket, loadTrading } from '../pipeline/loading/raw';
import { mulberry32 } from '../pipeline/loading/walk';
import { initials } from './funds';
import { dayChange } from './market';
import { inr, signedInr } from './money';

const TWO = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (value: number) => `₹${TWO.format(value)}`;
/** Seeds for the candles: one per contract, so each chart keeps its shape. */
const CANDLE_SEED = 20261030;
const CANDLES = 24;

interface Quote {
  symbol: string;
  name: string;
  kind: string;
  now: number;
  prev: number | null;
}

/** The latest and previous demo price of every made-up stock and ETF. */
async function quotes(db: Db): Promise<Map<string, Quote>> {
  const { rows } = await db.query<{ symbol: string; name: string; kind: string; now: string; prev: string | null }>(
    `SELECT a.symbol, a.name, a.kind,
       max(p.price) FILTER (WHERE p.rn = 1)::text AS now, max(p.price) FILTER (WHERE p.rn = 2)::text AS prev
     FROM assets a JOIN (
       SELECT asset_id, price, row_number() OVER (PARTITION BY asset_id ORDER BY price_date DESC) AS rn FROM asset_prices
     ) p ON p.asset_id = a.id AND p.rn <= 2
     WHERE a.kind IN ('stock', 'etf') GROUP BY a.id ORDER BY a.id`,
  );
  return new Map(rows.map((r) => [r.symbol, { symbol: r.symbol, name: r.name, kind: r.kind, now: Number(r.now), prev: r.prev === null ? null : Number(r.prev) }]));
}

/** '+₹1,240 (+8.7%)' for a gain of 1,240 on 14,250. */
function pnl(gain: number, base: number): string {
  const pct = base > 0 ? (gain / base) * 100 : 0;
  const rounded = Math.round(pct * 100) / 100 + 0;
  return `${signedInr(gain)} (${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%)`;
}

/** Bond ratings as a dot and a label: green for the safest, amber, then red. */
function ratingLevel(rating: string): 'high' | 'mid' | 'low' {
  if (rating === 'AAA' || rating === 'AA+') return 'high';
  if (rating.startsWith('AA')) return 'mid';
  return 'low';
}

/** Stocks -> Explore: 8 popular made-up stocks, 8 made-up bonds, and the counts for Products & Tools. */
export async function stocksExplore(db: Db, today: string) {
  const [q, ipos] = await Promise.all([quotes(db), db.query<{ n: number }>("SELECT count(*)::int AS n FROM ipos WHERE status = 'open'")]);
  const trading = loadTrading(loadMarket());
  return {
    popular: [...q.values()]
      .filter((s) => s.kind === 'stock')
      .map((s) => ({ symbol: s.symbol, name: s.name, initials: initials(s.name), price: price(s.now), change: dayChange(s.now, s.prev) })),
    bonds: trading.bonds.map((b) => {
      const months = monthsBetween(today, `${b.maturity}-01`);
      return {
        name: b.name,
        maturity: `Matures ${monthYear(`${b.maturity}-01`)}`,
        yield: `${b.yield_pct.toFixed(2)}%`,
        months: `${months} months`,
        rating: b.rating,
        level: ratingLevel(b.rating),
      };
    }),
    openIpos: ipos.rows[0].n,
    openBonds: trading.bonds.length,
  };
}

/**
 * Whose Holdings, Positions, Orders and Watchlist show the sample rows: a demo persona (Riya, Arjun...) is a
 * made-up person with a history, so the samples stand in for it. A new demo account (it has a username) starts
 * with none: it never traded or added a stock to watch.
 */
export const showsSampleRows = (visitor: { username: string | null }) => visitor.username === null;

/** Stocks -> Holdings, Positions, Orders and Watchlist, priced from the demo prices. Without `samples`, all empty. */
export async function stockTables(db: Db, today: string, samples: boolean) {
  if (!samples) return { holdings: [], positions: [], orders: [], watchlist: [] };
  const q = await quotes(db);
  const t = loadTrading(loadMarket());
  const quote = (symbol: string) => q.get(symbol)!;
  return {
    holdings: t.stock_holdings.map((h) => {
      const s = quote(h.symbol);
      const avg = s.now * h.vs_now;
      return { name: s.name, symbol: s.symbol, qty: String(h.qty), avg: price(avg), ltp: price(s.now), value: inr(h.qty * s.now), pnl: pnl(h.qty * (s.now - avg), h.qty * avg) };
    }),
    positions: t.stock_positions.map((p) => {
      const s = quote(p.symbol);
      const avg = s.now * p.vs_now;
      const gain = (p.side === 'buy' ? s.now - avg : avg - s.now) * p.qty;
      return { name: s.name, symbol: s.symbol, side: p.side === 'buy' ? 'Buy' : 'Sell', qty: String(p.qty), avg: price(avg), ltp: price(s.now), pnl: pnl(gain, p.qty * avg) };
    }),
    orders: t.stock_orders.map((o) => {
      const s = quote(o.symbol);
      return {
        date: dayMonthYear(addDays(today, -o.days_ago)),
        name: s.name,
        symbol: s.symbol,
        side: o.side === 'buy' ? 'Buy' : 'Sell',
        qty: String(o.qty),
        price: price(s.now * o.vs_now),
        status: o.status,
      };
    }),
    watchlist: t.stock_watchlist.map((symbol) => {
      const s = quote(symbol);
      return { name: s.name, symbol: s.symbol, kind: s.kind === 'etf' ? 'ETF' : 'Stock', price: price(s.now), change: dayChange(s.now, s.prev) };
    }),
  };
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

/** 24 daily candles from a fixed seed, scaled so the last close is the contract's listed price. */
function candles(start: number, vol: number, seed: number): Candle[] {
  const rng = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(rng() || Number.MIN_VALUE)) * Math.cos(2 * Math.PI * rng());
  const raw: Candle[] = [];
  let close = start;
  for (let i = 0; i < CANDLES; i++) {
    const o = close * (1 + (vol / 4) * normal());
    const c = o * (1 + vol * normal());
    const h = Math.max(o, c) * (1 + (vol / 2) * Math.abs(normal()));
    const l = Math.min(o, c) * (1 - (vol / 2) * Math.abs(normal()));
    raw.push({ o, h, l, c });
    close = c;
  }
  const scale = start / raw[raw.length - 1].c;
  const round = (v: number) => Math.round(v * scale * 100) / 100;
  return raw.map((k) => ({ o: round(k.o), h: round(k.h), l: round(k.l), c: round(k.c) }));
}

/** F&O -> Explore: top traded contracts with their candles, the F&O stocks, and the tools. */
export async function foExplore(db: Db) {
  const q = await quotes(db);
  const t = loadTrading(loadMarket());
  const contracts = (kind: 'equity' | 'commodities', offset: number) =>
    t.fo_top_traded[kind].map((c, i) => {
      const k = candles(c.price, c.vol, CANDLE_SEED + offset + i);
      const last = k[k.length - 1].c;
      return { name: c.name, candles: k, price: price(last), change: dayChange(last, k[k.length - 2].c) };
    });
  return {
    equity: contracts('equity', 0),
    commodities: contracts('commodities', 100),
    stocks: t.fo_stocks.map((f) => {
      const s = q.get(f.symbol)!;
      return { name: s.name, symbol: s.symbol, price: price(s.now), change: dayChange(s.now, s.prev), lot: `Lot ${f.lot_size}` };
    }),
  };
}

/** F&O -> Orders: sample orders, none of which became a position. Without `samples`, none. */
export function foOrders(today: string, samples: boolean) {
  const t = loadTrading(loadMarket());
  const all = [...t.fo_top_traded.equity, ...t.fo_top_traded.commodities];
  return (samples ? t.fo_orders : []).map((o) => ({
    date: dayMonthYear(addDays(today, -o.days_ago)),
    contract: o.contract,
    side: o.side === 'buy' ? 'Buy' : 'Sell',
    lots: o.lots === 1 ? '1 lot' : `${o.lots} lots`,
    price: price(all.find((c) => c.name === o.contract)!.price),
    status: o.status,
  }));
}
