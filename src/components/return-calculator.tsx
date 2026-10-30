'use client';
// The fund page's return calculator: a monthly amount and a number of years give what is put in and an
// estimated value at the fund's demo 3Y return. It says plainly that past returns guarantee nothing.
import { useState } from 'react';
import { inr, signedInr } from '@/server/money';
import { Signed } from './signed';

const YEARS = [1, 3, 5, 10];

export function ReturnCalculator({ rate, rateText, defaultAmount, minAmount }: { rate: number; rateText: string; defaultAmount: number; minAmount: number }) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [years, setYears] = useState(5);
  const monthly = Number(amount);
  const ok = Number.isInteger(monthly) && monthly >= minAmount && monthly <= 100_000;

  const months = years * 12;
  const r = (1 + rate) ** (1 / 12) - 1;
  const putIn = monthly * months;
  // Each instalment grows from the month it goes in; r of 0 means no growth at all.
  const estimate = r === 0 ? putIn : monthly * (((1 + r) ** months - 1) / r) * (1 + r);

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="calc-title">
      <h2 id="calc-title" className="text-lg font-semibold">
        Return calculator
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="calc-amount" className="block text-sm font-medium">
            Monthly amount
          </label>
          <div className="mt-1 flex min-h-11 items-center rounded-lg border border-line px-3 focus-within:border-primary">
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
              className="tabular w-full bg-transparent pl-1 outline-none"
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
      {ok ? (
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-page p-3 text-sm">
          <div>
            <dt className="text-muted">Invested</dt>
            <dd className="tabular font-semibold text-strong">{inr(putIn)}</dd>
          </div>
          <div>
            <dt className="text-muted">Estimated value</dt>
            <dd className="tabular font-semibold text-strong">{inr(estimate)}</dd>
          </div>
          <div>
            <dt className="text-muted">Estimated gain</dt>
            <dd className="font-semibold">
              <Signed value={signedInr(estimate - putIn)} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">Enter a whole amount from {inr(minAmount)} to ₹1,00,000.</p>
      )}
      <p className="mt-3 text-xs text-muted">
        Uses this fund&apos;s demo 3Y return of {rateText} a year. Past returns don&apos;t guarantee future returns. Demo numbers.
      </p>
    </section>
  );
}
