'use client';
// The fund page's order card, after the layout reference: Monthly SIP or One-time, a big ₹ amount with
// quick-add chips, the SIP date, how it is paid, the NEW goal row, then Add to cart and Start SIP. Start SIP
// with no goal opens the goal step (brief phase 4), where skipping is one tap. Demo orders: no real money.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EMPTY_GOAL, goalApiBody, goalLabel, GoalStep, type GoalDraft, type GoalStepOptions } from './goal-step';
import { Icon } from './icons';
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
  goalStep: GoalStepOptions;
  showGoalTip: boolean;
}

type Mode = 'sip' | 'once';

export function OrderCard({ fundId, minAmount, maxAmount, amountRange, defaultAmount, quickAdd, days, defaultDay, mandate, balance, goalStep, showGoalTip }: OrderCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sip');
  const [amount, setAmount] = useState(String(defaultAmount));
  const [day, setDay] = useState(defaultDay);
  const [goal, setGoal] = useState<GoalDraft | null>(null);
  const [step, setStep] = useState<'start' | 'edit' | null>(null);
  const [tip, setTip] = useState(showGoalTip);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean; cart?: boolean } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const value = Number(amount);
  const amountOk = Number.isInteger(value) && value >= minAmount && value <= maxAmount;

  function checkAmount(): boolean {
    if (amountOk) return true;
    setMessage({ text: `Enter a whole amount. ${amountRange}.`, error: true });
    return false;
  }

  function closeTip() {
    setTip(false);
    void postJson('/api/events', { event: 'goal_tooltip_dismissed' });
  }

  /** Starts the SIP; from the goal step, errors show in the panel. */
  async function startSip(withGoal: GoalDraft | null, goalStepChoice: 'saved' | 'skipped') {
    setBusy(true);
    setStepError(null);
    setMessage(null);
    const result = await postJson<{ id: number }>('/api/sips', {
      fundId,
      amount: value,
      frequency: 'monthly',
      day,
      goal: withGoal ? goalApiBody(withGoal) : null,
      goalStep: goalStepChoice,
      source: 'fund_page',
    });
    if (result.ok) {
      router.push(`/sips/${result.data.id}/started`);
      return;
    }
    setBusy(false);
    if (step) setStepError(result.error);
    else setMessage({ text: result.error, error: true });
  }

  async function start() {
    if (!checkAmount()) return;
    if (mode === 'sip') {
      if (tip) closeTip();
      if (goal) await startSip(goal, 'saved');
      else setStep('start');
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await postJson('/api/invest', { fundId, amount: value });
    setMessage(result.ok ? { text: result.data.message ?? 'Invested.', error: false } : { text: result.error, error: true });
    setBusy(false);
    if (result.ok) router.refresh();
  }

  async function addToCart() {
    if (!checkAmount()) return;
    setBusy(true);
    setMessage(null);
    const result = await postJson('/api/cart', {
      fundId,
      kind: mode === 'sip' ? 'sip' : 'one_time',
      amount: value,
      day: mode === 'sip' ? day : undefined,
      goal: mode === 'sip' && goal ? goalApiBody(goal) : undefined,
    });
    setBusy(false);
    setMessage(result.ok ? { text: result.data.message ?? 'Added to cart.', error: false, cart: true } : { text: result.error, error: true });
    if (result.ok) router.refresh();
  }

  function saveGoal(next: GoalDraft) {
    if (step === 'start') {
      setGoal(next);
      void startSip(next, 'saved');
    } else {
      setGoal(next);
      setStep(null);
    }
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
        <div>
          {tip && (
            <div role="note" aria-label="New feature" className="relative mb-3 rounded-lg bg-strong p-3 text-sm text-white shadow-lg">
              <p>
                <span className="font-bold">New:</span> tell us what this SIP is for. When the market falls, we&apos;ll show you this goal next to your SIP.
              </p>
              <button type="button" onClick={closeTip} className="mt-2 min-h-9 rounded-md bg-white px-3 text-sm font-semibold text-strong hover:bg-primary-soft">
                Got it
              </button>
              <span aria-hidden="true" className="absolute -bottom-1.5 left-8 size-3 rotate-45 bg-strong" />
            </div>
          )}
          {goal ? (
            <div className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-primary bg-primary-soft px-3">
              <span className="text-sm font-semibold text-primary">{goalLabel(goal, goalStep)}</span>
              <button
                type="button"
                onClick={() => setStep('edit')}
                aria-label="Edit goal"
                className="grid size-10 shrink-0 place-items-center rounded-full text-primary hover:bg-surface"
              >
                <Icon name="edit" size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (tip) closeTip();
                setStep('edit');
              }}
              className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-dashed border-primary px-3 text-left text-sm hover:bg-primary-soft"
            >
              <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-ink">New</span>
              <span className="flex-1 font-medium text-strong">What&apos;s this SIP for?</span>
              <span className="flex items-center font-semibold text-primary">
                Add a goal
                <Icon name="chevron" size={16} />
              </span>
            </button>
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
          disabled={busy}
          className="flex min-h-12 items-center justify-center rounded-lg bg-primary px-3 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy && !step ? 'Please wait…' : mode === 'sip' ? 'Start SIP' : 'Invest now'}
        </button>
      </div>
      <p className="-mt-2 text-center text-xs text-muted">Demo order, no real money. The first instalment is paid from your demo balance.</p>

      <GoalStep
        open={step !== null}
        mode={step ?? 'edit'}
        fundId={fundId}
        amount={amountOk ? value : minAmount}
        day={day}
        options={goalStep}
        initial={goal ?? EMPTY_GOAL}
        where="fund_page"
        busy={busy}
        error={stepError}
        onSave={saveGoal}
        onSkip={() => void startSip(null, 'skipped')}
        onClose={() => {
          setStep(null);
          setStepError(null);
        }}
      />
    </section>
  );
}
