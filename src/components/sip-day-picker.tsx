'use client';
// The SIP date: a compact button ("Monthly on 6th ▾") that opens a calendar of days 1 to 31, as a popover on desktop and
// a bottom sheet on phones. Days 29 to 31 are shown so the reason is visible, but can't be picked: not every month has
// them. Arrow keys move, Enter or Space picks, and Esc or a click outside closes without changing the date. Dates and
// labels come from the server, from the same schedule the SIP will have once started.
import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  /** The days that can be picked, each with its button text and the next instalment date it would give. */
  days: { value: number; label: string; next: string }[];
  value: number;
  onChange: (day: number) => void;
  /** The demo date: the first instalment is paid when the SIP starts. */
  firstInstalment: string;
}

const ALL_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const PER_ROW = 7;

export function SipDayPicker({ days, value, onChange, firstInstalment }: Props) {
  const [open, setOpen] = useState(false);
  // One tab stop in the grid: the day the arrow keys are on.
  const [cursor, setCursor] = useState(value);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const titleId = useId();
  const panelId = useId();
  const chosen = days.find((d) => d.value === value);
  const lastDay = days[days.length - 1].value;

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function toggle() {
    setCursor(value);
    setOpen(!open);
  }

  function move(day: number) {
    setCursor(day);
    cells.current.get(day)?.focus();
  }

  useEffect(() => {
    if (!open) return;
    cells.current.get(value)?.focus();
    // Pointer down, not click: it closes before anything else on the page reacts, on touch as well as with a mouse.
    const onOutside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close(false);
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
    // Only on opening: the date can't change while it is open without closing it.
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    const steps: Record<string, () => number> = {
      // Left and right run on through the rows and wrap round; up and down stay put at the edge.
      ArrowRight: () => (cursor === lastDay ? 1 : cursor + 1),
      ArrowLeft: () => (cursor === 1 ? lastDay : cursor - 1),
      ArrowDown: () => (cursor + PER_ROW <= lastDay ? cursor + PER_ROW : cursor),
      ArrowUp: () => (cursor - PER_ROW >= 1 ? cursor - PER_ROW : cursor),
      Home: () => 1,
      End: () => lastDay,
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      // Nothing else in here takes focus: leaving is Esc or a pick, so a keyboard user is never lost behind the sheet.
      e.preventDefault();
    } else if (steps[e.key]) {
      e.preventDefault();
      move(steps[e.key]());
    }
  }

  return (
    <div ref={box} className="relative">
      <span className="block text-sm font-medium text-muted">SIP date</span>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`SIP date: ${chosen?.label ?? ''}`}
        className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left font-medium hover:border-primary"
      >
        <span>{chosen?.label}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {chosen && (
        <p aria-live="polite" className="tabular mt-1.5 text-xs">
          First instalment: {firstInstalment} · Next instalment: {chosen.next}
        </p>
      )}

      {open && (
        <>
          <div aria-hidden="true" onClick={() => close(true)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <div
            id={panelId}
            role="dialog"
            aria-labelledby={titleId}
            onKeyDown={onKeyDown}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-full lg:z-30 lg:mt-1 lg:w-80 lg:rounded-xl lg:border lg:border-line lg:p-3"
          >
            <p id={titleId} className="font-semibold">
              Pick your SIP date
            </p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {ALL_DAYS.map((day) => {
                const available = days.some((d) => d.value === day);
                return (
                  <button
                    key={day}
                    ref={(cell) => {
                      if (cell) cells.current.set(day, cell);
                      else cells.current.delete(day);
                    }}
                    type="button"
                    disabled={!available}
                    tabIndex={day === cursor ? 0 : -1}
                    aria-label={available ? `Day ${day}` : `Day ${day}, not available`}
                    aria-pressed={day === value}
                    onClick={() => {
                      onChange(day);
                      close(true);
                    }}
                    className={`tabular flex min-h-11 items-center justify-center rounded-lg border text-sm font-medium ${
                      !available
                        ? 'cursor-not-allowed border-transparent bg-page text-disabled'
                        : day === value
                          ? 'border-primary bg-primary font-bold text-white'
                          : 'border-line bg-surface hover:border-primary'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs">29, 30 and 31: Not available, so every month has this date.</p>
          </div>
        </>
      )}
    </div>
  );
}
