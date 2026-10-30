'use client';
// The fund page's order card, after the layout reference: Monthly SIP or One-time, a big ₹ amount with
// quick-add chips, the SIP date, how it is paid, the goal row, then Add to cart and Start SIP. Demo orders:
// no real money moves. Start SIP works without a goal; nothing is preselected.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { goalBody, GoalPicker, type GoalChoice, type GoalOptions } from './goal-picker';
import { postJson } from './post-json';

export interface OrderCardProps {
  fundId: number;
  minAmount: number;
  maxAmount: number;
  amountRange: string;
  defaultAmount: number;
  quickAdd: { value: number; label: string }[];
  days: { value: number; label: string }[];
  defaultDay: number;
  mandate: string;
  balance: string;
  goalOptions: GoalOptions;
}

type Mode = 'sip' | 'once';

export function OrderCard({ fundId, minAmount, maxAmount, amountRange, defaultAmount, quickAdd, days, defaultDay, mandate, balance, goalOptions }: OrderCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sip');
  const [amount, setAmount] = useState(String(defaultAmount));
  const [day, setDay] = useState(defaultDay);
  const [goal, setGoal] = useState<GoalChoice>({ kind: null, name: '', target: null });
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean; cart?: boolean } | null>(null);

  const value = Number(amount);
  const amountOk = Number.isInteger(value) && value >= minAmount && value <= maxAmount;
  const hasGoal = mode === 'sip' && goal.kind !== null && goal.kind !== 'none';

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

  function checkAmount(): boolean {
    if (amountOk) return true;
    setMessage({ text: `Enter a whole amount. ${amountRange}.`, error: true });
    return false;
  }

  async function start() {
    if (!checkAmount()) return;
    setBusy(true);
    setMessage(null);
    if (mode === 'sip') {
      const result = await postJson<{ id: number }>('/api/sips', { fundId, amount: value, frequency: 'monthly', day, goal: goalBody(goal) });
      if (result.ok) {
        router.push(`/sips/${result.data.id}/started`);
        return;
      }
      setMessage({ text: result.error, error: true });
    } else {
      const result = await postJson('/api/invest', { fundId, amount: value });
      setMessage(result.ok ? { text: result.data.message ?? 'Invested.', error: false } : { text: result.error, error: true });
      if (result.ok) router.refresh();
    }
    setBusy(false);
  }

  async function addToCart() {
    if (!checkAmount()) return;
    setBusy(true);
    setMessage(null);
    const result = await postJson('/api/cart', { fundId, kind: mode === 'sip' ? 'sip' : 'one_time', amount: value, day: mode === 'sip' ? day : undefined });
    setBusy(false);
    setMessage(result.ok ? { text: result.data.message ?? 'Added to cart.', error: false, cart: true } : { text: result.error, error: true });
    if (result.ok) router.refresh();
  }

  return (
    <section className="space-y-5 rounded-xl border border-line bg-surface p-5" aria-label="Invest in this fund">
      <div className="grid grid-cols-2 rounded-lg bg-page p-1" role="group" aria-label="Order type">
        {(['sip', 'once'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMessage(null);
            }}
            aria-pressed={mode === m}
            className={`min-h-10 rounded-md text-sm font-semibold ${mode === m ? 'bg-surface text-strong shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {m === 'sip' ? 'Monthly SIP' : 'One-time'}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="order-amount" className="block text-sm font-medium text-muted">
          {mode === 'sip' ? 'SIP amount' : 'Amount'}
        </label>
        <div className="mt-1 flex items-center border-b-2 border-line pb-1 focus-within:border-primary">
          <span className="text-3xl font-bold text-strong">₹</span>
          <input
            id="order-amount"
            type="number"
            inputMode="numeric"
            min={minAmount}
            max={maxAmount}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular w-full bg-transparent pl-1 text-3xl font-bold text-strong outline-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickAdd.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setAmount(String(Math.min(maxAmount, (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0) + chip.value)))}
              className="min-h-9 rounded-full border border-line px-3 text-sm font-medium hover:border-primary hover:text-primary"
            >
              {chip.label}
            </button>
          ))}
        </div>
        <p className={`mt-2 text-xs ${amountOk ? 'text-muted' : 'text-loss-strong'}`}>{amountRange}</p>
      </div>

      {mode === 'sip' && (
        <div>
          <label htmlFor="order-day" className="block text-sm font-medium text-muted">
            SIP date
          </label>
          <select id="order-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3">
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        {mode === 'sip' ? mandate : balance}
      </p>

      {mode === 'sip' && (
        <div className="rounded-lg bg-page p-3">
          <GoalPicker value={goal} onChange={setGoal} options={goalOptions} idPrefix="order-goal" />
          {line && (
            <p aria-live="polite" className="tabular mt-3 rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">
              {line}
            </p>
          )}
        </div>
      )}

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${message.error ? 'bg-loss-soft text-loss-strong' : 'bg-primary-soft text-primary'}`}>
          {message.text}{' '}
          {message.cart && (
            <Link href="/cart" className="font-semibold underline">
              View cart
            </Link>
          )}
          {!message.error && !message.cart && (
            <Link href="/dashboard" className="font-semibold underline">
              View in Dashboard
            </Link>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={addToCart}
          disabled={busy}
          className="flex min-h-12 items-center justify-center rounded-lg bg-primary-soft px-3 font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
        >
          Add to cart
        </button>
        <button
          type="button"
          onClick={start}
          disabled={busy || (mode === 'sip' && goal.kind === 'custom' && !goal.name.trim())}
          className="flex min-h-12 items-center justify-center rounded-lg bg-primary px-3 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? 'Please wait…' : mode === 'sip' ? 'Start SIP' : 'Invest now'}
        </button>
      </div>
      <p className="-mt-2 text-center text-xs text-muted">Demo order, no real money.</p>
    </section>
  );
}
