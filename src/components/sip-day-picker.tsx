'use client';
// The SIP date as a calendar-style grid of days 1 to 31. Real radio buttons underneath, so arrow keys, screen readers and
// touch all work without extra code. Days 29 to 31 are shown so the reason is visible, but can't be picked: not every
// month has them. Next instalment dates come from the server, from the same schedule the SIP will have once started.
interface Props {
  /** The days that can be picked, each with the next instalment date it would give. */
  days: { value: number; next: string }[];
  value: number;
  onChange: (day: number) => void;
  /** The demo date: the first instalment is paid when the SIP starts. */
  firstInstalment: string;
}

const ALL_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function SipDayPicker({ days, value, onChange, firstInstalment }: Props) {
  const chosen = days.find((d) => d.value === value);
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-muted">SIP date</legend>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {ALL_DAYS.map((day) => {
          const open = days.some((d) => d.value === day);
          return (
            <label key={day} className={`relative block ${open ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <input
                type="radio"
                name="sip-day"
                value={day}
                checked={day === value}
                disabled={!open}
                aria-label={open ? `Day ${day}` : `Day ${day}, not available`}
                onChange={() => onChange(day)}
                className="peer sr-only"
              />
              <span
                className={`tabular flex min-h-11 items-center justify-center rounded-lg border text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
                  !open
                    ? 'border-transparent bg-page text-disabled'
                    : day === value
                      ? 'border-primary bg-primary font-bold text-white'
                      : 'border-line bg-surface hover:border-primary'
                }`}
              >
                {day}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">29, 30 and 31: Not available, so every month has this date.</p>
      {chosen && (
        <p aria-live="polite" className="tabular mt-1.5 text-sm font-medium text-strong">
          First instalment: {firstInstalment} · Next instalment: {chosen.next}
        </p>
      )}
    </fieldset>
  );
}
