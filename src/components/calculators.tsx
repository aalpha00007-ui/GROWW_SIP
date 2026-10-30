'use client';
// The public calculators (no login): SIP, goal planner and SWP. Inputs on the left, each a number box and a
// slider; results on the right, the big numbers over a simple chart. The maths is in server/calculators.ts.
// "Start this SIP" is the only place a calculator asks for sign-up.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { goalPlan, INFLATION_PCT, sipPlan, swpPlan, yearsAndMonths } from '@/server/calculators';
import { inr } from '@/server/money';

type Unit = 'rupees' | 'years' | 'percent';

interface Spec {
  label: string;
  min: number;
  max: number;
  unit: Unit;
  /** Money moves on a log scale, so ₹500 and ₹50,000 both get room on the slider. */
  log?: boolean;
  step?: number;
}

const MONTHLY: Spec = { label: 'Monthly amount', min: 100, max: 1_00_000, unit: 'rupees', log: true };
const GOAL: Spec = { label: 'Goal amount', min: 10_000, max: 10_00_00_000, unit: 'rupees', log: true };
const START: Spec = { label: 'Starting amount', min: 10_000, max: 10_00_00_000, unit: 'rupees', log: true };
const WITHDRAWAL: Spec = { label: 'Monthly withdrawal', min: 500, max: 10_00_000, unit: 'rupees', log: true };
const YEARS: Spec = { label: 'Time period', min: 1, max: 40, unit: 'years' };
const RETURN: Spec = { label: 'Expected return (p.a.)', min: 1, max: 30, unit: 'percent', step: 0.5 };
// SWP has no division by the rate, so 0% works there.
const SWP_RETURN: Spec = { ...RETURN, min: 0 };

const NOTE = 'Uses an assumed return, not a prediction. Demo tool, not investment advice.';
const SLIDER_STEPS = 1000;
const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** ₹100, ₹1 lakh, ₹10 crore: the ends of a slider. */
function amountWords(n: number): string {
  if (n >= 1e7) return `₹${GROUPED.format(n / 1e7)} crore`;
  if (n >= 1e5) return `₹${GROUPED.format(n / 1e5)} lakh`;
  return inr(n);
}

/** ₹50K, ₹2L, ₹1.5Cr: the chart's axis. */
function shortInr(n: number): string {
  if (n >= 1e7) return `₹${GROUPED.format(n / 1e7)}Cr`;
  if (n >= 1e5) return `₹${GROUPED.format(n / 1e5)}L`;
  if (n >= 1e3) return `₹${GROUPED.format(n / 1e3)}K`;
  return `₹${GROUPED.format(n)}`;
}

function inWords(spec: Spec, value: number): string {
  if (spec.unit === 'rupees') return amountWords(value);
  if (spec.unit === 'years') return `${value} ${value === 1 ? 'year' : 'years'}`;
  return `${value}%`;
}

export function SipCalculator({ signedIn }: { signedIn: boolean }) {
  const [monthly, setMonthly] = useState(5_000);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(12);
  const plan = sipPlan(monthly, years, rate);
  return (
    <Calculator
      inputs={
        <>
          <Field spec={MONTHLY} value={monthly} onChange={setMonthly} />
          <Field spec={YEARS} value={years} onChange={setYears} />
          <Field spec={RETURN} value={rate} onChange={setRate} />
        </>
      }
      results={
        <>
          <Figures hero={{ label: 'Total value', value: inr(plan.value) }} rest={[{ label: 'Invested', value: inr(plan.invested) }, { label: 'Estimated gains', value: inr(plan.gains) }]} />
          <GrowthChart points={plan.byYear} />
          <StartSip signedIn={signedIn} />
        </>
      }
    />
  );
}

export function GoalPlanner({ signedIn }: { signedIn: boolean }) {
  const [goal, setGoal] = useState(10_00_000);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(12);
  const [inflation, setInflation] = useState(false);
  const plan = goalPlan(goal, years, rate, inflation);
  return (
    <Calculator
      inputs={
        <>
          <Field spec={GOAL} value={goal} onChange={setGoal} />
          <Field spec={{ ...YEARS, label: 'Years to the goal' }} value={years} onChange={setYears} />
          <Field spec={RETURN} value={rate} onChange={setRate} />
          <button type="button" role="switch" aria-checked={inflation} onClick={() => setInflation(!inflation)} className="flex min-h-11 w-full items-center justify-between gap-4 text-left">
            <span>
              <span className="block text-[15px] font-medium text-strong">Adjust for inflation</span>
              <span className="block text-sm text-muted">Grows the goal by {INFLATION_PCT}% a year</span>
            </span>
            <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${inflation ? 'bg-primary' : 'bg-muted/50'}`}>
              <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${inflation ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </>
      }
      results={
        <>
          <Figures
            hero={{ label: 'Monthly SIP needed', value: inr(plan.monthly) }}
            rest={[
              { label: 'Total invested', value: inr(plan.invested) },
              { label: inflation ? `Target, with ${INFLATION_PCT}% inflation` : 'Target', value: inr(plan.target) },
            ]}
          />
          <GrowthChart points={plan.byYear} />
          <StartSip signedIn={signedIn} />
        </>
      }
    />
  );
}

export function SwpCalculator() {
  const [start, setStart] = useState(10_00_000);
  const [withdrawal, setWithdrawal] = useState(10_000);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(8);
  const plan = swpPlan(start, withdrawal, years, rate);
  const withdrawn = { label: 'Total withdrawn', value: inr(plan.withdrawn) };
  return (
    <Calculator
      inputs={
        <>
          <Field spec={START} value={start} onChange={setStart} />
          <Field spec={WITHDRAWAL} value={withdrawal} onChange={setWithdrawal} />
          <Field spec={YEARS} value={years} onChange={setYears} />
          <Field spec={SWP_RETURN} value={rate} onChange={setRate} />
        </>
      }
      results={
        <>
          {plan.lastsMonths === null ? (
            <Figures hero={{ label: 'Final balance', value: inr(plan.finalBalance) }} rest={[withdrawn]} />
          ) : (
            <Figures hero={{ label: 'Money lasts', value: yearsAndMonths(plan.lastsMonths) }} rest={[withdrawn]} />
          )}
          <LineChart
            years={plan.byYear.map((p) => p.year)}
            series={[{ name: 'Balance', color: 'var(--primary)', values: plan.byYear.map((p) => p.balance), area: true }]}
          />
        </>
      }
    />
  );
}

/** The three calculators, one tab each. */
export function CalculatorTabs() {
  const path = usePathname();
  const tabs = [
    { label: 'SIP', href: '/calculators/sip' },
    { label: 'Goal planner', href: '/calculators/goal' },
    { label: 'SWP', href: '/calculators/swp' },
  ];
  return (
    <nav aria-label="Calculators" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={path === tab.href ? 'page' : undefined}
          className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
            path === tab.href ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:border-primary'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function Calculator({ inputs, results }: { inputs: React.ReactNode; results: React.ReactNode }) {
  return (
    <div>
      <div className="grid gap-8 rounded-2xl border border-line bg-surface p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="space-y-8">{inputs}</div>
        <div className="min-w-0 space-y-6 lg:border-l lg:border-line lg:pl-12">{results}</div>
      </div>
      <p className="mt-3 text-sm text-muted">{NOTE}</p>
    </div>
  );
}

/** A number box and a slider for one input. Typing applies as soon as the number is in range; leaving the box clamps it. */
function Field({ spec, value, onChange }: { spec: Spec; value: number; onChange: (value: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(spec.max, Math.max(spec.min, n));
  const parse = (text: string) => {
    const n = Number(text.replace(/[,\s₹%]/g, ''));
    if (text.trim() === '' || !Number.isFinite(n)) return null;
    return spec.unit === 'percent' ? Math.round(n * 10) / 10 : Math.round(n);
  };
  const toSlider = (v: number) => (spec.log ? Math.round((SLIDER_STEPS * Math.log(v / spec.min)) / Math.log(spec.max / spec.min)) : v);
  const fromSlider = (position: number) => {
    if (!spec.log) return position;
    // Two significant figures, so the slider lands on ₹5,000 or ₹1,20,000 rather than ₹5,013.
    const raw = spec.min * (spec.max / spec.min) ** (position / SLIDER_STEPS);
    const unit = 10 ** (Math.floor(Math.log10(raw)) - 1);
    return clamp(Math.round(raw / unit) * unit);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-medium text-strong">
          {spec.label}
        </label>
        <div className="flex min-h-11 w-36 shrink-0 items-center gap-1 rounded-lg border border-line bg-primary-soft px-3 sm:w-40">
          {spec.unit === 'rupees' && <span className="text-muted">₹</span>}
          <input
            id={id}
            inputMode={spec.unit === 'percent' ? 'decimal' : 'numeric'}
            value={draft ?? (spec.unit === 'rupees' ? GROUPED.format(value) : String(value))}
            onFocus={() => setDraft(String(value))}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = parse(e.target.value);
              if (n !== null && n >= spec.min && n <= spec.max) onChange(n);
            }}
            onBlur={() => {
              const n = draft === null ? null : parse(draft);
              if (n !== null) onChange(clamp(n));
              setDraft(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-describedby={`${id}-range`}
            className="tabular w-full min-w-0 bg-transparent text-right font-semibold text-strong"
          />
          {spec.unit === 'years' && <span className="text-muted">yr</span>}
          {spec.unit === 'percent' && <span className="text-muted">%</span>}
        </div>
      </div>
      <input
        type="range"
        min={spec.log ? 0 : spec.min}
        max={spec.log ? SLIDER_STEPS : spec.max}
        step={spec.log ? 1 : (spec.step ?? 1)}
        value={toSlider(value)}
        onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
        aria-label={spec.label}
        aria-valuetext={inWords(spec, value)}
        className="mt-3 h-6 w-full cursor-pointer accent-primary"
      />
      <p id={`${id}-range`} className="flex justify-between text-xs text-muted">
        <span>
          <span className="sr-only">From </span>
          {inWords(spec, spec.min)}
        </span>
        <span>
          <span className="sr-only">to </span>
          {inWords(spec, spec.max)}
        </span>
      </p>
    </div>
  );
}

function Figures({ hero, rest }: { hero: { label: string; value: string }; rest: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      <div className="col-span-2">
        <dt className="text-sm text-muted">{hero.label}</dt>
        <dd className="tabular text-4xl font-bold tracking-tight text-strong">{hero.value}</dd>
      </div>
      {rest.map((f) => (
        <div key={f.label}>
          <dt className="text-sm text-muted">{f.label}</dt>
          <dd className="tabular text-xl font-semibold text-strong">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StartSip({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  return (
    <Link
      href={signedIn ? '/explore' : `${path}?auth=signup`}
      scroll={false}
      className="flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-10 font-semibold text-white hover:bg-primary-hover sm:w-fit"
    >
      Start this SIP
    </Link>
  );
}

/** Invested against the estimated value, year by year (SIP and goal planner). */
function GrowthChart({ points }: { points: { year: number; invested: number; value: number }[] }) {
  return (
    <LineChart
      years={points.map((p) => p.year)}
      series={[
        { name: 'Invested', color: 'var(--chart-invested)', values: points.map((p) => p.invested) },
        { name: 'Estimated value', color: 'var(--primary)', values: points.map((p) => p.value), area: true },
      ]}
    />
  );
}

interface Series {
  name: string;
  color: string;
  values: number[];
  area?: boolean;
}

const HEIGHT = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 56 };

/** Rounds a tick gap up to 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * power;
}

/**
 * A small line chart drawn at the container's real width, so its text stays readable on a phone. Hovering
 * shows that year's numbers; screen readers get the same numbers as a table.
 */
function LineChart({ years, series }: { years: number[]; series: Series[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = years.length;
  const step = niceStep(Math.max(1, ...series.flatMap((s) => s.values)) / 4);
  const top = Math.ceil(Math.max(1, ...series.flatMap((s) => s.values)) / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotWidth : 0);
  const y = (v: number) => PAD.top + plotHeight - (v / top) * plotHeight;
  const line = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  // About six year labels at most, and never one crowding the last.
  const every = Math.max(1, Math.ceil((n - 1) / 5));
  const showYear = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= Math.ceil(every / 2));
  const yearText = (year: number) => (year === 0 ? 'Now' : `${year}Y`);

  return (
    <figure>
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={box}
        className="relative touch-pan-y"
        style={{ height: HEIGHT }}
        onPointerMove={(e) => {
          if (plotWidth <= 0 || n < 2) return;
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
          setHover(Math.min(n - 1, Math.max(0, Math.round(((px - PAD.left) / plotWidth) * (n - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true" className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px]">
                  {shortInr(t)}
                </text>
              </g>
            ))}
            {years.map(
              (year, i) =>
                showYear(i) && (
                  <text key={year} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-muted text-[11px]">
                    {yearText(year)}
                  </text>
                ),
            )}
            {series.map(
              (s) =>
                s.area && (
                  <path key={`${s.name}-area`} d={`${line(s.values)}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z`} fill={s.color} fillOpacity={0.1} />
                ),
            )}
            {series.map((s) => (
              <path key={s.name} d={line(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotHeight} stroke="var(--text-muted)" strokeWidth={1} />}
            {series.map((s) => {
              const i = hover ?? n - 1;
              return <circle key={s.name} cx={x(i)} cy={y(s.values[i])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
            })}
          </svg>
        )}
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 w-max rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
            style={{ left: x(hover), transform: x(hover) > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
          >
            <p className="font-semibold text-strong">{hover === 0 ? 'Now' : `After ${hover === 1 ? '1 year' : `${years[hover]} years`}`}</p>
            {series.map((s) => (
              <p key={s.name} className="mt-1 flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <span className="text-muted">{s.name}</span>
                <span className="tabular ml-auto pl-3 font-semibold text-strong">{inr(s.values[hover])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{series.map((s) => s.name).join(' and ')}, year by year</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            {series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year, i) => (
            <tr key={year}>
              <th scope="row">{yearText(year)}</th>
              {series.map((s) => (
                <td key={s.name}>{inr(s.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
