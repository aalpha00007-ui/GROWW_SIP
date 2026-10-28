// The market strip under the header and the Home fund rows (layout reference). Every number is made up and
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

const POPULAR = ['Kestrel Nifty 50 Index Fund', 'Banyan Flexi Cap Fund', 'Lotus ELSS Tax Saver Fund', 'Monsoon Midcap Fund'];

const CATEGORIES = [
  { category: 'Index', label: 'Index funds', icon: 'index' },
  { category: 'ELSS', label: 'Tax saver (ELSS)', icon: 'elss' },
  { category: 'Equity', label: 'Equity funds', icon: 'equity' },
  { category: 'Liquid', label: 'Liquid funds', icon: 'liquid' },
] as const;

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

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface HomeFunds {
  popular: { id: number; name: string; initials: string; nav: string; change: string | null }[];
  categories: { category: string; label: string; icon: (typeof CATEGORIES)[number]['icon']; count: string; risk: { label: string; level: RiskLevel }; href: string }[];
}

/** "Popular funds" and "Funds by category" on Home, from the made-up funds only. */
export async function homeFunds(db: Db, investorId: string): Promise<HomeFunds> {
  const moves = await fundMoves(db, investorId);
  return {
    popular: POPULAR.flatMap((name) => {
      const fund = moves.find((m) => m.name === name);
      if (!fund) return [];
      return [
        {
          id: fund.id,
          name: fund.name,
          initials: fund.name.split(' ').slice(0, 2).map((word) => word[0]).join(''),
          nav: `₹${TWO.format(Number(fund.latest))}`,
          change: dayChange(Number(fund.latest), fund.prev === null ? null : Number(fund.prev)),
        },
      ];
    }),
    categories: CATEGORIES.flatMap((c) => {
      const funds = moves.filter((m) => m.category === c.category);
      if (funds.length === 0) return [];
      const risk = funds[0].risk_level;
      return [
        {
          category: c.category,
          label: c.label,
          icon: c.icon,
          count: funds.length === 1 ? '1 fund' : `${funds.length} funds`,
          risk: { label: `${risk} risk`, level: riskLevel(risk) },
          href: `/explore?category=${encodeURIComponent(c.category)}`,
        },
      ];
    }),
  };
}

/** 'Low to Moderate' -> low, 'Moderately High' -> moderate, 'Very High' -> high. */
function riskLevel(label: string): RiskLevel {
  if (/^low/i.test(label)) return 'low';
  if (/^(very )?high$/i.test(label)) return 'high';
  return 'moderate';
}
