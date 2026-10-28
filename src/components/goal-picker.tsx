'use client';
// The goal chips (spec §2A): "What is this money for?" and "By when?". Used by the SIP box, the goal page
// and the goal prompt after Start SIP. Nothing is preselected unless the SIP already has a goal.

export interface GoalChoice {
  kind: string | null;
  name: string;
  /** 'YYYY-MM', or null for no date. */
  target: string | null;
}

export interface GoalOptions {
  kinds: { kind: string; label: string }[];
  /** Quick picks ('Next year · Oct 2027') and every year for "Pick a year"; values are 'YYYY-MM'. */
  quickYears: { value: string; label: string }[];
  allYears: { value: string; label: string }[];
  nameMax: number;
}

const chipClass = (on: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-medium ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:border-primary'}`;

export function GoalPicker({
  value,
  onChange,
  options,
  idPrefix,
}: {
  value: GoalChoice;
  onChange: (next: GoalChoice) => void;
  options: GoalOptions;
  idPrefix: string;
}) {
  const { kind, name, target } = value;
  const quick = options.quickYears.some((y) => y.value === target);
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="font-semibold">What is this money for?</legend>
        <p className="text-sm text-muted">Optional.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...options.kinds, { kind: 'none', label: 'Not sure yet' }].map((k) => (
            <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => onChange({ ...value, kind: k.kind })} className={chipClass(kind === k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'custom' && (
          <div className="mt-3">
            <label htmlFor={`${idPrefix}-name`} className="block text-sm font-semibold">
              Name your goal
            </label>
            <input
              id={`${idPrefix}-name`}
              value={name}
              maxLength={options.nameMax}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="For example: Wedding, Bike, Trip"
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
            />
            <p className="mt-1 text-xs text-muted">Up to {options.nameMax} characters. No personal details.</p>
          </div>
        )}
      </fieldset>

      {kind && kind !== 'none' && (
        <fieldset>
          <legend className="font-semibold">By when?</legend>
          <p className="text-sm text-muted">Optional.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.quickYears.map((y) => (
              <button key={y.value} type="button" aria-pressed={target === y.value} onClick={() => onChange({ ...value, target: y.value })} className={chipClass(target === y.value)}>
                {y.label}
              </button>
            ))}
            <button type="button" aria-pressed={target === null} onClick={() => onChange({ ...value, target: null })} className={chipClass(target === null)}>
              No date
            </button>
          </div>
          <label htmlFor={`${idPrefix}-year`} className="mt-3 block text-sm font-semibold">
            Or pick a year
          </label>
          <select
            id={`${idPrefix}-year`}
            value={target && !quick ? target : ''}
            onChange={(e) => onChange({ ...value, target: e.target.value || null })}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 sm:w-60"
          >
            <option value="">Choose a year</option>
            {options.allYears.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </fieldset>
      )}
    </div>
  );
}

/** The goal as the APIs take it: null for no goal, kind 'none' to remove one. */
export function goalBody(choice: GoalChoice) {
  if (!choice.kind) return null;
  if (choice.kind === 'none') return { kind: 'none' };
  return { kind: choice.kind, name: choice.kind === 'custom' ? choice.name : undefined, targetMonth: choice.target };
}
