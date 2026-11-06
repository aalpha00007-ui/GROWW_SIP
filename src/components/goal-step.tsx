'use client';
// The goal step (brief phase 4), shared by every place a SIP starts: the fund page's order card and the
// cart. A side panel on desktop and a bottom sheet on phones, around the one goal editor (goal-editor.tsx), with
// a live line with the instalment count the server works out.
// Starting a SIP: "Save goal & start SIP" or "Skip for now", the same size; skipping is one tap.
// A one-time investment uses it too ('once'): it can also go to one of the investor's goals, and has no instalments.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BANNER_TEXT } from './banner';
import { EMPTY_GOAL, GoalEditor, GoalGapNote, goalLabel, goalProblems, INR, MONTHS, type GoalDraft, type GoalEditorOptions, type GoalGapLines } from './goal-editor';

export interface GoalStepOptions extends GoalEditorOptions {
  /** The investor's goals a one-time investment can be added to. */
  existing?: { id: number; label: string }[];
}

interface Props {
  open: boolean;
  /** A monthly SIP (the default) or a one-time investment. */
  kind?: 'sip' | 'once';
  /** 'start': Save goal & start SIP / Skip for now. 'edit': Save goal / Cancel, from the goal row. */
  mode: 'start' | 'edit';
  fundId: number;
  amount: number;
  day: number;
  options: GoalStepOptions;
  initial: GoalDraft;
  busy?: boolean;
  error?: string | null;
  onSave: (goal: GoalDraft) => void;
  onSkip: () => void;
  onClose: () => void;
}

/** The instalment line is a help, not a gate: past this, saving goes ahead without it. The server checks the goal on save. */
const PREVIEW_TIMEOUT_MS = 5_000;

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-medium ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface hover:border-primary'}`;

export function GoalStep({ open, kind = 'sip', mode, fundId, amount, day, options, initial, busy = false, error = null, onSave, onSkip, onClose }: Props) {
  const [goal, setGoal] = useState<GoalDraft>(initial);
  const [count, setCount] = useState<{ instalments: number; gap: GoalGapLines | null } | { error: string } | { unavailable: true } | null>(null);
  const [pressed, setPressed] = useState<'save' | 'skip' | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Each time it opens: start from the goal the card has, and move focus into the panel.
  useEffect(() => {
    if (!open) return;
    setGoal(initial);
    setPressed(null);
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Only on opening: `initial` is the goal as it was then.
  }, [open]);

  const once = kind === 'once';
  const picked = goal.goalId !== undefined;
  const existing = once ? (options.existing ?? []) : [];
  const problems = goalProblems(goal, options, { dateRequired: true });
  const { named, dated } = problems;
  const target = goal.targetAmount ? Number(goal.targetAmount) : null;

  // The instalment count comes from the server, which does the counting (spec §5). A one-time investment has none.
  useEffect(() => {
    if (!open || !dated || once || problems.date) {
      setCount(null);
      return;
    }
    const controller = new AbortController();
    let replaced = false;
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ fundId: String(fundId), amount: String(amount), day: String(day), targetMonth: `${goal.year}-${goal.month}` });
      if (goal.targetAmount && !problems.target) query.set('target', goal.targetAmount);
      const giveUp = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
      const response = await fetch(`/api/goal-preview?${query}`, { signal: controller.signal }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { instalments?: number; gap?: GoalGapLines | null; error?: string } | null;
      clearTimeout(giveUp);
      if (replaced) return;
      if (body?.instalments !== undefined) setCount({ instalments: body.instalments, gap: body.gap ?? null });
      else if (body?.error) setCount({ error: body.error });
      else setCount({ unavailable: true });
    }, 200);
    return () => {
      replaced = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, dated, once, problems.date, problems.target, fundId, amount, day, goal.month, goal.year, goal.targetAmount]);

  if (!open) return null;
  // A goal the server refused (a date before the first instalment) can't be saved. One it couldn't preview still can.
  const valid = picked || (problems.ok && (once || (count !== null && !('error' in count))));
  // The plan next to the target: what will be put in, never what it will be worth. Saving is allowed either way.
  const gap = count && 'gap' in count ? count.gap : null;
  const showGap = !picked && problems.ok && target !== null && (once || gap !== null);
  // Whole years to the goal for the Goal planner (1-40), counted from this month.
  const plannerYears = (() => {
    if (!dated) return 10;
    const months = (Number(goal.year) - Number(options.firstMonth.slice(0, 4))) * 12 + (Number(goal.month) - Number(options.firstMonth.slice(5))) + 1;
    return Math.min(40, Math.max(1, Math.round(months / 12)));
  })();
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
              {once ? 'What’s this investment for?' : 'What’s this SIP for?'}
            </h2>
            <p className="text-sm text-muted">Pick one. You can change it later.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full text-2xl leading-none text-muted hover:bg-page">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {existing.length > 0 && (
            <fieldset>
              <legend className="font-semibold text-strong">Add to one of your goals</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {existing.map((g) => (
                  <button key={g.id} type="button" aria-pressed={goal.goalId === g.id} onClick={() => setGoal({ ...EMPTY_GOAL, goalId: g.id })} className={chip(goal.goalId === g.id)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <GoalEditor
            value={goal}
            onChange={setGoal}
            options={options}
            idPrefix="goal-step"
            dateRequired
            kindsLegend={existing.length > 0 ? 'Or start a new goal' : undefined}
            showWhen={!picked}
          />

          <div aria-live="polite" className="rounded-lg bg-primary-soft px-4 py-3 text-sm">
            {once ? (
              <p className="tabular font-semibold text-ink">
                {picked
                  ? `₹${INR.format(amount)} one-time, ${goalLabel(goal, options).replace('For: ', 'for ')}`
                  : named && dated && !problems.date
                    ? `₹${INR.format(amount)} one-time for ${what} by ${MONTHS[Number(goal.month) - 1]} ${goal.year}`
                    : 'Pick a goal to add this money to, or a new goal and a month.'}
              </p>
            ) : named && dated && count && 'instalments' in count ? (
              <p className="tabular font-semibold text-ink">
                ₹{INR.format(amount)} a month for {what} by {MONTHS[Number(goal.month) - 1]} {goal.year} · about {count.instalments} instalments
              </p>
            ) : count && 'error' in count ? (
              <p className="text-loss-strong">{count.error}</p>
            ) : count && 'unavailable' in count ? (
              <p className="text-ink">We couldn’t work out the instalments just now. You can still save this goal.</p>
            ) : (
              <p className="text-ink">Pick a goal and a month to see how many instalments that is.</p>
            )}
            {showGap && (
              <div className="mt-2 space-y-1 border-t border-primary/20 pt-2">
                {gap ? (
                  <GoalGapNote gap={gap} />
                ) : (
                  <p className="tabular text-ink">
                    {amount >= target!
                      ? `You’ll put in ₹${INR.format(amount)} now, which covers your ₹${INR.format(target!)} target before any returns.`
                      : `You’ll put in ₹${INR.format(amount)} now. Your target is ₹${INR.format(target!)}.`}
                  </p>
                )}
                <p className="text-xs text-muted">Returns can add to this or take away from it. They aren’t guaranteed.</p>
                <a
                  href={`/calculators/goal?target=${target}&years=${plannerYears}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
                >
                  Try amounts in the Goal planner
                </a>
              </div>
            )}
          </div>
          <p className="text-sm text-muted">
            {once
              ? 'Money in a fund can look red after a market fall. We’ll show you this goal next to it, so you can decide calmly.'
              : 'SIPs often look red after a market fall. We’ll show you this goal then, so you can decide calmly.'}
          </p>
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
            {busy && pressed === 'skip' ? (once ? 'Investing…' : 'Starting…') : mode === 'start' ? 'Skip for now' : 'Cancel'}
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
            {busy && pressed === 'save' ? (once ? 'Investing…' : 'Starting…') : mode === 'start' ? (once ? 'Save goal & invest' : 'Save goal & start SIP') : 'Save goal'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
