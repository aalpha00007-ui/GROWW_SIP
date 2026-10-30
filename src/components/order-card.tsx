'use client';
// The fund page's order card, after the layout reference: Monthly SIP or One-time, a big ₹ amount with
// quick-add chips, the SIP date, how it is paid, the NEW goal row, then Add to cart and Start SIP. Start SIP
// with no goal opens the goal step (brief phase 4), where skipping is one tap. A one-time investment has the
// same goal row and step, and can also go to one of the investor's goals. Above the row, a pop-up tip says
// why a goal helps; minimised, it becomes "Why add a goal?", which opens it again. It starts minimised once
// the investor has minimised it before. Demo orders: no real money.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
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
  // The tip is open until minimised; minimising is remembered (goal_tooltip_dismissed), so it then starts small.
  const [tip, setTip] = useState(showGoalTip);
  const tipLogged = useRef(!showGoalTip);
  const tipButton = useRef<HTMLButtonElement>(null);
  const whyButton = useRef<HTMLButtonElement>(null);
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
    if (tipLogged.current) return;
    tipLogged.current = true;
    void postJson('/api/events', { event: 'goal_tooltip_dismissed' });
  }

  /** From the tip's own buttons: keyboard focus goes to "Why add a goal?", which opens it again. */
  function minimiseTip() {
    closeTip();
    requestAnimationFrame(() => whyButton.current?.focus());
  }

  function openTip() {
    setTip(true);
    requestAnimationFrame(() => tipButton.current?.focus());
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

  /** Invests once; from the goal step, errors show in the panel. */
  async function investOnce(withGoal: GoalDraft | null) {
    setBusy(true);
    setStepError(null);
    setMessage(null);
    const result = await postJson('/api/invest', { fundId, amount: value, goal: withGoal ? goalApiBody(withGoal) : undefined });
    setBusy(false);
    if (result.ok) {
      setStep(null);
      setGoal(null);
      setMessage({ text: result.data.message ?? 'Invested.', error: false });
      router.refresh();
      return;
    }
    if (step) setStepError(result.error);
    else setMessage({ text: result.error, error: true });
  }

  async function start() {
    if (!checkAmount()) return;
    if (tip) closeTip();
    if (!goal) setStep('start');
    else if (mode === 'sip') await startSip(goal, 'saved');
    else await investOnce(goal);
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
      goal: goal ? goalApiBody(goal) : undefined,
    });
    setBusy(false);
    setMessage(result.ok ? { text: result.data.message ?? 'Added to cart.', error: false, cart: true } : { text: result.error, error: true });
    if (result.ok) router.refresh();
  }

  function saveGoal(next: GoalDraft) {
    if (step === 'start') {
      setGoal(next);
      void (mode === 'sip' ? startSip(next, 'saved') : investOnce(next));
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
              // One of the investor's own goals is only for a one-time investment; a new goal suits both.
              if (m === 'sip' && goal?.goalId !== undefined) setGoal(null);
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

      <div>
        {!goal &&
          (tip ? (
            <div id="goal-tip" role="note" aria-label="Why add a goal" className="relative mb-3 rounded-lg bg-strong p-3 pr-12 text-sm text-white shadow-lg">
              <p>
                <span className="font-bold">New:</span>{' '}
                {mode === 'sip'
                  ? 'tell us what this SIP is for. When the market falls, we’ll show you this goal next to your SIP.'
                  : 'tell us what this money is for. When the market falls, we’ll show you this goal next to it.'}
              </p>
              <button ref={tipButton} type="button" onClick={minimiseTip} className="mt-2 min-h-9 rounded-md bg-white px-3 text-sm font-semibold text-strong hover:bg-primary-soft">
                Got it
              </button>
              <button
                type="button"
                onClick={minimiseTip}
                aria-label="Minimise tip"
                className="absolute right-1 top-1 grid size-10 place-items-center rounded-full text-xl leading-none text-white/80 hover:bg-white/10 hover:text-white"
              >
                −
              </button>
              <span aria-hidden="true" className="absolute -bottom-1.5 left-8 size-3 rotate-45 bg-strong" />
            </div>
          ) : (
            <button
              ref={whyButton}
              type="button"
              onClick={openTip}
              aria-expanded={false}
              aria-controls="goal-tip"
              className="mb-1 flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Icon name="help" size={16} />
              Why add a goal?
            </button>
          ))}
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
            <span className="flex-1 font-medium text-strong">{mode === 'sip' ? 'What’s this SIP for?' : 'What’s this investment for?'}</span>
            <span className="flex items-center font-semibold text-primary">
              Add a goal
              <Icon name="chevron" size={16} />
            </span>
          </button>
        )}
      </div>

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
      <p className="-mt-2 text-center text-xs text-muted">
        {mode === 'sip' ? 'Demo order, no real money. The first instalment is paid from your demo balance.' : 'Demo order, no real money. Paid from your demo balance.'}
      </p>

      <GoalStep
        open={step !== null}
        kind={mode === 'sip' ? 'sip' : 'once'}
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
        onSkip={() => void (mode === 'sip' ? startSip(null, 'skipped') : investOnce(null))}
        onClose={() => {
          setStep(null);
          setStepError(null);
        }}
      />
    </section>
  );
}
