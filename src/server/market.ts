// The market strip under the header (layout reference). Every number is made up and
// computed from this visitor's demo fund NAVs: each index is a fixed level that moves with one demo fund,
// so "Simulate a market fall" moves the strip, the fund cards and the goal cards together. Never live data.
import type { Db } from '../db/client';
import { dayMonthYear } from '../pipeline/chunking/format';

/** Made-up levels on the seed day; each follows the NAV of a demo fund from the same corner of the market. */
const INDICES = [
  { name: 'NIFTY 50', fund: 'Kestrel Nifty 50 Index Fund', level: 24_800 },
  { name: 'SENSEX', fund: 'Cedar Large & Mid Cap Fund', level: 81_600 },
  { name: 'BANK NIFTY', fund: 'Banyan Flexi Cap Fund', level: 55_200 },
  { name: 'NIFTY MIDCAP', fund: 'Monsoon Midcap Fund', level: 57_300 },
  { name: 'FIN NIFTY', fund: 'Teak Balanced Advantage Fund', level: 26_100 },
  { name: 'NIFTY NEXT 50', fund: 'Lotus ELSS Tax Saver Fund', level: 68_400 },
  { name: 'NIFTY SMALLCAP', fund: 'Sundar Small Cap Fund', level: 17_900 },
  { name: 'NIFTY IT', fund: 'Banyan Flexi Cap Fund', level: 37_200 },
];

const TWO = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface FundMove {
  id: number;
  name: string;
  category: string;
  risk_level: string;
  latest: string;
  prev: string | null;
  /** The latest shared NAV, before any demo fall: the index levels are pinned to it. */
  base: string;
  as_of: string;
}

/** Each fund's latest and previous NAV this visitor sees (demo falls included); null is a signed-out visitor. */
async function fundMoves(db: Db, investorId: string | null): Promise<FundMove[]> {
  return (
    await db.query<FundMove>(
      `WITH v AS (
         SELECT fund_id, nav, nav_date, row_number() OVER (PARTITION BY fund_id ORDER BY nav_date DESC) AS rn
         FROM visible_nav_history($1)
       ), base AS (
         SELECT DISTINCT ON (fund_id) fund_id, nav FROM nav_history ORDER BY fund_id, nav_date DESC
       )
       SELECT f.id, f.name, f.category, f.risk_level,
         max(v.nav) FILTER (WHERE v.rn = 1)::text AS latest, max(v.nav) FILTER (WHERE v.rn = 2)::text AS prev,
         b.nav::text AS base, max(v.nav_date) FILTER (WHERE v.rn = 1)::text AS as_of
       FROM funds f JOIN v ON v.fund_id = f.id AND v.rn <= 2 JOIN base b ON b.fund_id = f.id
       GROUP BY f.id, b.nav ORDER BY f.id`,
      [investorId],
    )
  ).rows;
}

/** '-50.90 (0.22%)' or '+292.50 (0.54%)': the points always signed, the percent in brackets. */
export function dayChange(now: number, before: number | null): string | null {
  if (before === null || before === 0) return null;
  const points = Math.round((now - before) * 100) / 100 + 0;
  const sign = points > 0 ? '+' : points < 0 ? '-' : '';
  return `${sign}${TWO.format(Math.abs(points))} (${TWO.format(Math.abs((now - before) / before) * 100)}%)`;
}

export interface MarketStrip {
  indices: { name: string; value: string; change: string | null }[];
  /** 'Numbers as of 28 Oct 2026 · Includes 1 simulated market fall · Demo data' */
  note: string;
}

export async function marketStrip(db: Db, investorId: string | null): Promise<MarketStrip> {
  const moves = await fundMoves(db, investorId);
  const [demo] = (
    await db.query<{ days: number }>('SELECT count(DISTINCT nav_date)::int AS days FROM demo_nav_history WHERE investor_id = $1', [investorId])
  ).rows;
  const asOf = moves.reduce((latest, m) => (m.as_of > latest ? m.as_of : latest), '');
  return {
    indices: INDICES.flatMap((index) => {
      const fund = moves.find((m) => m.name === index.fund);
      if (!fund) return [];
      const scale = index.level / Number(fund.base);
      const now = Number(fund.latest) * scale;
      return [{ name: index.name, value: TWO.format(now), change: dayChange(now, fund.prev === null ? null : Number(fund.prev) * scale) }];
    }),
    note: [
      asOf ? `Numbers as of ${dayMonthYear(asOf)}` : null,
      demo.days > 0 ? `Includes ${demo.days} simulated market ${demo.days === 1 ? 'fall' : 'falls'}` : null,
      'Demo data',
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
