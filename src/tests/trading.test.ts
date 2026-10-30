import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { loadMarket, loadTrading } from '../pipeline/loading/raw';
import { setupDatabase } from '../pipeline/loading/seed';
import { foExplore, foOrders, stocksExplore, stockTables } from '../server/trading';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('Stocks (display only)', () => {
  it('shows 8 made-up stocks with a price and day change, and 8 bonds with yield, months left and a rating', async () => {
    const data = await stocksExplore(db, TODAY);
    expect(data.popular).toHaveLength(8);
    expect(data.popular[0]).toMatchObject({ symbol: 'QUILL', name: 'Quillstone Software', initials: 'QS' });
    expect(data.popular.every((s) => /^₹[\d,]+\.\d\d$/.test(s.price) && /^[+-]?[\d,]+\.\d\d \([\d.]+%\)$/.test(s.change ?? ''))).toBe(true);
    expect(data.bonds).toHaveLength(8);
    expect(data.bonds[0]).toEqual({ name: 'Banyan Infra Bond', maturity: 'Matures Mar 2030', yield: '7.45%', months: '41 months', rating: 'AAA', level: 'high' });
    expect(data.bonds.map((b) => b.level)).toEqual(['high', 'high', 'high', 'high', 'mid', 'mid', 'low', 'low']);
    expect(data).toMatchObject({ openIpos: 1, openBonds: 8 });
  });

  it('prices the sample holdings, positions, orders and watchlist from the demo prices', async () => {
    const t = await stockTables(db, TODAY);
    for (const rows of [t.holdings, t.positions, t.orders, t.watchlist]) {
      expect(rows.length).toBeGreaterThanOrEqual(6);
      expect(rows.length).toBeLessThanOrEqual(8);
    }
    // Bought at 91% of today's price: up 9.89%. Bought at 106%: down 5.66%.
    expect(t.holdings[0].pnl).toMatch(/^\+₹[\d,]+ \(\+9\.89%\)$/);
    expect(t.holdings[1].pnl).toMatch(/^-₹[\d,]+ \(-5\.66%\)$/);
    // A short position gains when the price is below where it was sold.
    expect(t.positions.find((p) => p.symbol === 'TDWK')?.pnl.startsWith('+')).toBe(true);
    expect(t.orders[0]).toMatchObject({ date: '27 Oct 2026', side: 'Buy', status: 'Executed' });
    expect(t.watchlist.map((w) => w.kind)).toEqual(['Stock', 'Stock', 'Stock', 'Stock', 'ETF', 'ETF', 'ETF', 'ETF']);
  });
});

describe('F&O (display only)', () => {
  it('draws 6 equity and 6 commodity contracts with the same candles on every load, ending at the listed price', async () => {
    const first = await foExplore(db);
    const again = await foExplore(db);
    expect(again.equity).toEqual(first.equity);
    expect(first.equity).toHaveLength(6);
    expect(first.commodities).toHaveLength(6);
    for (const c of [...first.equity, ...first.commodities]) {
      expect(c.candles).toHaveLength(24);
      for (const k of c.candles) expect(k.l <= Math.min(k.o, k.c) && k.h >= Math.max(k.o, k.c)).toBe(true);
    }
    expect(first.equity[0]).toMatchObject({ name: 'Nifty 50 Futures', price: '₹24,850.00' });
    expect(first.commodities[0]).toMatchObject({ name: 'Gold Mini', price: '₹76,500.00' });
    expect(first.stocks).toHaveLength(8);
    expect(first.stocks[0]).toMatchObject({ symbol: 'QUILL', lot: 'Lot 175' });
  });

  it('lists 6 sample orders that never filled', () => {
    const orders = foOrders(TODAY);
    expect(orders).toHaveLength(6);
    expect(orders.every((o) => ['Cancelled', 'Rejected', 'Expired'].includes(o.status))).toBe(true);
    expect(orders[0]).toEqual({ date: '27 Oct 2026', contract: 'Nifty 50 Futures', side: 'Buy', lots: '1 lot', price: '₹24,850.00', status: 'Cancelled' });
  });

  it('checks trading.json: known symbols and 6-8 rows a list', () => {
    expect(() => loadTrading(loadMarket())).not.toThrow();
  });
});
