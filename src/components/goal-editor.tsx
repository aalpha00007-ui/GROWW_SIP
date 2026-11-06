'use client';
// The one goal editor: what the money is for, any future month and year, and an optional target amount. The same
// fields whether a goal is being created (the goal step, on the fund page and in the cart) or edited (the goal
// page), so the two can't drift apart. Every problem is said next to its field, as soon as it appears and gone as
// soon as it is fixed; Save stays disabled until goalProblems finds none. The server checks everything again.

export interface GoalEditorOptions {
  kinds: { kind: string; label: string }[];
  nameMax: number;
  /** 'YYYY', from this year on. */
  years: string[];
  targetMin: number;
  targetMax: number;
  /** 'YYYY-MM': the first month a goal can aim for. */
  firstMonth: string;
  /** Why no earlier month works: 'Pick a month after this month'. */
  firstMonthHint: string;
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
  /** One of the investor's goals, for a one-time investment; then the fields above are unused. */
  goalId?: number;
}

export const EMPTY_GOAL: GoalDraft = { kind: '', name: '', month: '', year: '', targetAmount: '' };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const INR = new Intl.NumberFormat('en-IN');

/** The goal as the APIs take it. A cleared target or date is sent as null, so saving it really clears it. */
export function goalApiBody(goal: GoalDraft) {
  if (goal.goalId !== undefined) return { goalId: goal.goalId };
  return {
    kind: goal.kind,
    name: goal.kind === 'custom' ? goal.name.trim() : undefined,
    targetMonth: goal.month && goal.year ? `${goal.year}-${goal.month}` : null,
    targetAmount: goal.targetAmount ? Number(goal.targetAmount) : null,
  };
}

/** 'For: Retirement · by Mar 2056' */
export function goalLabel(goal: GoalDraft, options: GoalEditorOptions & { existing?: { id: number; label: string }[] }): string {
  if (goal.goalId !== undefined) return `For: ${options.existing?.find((g) => g.id === goal.goalId)?.label ?? 'your goal'}`;
  const what = goal.kind === 'custom' ? goal.name.trim() : (options.kinds.find((k) => k.kind === goal.kind)?.label ?? '');
  return `For: ${what}${goal.month && goal.year ? ` · by ${MONTHS[Number(goal.month) - 1]} ${goal.year}` : ''}`;
}

export interface GoalProblems {
  named: boolean;
  dated: boolean;
  /** Why this date can't be saved, or null. */
  date: string | null;
  /** Why this target can't be saved, or null. */
  target: string | null;
  /** Everything needed is there and nothing is wrong. */
  ok: boolean;
}

/** `dateRequired`: a new SIP's goal needs a date; an existing goal may have none. */
export function goalProblems(goal: GoalDraft, options: GoalEditorOptions, { dateRequired }: { dateRequired: boolean }): GoalProblems {
  const named = goal.kind !== '' && (goal.kind !== 'custom' || goal.name.trim().length > 0);
  const dated = Boolean(goal.month && goal.year);
  let date: string | null = null;
  if (Boolean(goal.month) !== Boolean(goal.year)) date = 'Pick both a month and a year.';
  else if (dated && `${goal.year}-${goal.month}` < options.firstMonth) date = `${options.firstMonthHint}.`;
  const amount = goal.targetAmount ? Number(goal.targetAmount) : null;
  const target =
    amount !== null && (amount < options.targetMin || amount > options.targetMax)
      ? `Enter a target from ₹${INR.format(options.targetMin)} to ₹${INR.format(options.targetMax)}, or leave it empty.`
      : null;
  return { named, dated, date, target, ok: named && date === null && target === null && (dated || !dateRequired) };
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-medium ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface hover:border-primary'}`;

export function GoalEditor({
  value,
  onChange,
  options,
  idPrefix,
  dateRequired,
  kindsLegend,
  showWhen = true,
}: {
  value: GoalDraft;
  onChange: (next: GoalDraft) => void;
  options: GoalEditorOptions;
  idPrefix: string;
  dateRequired: boolean;
  /** A visible heading over the chips; screen readers get "What this money is for" without one. */
  kindsLegend?: string;
  /** False hides the date and target, when one of the investor's own goals is picked instead. */
  showWhen?: boolean;
}) {
  const problems = goalProblems(value, options, { dateRequired });
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className={kindsLegend ? 'font-semibold text-strong' : 'sr-only'}>{kindsLegend ?? 'What this money is for'}</legend>
        <div className={`flex flex-wrap gap-2 ${kindsLegend ? 'mt-2' : ''}`}>
          {options.kinds.map((k) => (
            <button key={k.kind} type="button" aria-pressed={value.kind === k.kind} onClick={() => onChange({ ...value, goalId: undefined, kind: k.kind })} className={chip(value.kind === k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
        {value.kind === 'custom' && (
          <div className="mt-3">
            <label htmlFor={`${idPrefix}-name`} className="block text-sm font-semibold">
              Name your goal
            </label>
            <input
              id={`${idPrefix}-name`}
              value={value.name}
              maxLength={options.nameMax}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="In any language, e.g. Bike, घर की मरम्मत"
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
            />
            <p className="mt-1 text-xs text-muted">Up to {options.nameMax} characters. No personal details.</p>
          </div>
        )}
      </fieldset>

      {showWhen && (
        <>
          <fieldset aria-describedby={problems.date ? `${idPrefix}-date-problem` : undefined}>
            <legend className="font-semibold text-strong">
              By when? {!dateRequired && <span className="font-normal text-muted">(optional)</span>}
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="sr-only">Month</span>
                <select value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
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
                <select value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
                  <option value="">Year</option>
                  {options.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {problems.date && (
              <p id={`${idPrefix}-date-problem`} role="alert" className="mt-1 text-sm text-loss-strong">
                {problems.date}
              </p>
            )}
          </fieldset>

          <div>
            <label htmlFor={`${idPrefix}-target`} className="font-semibold text-strong">
              Target amount <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="mt-2 flex min-h-11 items-center rounded-lg border border-line px-3">
              <span className="text-muted">₹</span>
              <input
                id={`${idPrefix}-target`}
                inputMode="numeric"
                value={value.targetAmount ? INR.format(Number(value.targetAmount)) : ''}
                onChange={(e) => onChange({ ...value, targetAmount: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                placeholder="10,00,000"
                aria-invalid={problems.target !== null}
                aria-describedby={problems.target ? `${idPrefix}-target-problem` : undefined}
                className="tabular w-full bg-transparent pl-1"
              />
            </div>
            {problems.target && (
              <p id={`${idPrefix}-target-problem`} role="alert" className="mt-1 text-sm text-loss-strong">
                {problems.target}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
