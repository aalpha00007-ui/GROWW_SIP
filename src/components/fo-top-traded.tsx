'use client';
// F&O -> Explore, "Top traded": chips Equity / Commodities, each with 6 cards (3 a row): a made-up contract,
// its candles, price and day change with sign and colour.
import { useState } from 'react';
import type { Candle } from '@/server/trading';
import { Signed } from './signed';
import { Candles } from './trading-ui';

interface Contract {
  name: string;
  candles: Candle[];
  price: string;
  change: string | null;
}

export function FoTopTraded({ equity, commodities }: { equity: Contract[]; commodities: Contract[] }) {
  const [kind, setKind] = useState<'equity' | 'commodities'>('equity');
  const shown = kind === 'equity' ? equity : commodities;
  return (
    <div>
      <div className="mb-4 flex gap-2" role="group" aria-label="Contract type">
        {(['equity', 'commodities'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-10 rounded-full border px-4 text-sm font-medium ${kind === k ? 'border-strong bg-strong text-white' : 'border-line hover:border-primary'}`}
          >
            {k === 'equity' ? 'Equity' : 'Commodities'}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-3">
        {shown.map((c) => (
          <li key={c.name} className="rounded-xl border border-line bg-surface p-4">
            <p className="line-clamp-2 min-h-10 text-sm font-medium text-strong">{c.name}</p>
            <div className="mt-2">
              <Candles candles={c.candles} label={`${c.name}: 24 days of made-up prices`} />
            </div>
            <p className="tabular mt-2 font-semibold text-strong">{c.price}</p>
            {c.change && (
              <p className="text-sm">
                <Signed value={c.change} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
