'use client';
// The fund page's return calculator: a monthly amount, a number of years and a rate the investor chooses, next to 0%
// and a downside. It never uses the fund's past return: past returns don't predict future ones, and starting from one
// would present a history as an expectation. So no rate is picked until the investor picks it.
import { useState } from 'react';
import { ASSUMPTIONS, DOWNSIDE_PCT, RATE_LIMITS, returnScenarios, type Scenario } from '@/server/calculators';
import { inr, signedInr } from '@/server/money';
import { Signed } from './signed';

const YEARS = [1, 3, 5, 10];
const RATES = [2, 4, 6, 8, 10, 12];

export function ReturnCalculator({ defaultAmount, minAmount }: { defaultAmount: number; minAmount: number }) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [years, setYears] = useState(5);
  const [rate, setRate] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const monthly = Number(amount);
  const ok = Number.isInteger(monthly) && monthly >= minAmount && monthly <= 100_000;
  const putIn = monthly * years * 12;
  const typedRate = typed.trim() === '' ? null : Number(typed);
  const typedOk = typedRate === null || (Number.isFinite(typedRate) && typedRate >= RATE_LIMITS.min && typedRate <= RATE_LIMITS.max);
  const scenarios: Scenario[] = ok ? returnScenarios(monthly, years, rate) : [];

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="calc-title">
      <h2 id="calc-title" className="text-lg font-semibold">
        Return calculator
      </h2>
      <p className="text-sm text-muted">Choose a rate to try. It is your assumption, not this fund&apos;s past return or a forecast.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="calc-amount" className="block text-sm font-medium">
            Monthly amount
          </label>
          <div className="mt-1 flex min-h-11 items-center rounded-lg border border-line px-3">
            <span className="text-muted">₹</span>
            <input
              id="calc-amount"
              type="number"
              inputMode="numeric"
              min={minAmount}
              max={100_000}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular w-full bg-transparent pl-1"
            />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium" id="calc-years">
            Years
          </p>
          <div className="mt-1 flex gap-2" role="group" aria-labelledby="calc-years">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y)}
                aria-pressed={years === y}
                className={`min-h-11 flex-1 rounded-lg border text-sm font-medium ${years === y ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:border-primary'}`}
              >
                {y}Y
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium" id="calc-rate">
          Rate to try, a year
        </p>
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-labelledby="calc-rate">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRate(r);
                setTyped('');
              }}
              aria-pressed={rate === r}
              className={`min-h-11 min-w-14 rounded-lg border px-3 text-sm font-medium ${rate === r ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:border-primary'}`}
            >
              {r}%
            </button>
          ))}
          <label className="flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm">
            <span className="sr-only">Or enter your own rate, in percent</span>
            <input
              inputMode="decimal"
              value={typed}
              placeholder="Your own"
              onChange={(e) => {
                setTyped(e.target.value);
                const n = e.target.value.trim() === '' ? null : Number(e.target.value);
                setRate(n !== null && Number.isFinite(n) && n >= RATE_LIMITS.min && n <= RATE_LIMITS.max ? n : null);
              }}
              className="tabular w-20 bg-transparent"
            />
            <span className="text-muted">%</span>
          </label>
        </div>
        {!typedOk && (
          <p role="alert" className="mt-1 text-sm text-loss-strong">
            Enter a rate from {RATE_LIMITS.min}% to {RATE_LIMITS.max}%.
          </p>
        )}
      </div>

      {ok ? (
        <div className="mt-4 rounded-lg bg-page p-3 text-sm">
          <p className="tabular text-muted">
            You&apos;d put in <span className="font-semibold text-strong">{inr(putIn)}</span> over {years} {years === 1 ? 'year' : 'years'}
          </p>
          <table className="mt-2 w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">If it returned</th>
                <th className="py-1 pr-3 text-right font-medium">Value</th>
                <th className="py-1 text-right font-medium">Vs put in</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {scenarios.map((s) => (
                <tr key={s.label}>
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    {s.label}
                  </th>
                  <td className="py-1.5 pr-3 text-right font-semibold text-strong">{s.value === null ? '—' : inr(s.value)}</td>
                  <td className="py-1.5 text-right">{s.value === null ? '—' : <Signed value={signedInr(s.value - putIn)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">Enter a whole amount from {inr(minAmount)} to ₹1,00,000.</p>
      )}
      <p className="mt-3 text-xs text-muted">
        Past returns don&apos;t predict future returns. This is plain arithmetic on a rate you choose, not a forecast, and a real result could be better or
        worse than every row, including the {DOWNSIDE_PCT}% one. {ASSUMPTIONS} Demo numbers.
      </p>
    </section>
  );
}
