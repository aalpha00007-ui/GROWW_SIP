'use client';
// The SIP box on the fund page (PRD F2, spec §2A): amount, date, the optional goal row with its live
// line, the autopay row and Start SIP. Start SIP works without a goal; nothing is preselected.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { goalBody, GoalPicker, type GoalChoice, type GoalOptions } from './goal-picker';
import { postJson } from './post-json';

export interface SipBoxProps {
  fundId: number;
  minAmount: number;
  maxAmount: number;
  amountRange: string;
  defaultAmount: number;
  amountChips: { value: number; label: string }[];
  days: { value: number; label: string }[];
  defaultDay: number;
  mandate: string;
  goalOptions: GoalOptions;
}

export function SipBox({ fundId, minAmount, maxAmount, amountRange, defaultAmount, amountChips, days, defaultDay, mandate, goalOptions }: SipBoxProps) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [day, setDay] = useState(defaultDay);
  const [goal, setGoal] = useState<GoalChoice>({ kind: null, name: '', target: null });
  const [line, setLine] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const amountOk = Number.isInteger(value) && value >= minAmount && value <= maxAmount;
  const hasGoal = goal.kind !== null && goal.kind !== 'none';

  // The live goal line comes from the server, which does the counting (spec §5).
  useEffect(() => {
    if (!hasGoal || !goal.target || !amountOk) {
      setLine(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ fundId: String(fundId), amount: String(value), day: String(day), targetMonth: goal.target! });
      const response = await fetch(`/api/goal-preview?${query}`, { signal: controller.signal }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { line?: string; error?: string } | null;
      setLine(body?.line ?? body?.error ?? null);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fundId, value, day, goal.target, hasGoal, amountOk]);

  async function start() {
    if (!amountOk) {
      setError(`Enter a whole amount. ${amountRange}.`);
      return;
    }
    setStarting(true);
    setError(null);
    const result = await postJson<{ id: number }>('/api/sips', { fundId, amount: value, frequency: 'monthly', day, goal: goalBody(goal) });
    if (result.ok) {
      router.push(`/sips/${result.data.id}/started`);
      return;
    }
    setStarting(false);
    setError(result.error);
  }

  return (
    <section className="space-y-5 rounded-xl border border-line bg-card p-4" aria-label="Start a SIP">
      <div>
        <h2 className="text-lg font-bold">Monthly SIP</h2>
        <p className="text-sm text-muted">One-time, weekly and daily are not in this prototype.</p>
      </div>

      <div>
        <label htmlFor="box-amount" className="block font-semibold">
          Amount a month (Rs)
        </label>
        <input
          id="box-amount"
          type="number"
          inputMode="numeric"
          min={minAmount}
          max={maxAmount}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular mt-1 min-h-11 w-full rounded-lg border border-line px-3 text-lg font-bold"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {amountChips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setAmount(String(chip.value))}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${value === chip.value ? 'border-brand bg-brand-tint text-brand' : 'border-line hover:border-brand'}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <p className={`mt-1 text-xs ${amountOk ? 'text-muted' : 'text-loss-ink'}`}>{amountRange}</p>
      </div>

      <div>
        <label htmlFor="box-day" className="block font-semibold">
          SIP date
        </label>
        <select id="box-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3">
          {days.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg bg-ground p-3">
        <GoalPicker value={goal} onChange={setGoal} options={goalOptions} idPrefix="box-goal" />
        {line && (
          <p aria-live="polite" className="tabular mt-3 rounded-lg bg-brand-tint px-3 py-2 text-sm font-semibold text-brand">
            {line}
          </p>
        )}
      </div>

      <p className="text-sm text-muted">{mandate}</p>

      {error && (
        <p role="alert" className="rounded-lg bg-loss-tint px-3 py-2 text-sm text-loss-ink">
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={start}
          disabled={starting || (goal.kind === 'custom' && !goal.name.trim())}
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-brand px-4 font-bold text-white hover:bg-brand/90 disabled:opacity-60"
        >
          {starting ? 'Starting…' : 'Start SIP'}
        </button>
        <p className="mt-2 text-center text-xs text-muted">Demo order, no real money.</p>
      </div>
    </section>
  );
}
