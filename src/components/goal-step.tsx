'use client';
// The goal step (brief phase 4), shared by every place a SIP starts: the fund page's order card and the
// cart. A side panel on desktop and a bottom sheet on phones. Eight chips, "By when?" as month and year,
// an optional target amount, and a live line with the instalment count the server works out.
// Starting a SIP: "Save goal & start SIP" or "Skip for now", the same size; skipping is one tap.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BANNER_TEXT } from './banner';
import { postJson } from './post-json';

export interface GoalStepOptions {
  kinds: { kind: string; label: string }[];
  nameMax: number;
  /** 'YYYY', from this year on. */
  years: string[];
  targetMin: number;
  targetMax: number;
}

export interface GoalDraft {
  /** The chip's key: 'retirement', 'wedding', 'custom' and so on. */
  kind: string;
  /** Free text for "Something else". */
  name: string;
  /** '01'-'12' and 'YYYY'; '' until picked. */
  month: string;
  year: string;
  /** Digits only; '' for none. */
  targetAmount: string;
}

export const EMPTY_GOAL: GoalDraft = { kind: '', name: '', month: '', year: '', targetAmount: '' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INR = new Intl.NumberFormat('en-IN');

/** The goal as the APIs take it. */
export function goalApiBody(goal: GoalDraft) {
  return {
    kind: goal.kind,
    name: goal.kind === 'custom' ? goal.name.trim() : undefined,
    targetMonth: goal.month && goal.year ? `${goal.year}-${goal.month}` : null,
    targetAmount: goal.targetAmount ? Number(goal.targetAmount) : undefined,
  };
}

/** 'For: Retirement · by Mar 2056' */
export function goalLabel(goal: GoalDraft, options: GoalStepOptions): string {
  const what = goal.kind === 'custom' ? goal.name.trim() : (options.kinds.find((k) => k.kind === goal.kind)?.label ?? '');
  return `For: ${what}${goal.month && goal.year ? ` · by ${MONTHS[Number(goal.month) - 1]} ${goal.year}` : ''}`;
}

interface Props {
  open: boolean;
  /** 'start': Save goal & start SIP / Skip for now. 'edit': Save goal / Cancel, from the goal row. */
  mode: 'start' | 'edit';
  fundId: number;
  amount: number;
  day: number;
  options: GoalStepOptions;
  initial: GoalDraft;
  /** Where it opened, for the funnel: 'fund_page' or 'cart'. */
  where: 'fund_page' | 'cart';
  busy?: boolean;
  error?: string | null;
  onSave: (goal: GoalDraft) => void;
  onSkip: () => void;
  onClose: () => void;
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-medium ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface hover:border-primary'}`;

export function GoalStep({ open, mode, fundId, amount, day, options, initial, where, busy = false, error = null, onSave, onSkip, onClose }: Props) {
  const [goal, setGoal] = useState<GoalDraft>(initial);
  const [count, setCount] = useState<{ instalments: number } | { error: string } | null>(null);
  const [pressed, setPressed] = useState<'save' | 'skip' | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Each time it opens: start from the goal the card has, log goal_step_shown, and move focus into the panel.
  useEffect(() => {
    if (!open) return;
    setGoal(initial);
    setPressed(null);
    void postJson('/api/events', { event: 'goal_step_shown', where });
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Only on opening: `initial` is the goal as it was then.
  }, [open]);

  const dated = Boolean(goal.month && goal.year);
  const named = goal.kind !== '' && (goal.kind !== 'custom' || goal.name.trim().length > 0);
  const target = goal.targetAmount ? Number(goal.targetAmount) : null;
  const targetOk = target === null || (target >= options.targetMin && target <= options.targetMax);

  // The instalment count comes from the server, which does the counting (spec §5).
  useEffect(() => {
    if (!open || !dated) {
      setCount(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ fundId: String(fundId), amount: String(amount), day: String(day), targetMonth: `${goal.year}-${goal.month}` });
      const response = await fetch(`/api/goal-preview?${query}`, { signal: controller.signal }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { instalments?: number; error?: string } | null;
      if (body?.instalments !== undefined) setCount({ instalments: body.instalments });
      else if (body?.error) setCount({ error: body.error });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, dated, fundId, amount, day, goal.month, goal.year]);

  if (!open) return null;
  const valid = named && dated && targetOk && count !== null && 'instalments' in count;
  const what = goal.kind === 'custom' ? goal.name.trim() || 'your goal' : options.kinds.find((k) => k.kind === goal.kind)?.label;

  // On <body>: the order card sits in a sticky column, which would keep the panel under the page header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:items-stretch lg:justify-end" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-step-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface outline-none lg:max-h-none lg:w-[28rem] lg:rounded-none"
      >
        <p className="bg-accent-tint px-4 py-1.5 text-center text-xs font-medium text-accent-ink">{BANNER_TEXT}</p>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="goal-step-title" className="text-xl font-bold text-strong">
              What&apos;s this SIP for?
            </h2>
            <p className="text-sm text-muted">Pick one. You can change it later.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full text-2xl leading-none text-muted hover:bg-page">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="sr-only">What this SIP is for</legend>
            <div className="flex flex-wrap gap-2">
              {options.kinds.map((k) => (
                <button key={k.kind} type="button" aria-pressed={goal.kind === k.kind} onClick={() => setGoal({ ...goal, kind: k.kind })} className={chip(goal.kind === k.kind)}>
                  {k.label}
                </button>
              ))}
            </div>
            {goal.kind === 'custom' && (
              <div className="mt-3">
                <label htmlFor="goal-step-name" className="block text-sm font-semibold">
                  Name your goal
                </label>
                <input
                  id="goal-step-name"
                  value={goal.name}
                  maxLength={options.nameMax}
                  onChange={(e) => setGoal({ ...goal, name: e.target.value })}
                  placeholder="In any language, e.g. Bike, घर की मरम्मत"
                  className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
                />
                <p className="mt-1 text-xs text-muted">Up to {options.nameMax} characters. No personal details.</p>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="font-semibold text-strong">By when?</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="sr-only">Month</span>
                <select value={goal.month} onChange={(e) => setGoal({ ...goal, month: e.target.value })} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Year</span>
                <select value={goal.year} onChange={(e) => setGoal({ ...goal, year: e.target.value })} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
                  <option value="">Year</option>
                  {options.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <div>
            <label htmlFor="goal-step-target" className="font-semibold text-strong">
              Target amount <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="mt-2 flex min-h-11 items-center rounded-lg border border-line px-3 focus-within:border-primary">
              <span className="text-muted">₹</span>
              <input
                id="goal-step-target"
                inputMode="numeric"
                value={goal.targetAmount ? INR.format(Number(goal.targetAmount)) : ''}
                onChange={(e) => setGoal({ ...goal, targetAmount: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                placeholder="10,00,000"
                className="tabular w-full bg-transparent pl-1 outline-none"
              />
            </div>
            {!targetOk && (
              <p className="mt-1 text-xs text-loss-strong">
                From ₹{INR.format(options.targetMin)} to ₹{INR.format(options.targetMax)}, or leave it empty.
              </p>
            )}
          </div>

          <div aria-live="polite" className="rounded-lg bg-primary-soft px-4 py-3 text-sm">
            {named && dated && count && 'instalments' in count ? (
              <p className="tabular font-semibold text-primary">
                ₹{INR.format(amount)} a month for {what} by {MONTHS[Number(goal.month) - 1]} {goal.year} · about {count.instalments} instalments
              </p>
            ) : count && 'error' in count ? (
              <p className="text-loss-strong">{count.error}</p>
            ) : (
              <p className="text-primary">Pick a goal and a month to see how many instalments that is.</p>
            )}
          </div>
          <p className="text-sm text-muted">SIPs often look red after a market fall. We&apos;ll show you this goal then, so you can decide calmly.</p>
          {error && (
            <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
              {error}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setPressed('skip');
              if (mode === 'start') onSkip();
              else onClose();
            }}
            disabled={busy}
            className="flex min-h-12 items-center justify-center rounded-lg border border-line px-3 font-semibold text-strong hover:border-primary disabled:opacity-60"
          >
            {busy && pressed === 'skip' ? 'Starting…' : mode === 'start' ? 'Skip for now' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPressed('save');
              onSave(goal);
            }}
            disabled={busy || !valid}
            className="flex min-h-12 items-center justify-center rounded-lg bg-primary px-3 text-center font-bold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {busy && pressed === 'save' ? 'Starting…' : mode === 'start' ? 'Save goal & start SIP' : 'Save goal'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
