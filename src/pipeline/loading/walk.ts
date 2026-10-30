// Seeded random walks for made-up NAVs and prices (build spec §7). The same seed always gives
// the same shape, so every database and every test sees the same market.

export const WALK_SEED = 20261026;
/** Days at the end of a fund's history over which the demo fall happens ("the last 4 weeks"). */
export const FALL_DAYS = 28;

export interface WalkSpec {
  start: number;
  /** Annual drift, for example 0.12 for 12%. */
  drift: number;
  /** Annual volatility, for example 0.15 for 15%. */
  vol: number;
  /** Fall over the last FALL_DAYS as a fraction range, or null for no fall. */
  end_fall?: [number, number] | null;
}

export interface WalkPoint {
  date: string;
  value: number;
}

export function randomWalk(spec: WalkSpec, dates: string[], seed: number, decimals: number): WalkPoint[] {
  const rng = mulberry32(seed);
  const normal = normalSampler(rng);
  const steps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    // One step per gap between dates, in years: 1/365 for daily dates, 7/365 for weekly ones.
    const dt = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000 / 365;
    steps.push((spec.drift - spec.vol ** 2 / 2) * dt + spec.vol * Math.sqrt(dt) * normal());
  }

  if (spec.end_fall && steps.length >= FALL_DAYS) {
    // Keep the last weeks' day-to-day noise, but shift them so they add up to exactly the chosen fall.
    const [low, high] = spec.end_fall;
    const fall = low + (high - low) * rng();
    const tail = steps.length - FALL_DAYS;
    const tailSum = steps.slice(tail).reduce((sum, s) => sum + s, 0);
    const shift = (Math.log(1 - fall) - tailSum) / FALL_DAYS;
    for (let i = tail; i < steps.length; i++) steps[i] += shift;
  }

  const scale = 10 ** decimals;
  let logValue = Math.log(spec.start);
  return dates.map((date, i) => {
    if (i > 0) logValue += steps[i - 1];
    return { date, value: Math.round(Math.exp(logValue) * scale) / scale };
  });
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSampler(rng: () => number): () => number {
  return () => {
    const u = rng() || Number.MIN_VALUE;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
}
