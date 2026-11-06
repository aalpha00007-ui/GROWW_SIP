import { describe, expect, it } from 'vitest';
import { ASSUMPTIONS, DOWNSIDE_PCT, goalPlan, monthlyRate, returnScenarios, sipFutureValue, sipPlan, swpPlan, yearsAndMonths } from '../server/calculators';
import { inr } from '../server/money';

describe('SIP calculator', () => {
  it('₹5,000 a month for 10 years at 12% grows to ₹11,61,695', () => {
    const plan = sipPlan(5000, 10, 12);
    expect(inr(plan.value)).toBe('₹11,61,695');
    expect(plan.invested).toBe(6_00_000);
    expect(inr(plan.gains)).toBe('₹5,61,695');
  });

  it('uses i = annual % / 12 / 100 and charts every year from 0', () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 12);
    const plan = sipPlan(1000, 3, 10);
    expect(plan.byYear.map((p) => p.year)).toEqual([0, 1, 2, 3]);
    expect(plan.byYear[0]).toEqual({ year: 0, invested: 0, value: 0 });
    expect(plan.byYear[3].value).toBe(plan.value);
    expect(sipFutureValue(1000, 24, 0)).toBe(24_000);
  });
});

describe('Scenarios next to every estimate', () => {
  it('shows the chosen rate, 0% and a downside', () => {
    const [mine, zero, down] = returnScenarios(5000, 10, 12);
    expect(mine).toEqual({ label: '12% a year, your rate', value: sipPlan(5000, 10, 12).value });
    expect(zero).toEqual({ label: '0% a year', value: 6_00_000 });
    expect(down.label).toBe('-5% a year, a downside');
    // A downside loses money against what was put in.
    expect(down.value!).toBeLessThan(6_00_000);
    expect(down.value!).toBeGreaterThan(0);
  });

  it('has no estimate until a rate is chosen, and 0% and the downside still show', () => {
    const [mine, zero, down] = returnScenarios(1000, 5, null);
    expect(mine).toEqual({ label: 'Your rate: pick one', value: null });
    expect(zero.value).toBe(60_000);
    expect(down.value).not.toBeNull();
  });

  it('the downside is below zero, and the assumptions name timing and compounding', () => {
    expect(DOWNSIDE_PCT).toBeLessThan(0);
    expect(ASSUMPTIONS).toContain('start of its month');
    expect(ASSUMPTIONS).toContain('compounds monthly');
  });
});

describe('Goal planner', () => {
  it('₹10,00,000 in 10 years at 12% needs ₹4,304 a month', () => {
    const plan = goalPlan(10_00_000, 10, 12, false);
    expect(plan.monthly).toBe(4304);
    expect(plan.target).toBe(10_00_000);
    expect(plan.invested).toBe(4304 * 120);
  });

  it('never asks for ₹0 a month, even for a small goal far off at a high return', () => {
    const plan = goalPlan(10_000, 40, 30, false);
    expect(plan.monthly).toBe(1);
    expect(plan.invested).toBe(480);
  });

  it('grows the target by 6% a year when adjusting for inflation', () => {
    const plan = goalPlan(10_00_000, 10, 12, true);
    expect(Math.round(plan.target)).toBe(Math.round(10_00_000 * 1.06 ** 10));
    expect(plan.monthly).toBe(Math.round(plan.target / sipFutureValue(1, 120, 12)));
  });
});

describe('SWP calculator', () => {
  it('₹10,00,000 with ₹10,000 a month at 0% lasts 8 years 4 months', () => {
    const plan = swpPlan(10_00_000, 10_000, 10, 0);
    expect(plan.lastsMonths).toBe(100);
    expect(yearsAndMonths(plan.lastsMonths!)).toBe('8 years 4 months');
    expect(plan.withdrawn).toBe(10_00_000);
    expect(plan.finalBalance).toBe(0);
    expect(plan.byYear.at(-1)).toEqual({ year: 10, balance: 0 });
  });

  it('lasts the whole time when the return covers the withdrawals, and says what is left', () => {
    const plan = swpPlan(10_00_000, 5_000, 10, 8);
    expect(plan.lastsMonths).toBeNull();
    expect(plan.withdrawn).toBe(5_000 * 120);
    expect(plan.finalBalance).toBeGreaterThan(10_00_000);
    expect(plan.byYear).toHaveLength(11);
  });

  it('applies balance × (1+i) − withdrawal each month', () => {
    const i = monthlyRate(8);
    const plan = swpPlan(1_00_000, 1_000, 1, 8);
    let balance = 1_00_000;
    for (let m = 0; m < 12; m++) balance = balance * (1 + i) - 1_000;
    expect(plan.finalBalance).toBeCloseTo(balance, 6);
  });

  it('writes durations plainly', () => {
    expect(yearsAndMonths(12)).toBe('1 year');
    expect(yearsAndMonths(5)).toBe('5 months');
    expect(yearsAndMonths(0)).toBe('0 months');
    expect(yearsAndMonths(25)).toBe('2 years 1 month');
  });
});
