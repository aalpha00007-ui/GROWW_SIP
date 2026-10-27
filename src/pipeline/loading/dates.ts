// Dates travel as 'YYYY-MM-DD' strings so they sort as text and never shift with the server's time zone.

const DAY_MS = 86_400_000;

/** Today's date in India, where the demo runs. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

export function addDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** Adds calendar months, keeping the day where it exists and clamping to month end where it doesn't. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = index - y * 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(y, m, Math.min(day, lastDay))));
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Every date from start to end, both included. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** The first instalment date on or after the SIP's start. */
export function firstDueDate(startedOn: string, dayOfMonth: number): string {
  const sameMonth = `${startedOn.slice(0, 7)}-${String(dayOfMonth).padStart(2, '0')}`;
  return sameMonth < startedOn ? addMonths(sameMonth, 1) : sameMonth;
}

/** Monthly instalment dates from the SIP's start up to and including `until`. */
export function monthlyDueDates(startedOn: string, dayOfMonth: number, until: string): string[] {
  const dates: string[] = [];
  for (let d = firstDueDate(startedOn, dayOfMonth); d <= until; d = addMonths(d, 1)) dates.push(d);
  return dates;
}

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}
