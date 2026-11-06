// The one schedule function (pipeline/chunking/schedule.ts), and that every screen and the AI's facts read it.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFactsUnit, type SipFacts } from '../pipeline/chunking/facts';
import { markedDates, paidLabel, sipSchedule, skipsLabel, toGoLabel, type ScheduleInput } from '../pipeline/chunking/schedule';
import { clonePersona } from '../pipeline/loading/personas';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { slotsFor } from '../pipeline/retrieval/slots';
import { changeAmount, pauseSip, setGoal, skipNext, stopSip } from '../server/sip-actions';
import { homeView } from '../server/home';
import { loadSip, sipView } from '../server/sip';
import { shellData } from '../server/shell';
import { startSip } from '../server/funds';
import { pgliteDb } from './pglite-db';
import { setupDatabase } from '../pipeline/loading/seed';
import type { Db } from '../db/client';

/** A SIP started 5 Nov 2026 on the 5th, ₹1,000, first instalment paid, goal Nov 2027: 13 due dates. */
const base: ScheduleInput = {
  startedOn: '2026-11-05',
  dayOfMonth: 5,
  today: '2026-11-05',
  amount: 1000,
  stopped: false,
  goalMonth: '2027-11-01',
  paid: [{ due: '2026-11-05', paidOn: '2026-11-05', amount: 1000 }],
  marked: [],
};

describe('sipSchedule', () => {
  it('starts with every due date paid or payable', () => {
    const s = sipSchedule(base);
    expect(s).toMatchObject({ paid: 1, pastSkipped: 0, scheduledSkips: 0, notCollected: 0, remaining: 12, plannedPayable: 13, nextDue: '2026-12-05' });
    expect(s).toMatchObject({ goalDate: '2027-11-01', goalDatePassed: false, hasPlan: true, putIn: 1000, plannedPutIn: 13000 });
    expect(s.contribution).toBeCloseTo(1 / 13);
  });

  it('amount edit: future instalments take the new amount, and what was paid stays', () => {
    const s = sipSchedule({ ...base, amount: 500 });
    expect(s).toMatchObject({ paid: 1, remaining: 12, putIn: 1000, plannedPutIn: 7000 });
  });

  it('skip: a scheduled skip leaves the plan and is never counted as already skipped', () => {
    const s = sipSchedule({ ...base, marked: [{ date: '2026-12-05', kind: 'skipped' }] });
    expect(s).toMatchObject({ pastSkipped: 0, scheduledSkips: 1, remaining: 11, plannedPayable: 12, nextDue: '2027-01-05', plannedPutIn: 12000 });
    expect(skipsLabel(s)).toBe('0 past skips · 1 scheduled skip');
  });

  it('skip: once its date has passed it becomes a past skip', () => {
    const s = sipSchedule({ ...base, today: '2026-12-06', marked: [{ date: '2026-12-05', kind: 'skipped' }] });
    expect(s).toMatchObject({ pastSkipped: 1, scheduledSkips: 0, remaining: 11, nextDue: '2027-01-05' });
    expect(skipsLabel(s)).toBe('1 past skip · 0 scheduled skips');
  });

  it('a skip due today is still scheduled: today is the boundary', () => {
    const marked = [{ date: '2026-12-05', kind: 'skipped' as const }];
    expect(sipSchedule({ ...base, today: '2026-12-05', marked })).toMatchObject({ pastSkipped: 0, scheduledSkips: 1 });
    expect(sipSchedule({ ...base, today: '2026-12-05' })).toMatchObject({ nextDue: '2026-12-05', notCollected: 0, remaining: 12 });
  });

  it('pause: each paused date is a scheduled skip, and the SIP reads as paused until they pass', () => {
    const marked = [{ date: '2026-12-05', kind: 'paused' as const }, { date: '2027-01-05', kind: 'paused' as const }];
    const s = sipSchedule({ ...base, marked });
    expect(s).toMatchObject({ scheduledSkips: 2, remaining: 10, paused: true, nextDue: '2027-02-05', resumeDate: '2026-12-05' });
    expect(sipSchedule({ ...base, marked, today: '2027-01-06' })).toMatchObject({ pastSkipped: 2, scheduledSkips: 0, paused: false, resumeDate: null });
  });

  it('skip then pause add up, and resume hands back only what the pause took', () => {
    const marked = [
      { date: '2026-12-05', kind: 'skipped' as const },
      { date: '2027-01-05', kind: 'paused' as const },
      { date: '2027-02-05', kind: 'paused' as const },
    ];
    const s = sipSchedule({ ...base, marked });
    expect(s).toMatchObject({ scheduledSkips: 3, remaining: 9, plannedPayable: 10, paused: true });
    expect(s.resumeDate).toBe('2027-01-05'); // Not 2026-12-05: that one was its own skip.
    expect([paidLabel(s), toGoLabel(s), skipsLabel(s)]).toEqual(['1 of 10 instalments paid', '9 instalments to go', '0 past skips · 3 scheduled skips']);
  });

  it('goal-date change: the plan follows the new date, with no separate count to go stale', () => {
    const marked = [{ date: '2027-06-05', kind: 'skipped' as const }];
    expect(sipSchedule({ ...base, marked, goalMonth: '2028-11-01' })).toMatchObject({ remaining: 23, plannedPayable: 24 });
    // A skip after the new goal date is still a scheduled skip, but it takes nothing off the plan.
    expect(sipSchedule({ ...base, marked, goalMonth: '2027-03-01' })).toMatchObject({ remaining: 4, plannedPayable: 5, scheduledSkips: 1 });
    expect(sipSchedule({ ...base, goalMonth: null })).toMatchObject({ remaining: null, plannedPayable: null, plannedPutIn: null, contribution: null, hasPlan: false });
  });

  it('stop: nothing more is due, skips ahead fall away and what was paid stays', () => {
    const s = sipSchedule({
      ...base, today: '2027-01-10', stopped: true, stoppedOn: '2026-11-20',
      marked: [{ date: '2026-12-05', kind: 'skipped' }, { date: '2027-01-05', kind: 'paused' }],
    });
    expect(s).toMatchObject({ scheduledSkips: 0, pastSkipped: 0, remaining: 0, plannedPayable: 1, nextDue: null, upcoming: [], paused: false, hasPlan: false, plannedPutIn: 1000 });
    expect(s.notCollected).toBe(0);
    expect(paidLabel(s)).toBe('1 instalment paid');
  });

  it('a skip marked before the stop stays a past skip', () => {
    const s = sipSchedule({ ...base, today: '2027-02-10', stopped: true, stoppedOn: '2027-01-20', marked: [{ date: '2026-12-05', kind: 'skipped' }] });
    expect(s).toMatchObject({ pastSkipped: 1, notCollected: 1 }); // 5 Jan passed unpaid before the stop.
  });

  it('a due date that passes with no payment is its own bucket, so the counts always add up', () => {
    const s = sipSchedule({ ...base, today: '2027-02-10', marked: [{ date: '2027-01-05', kind: 'skipped' }] });
    expect(s).toMatchObject({ paid: 1, pastSkipped: 1, notCollected: 2, remaining: 9, nextDue: '2027-03-05' });
    expect(s.paid + s.pastSkipped + s.scheduledSkips + s.notCollected + s.remaining!).toBe(13);
    expect(s.rows.map((r) => [r.due, r.state])).toEqual([
      ['2027-02-05', 'not_collected'], ['2027-01-05', 'skipped'], ['2026-12-05', 'not_collected'], ['2026-11-05', 'paid'],
    ]);
  });

  it('a first instalment paid ahead of its due date counts once', () => {
    const s = sipSchedule({ ...base, startedOn: '2026-11-03', today: '2026-11-03', paid: [{ due: '2026-11-05', paidOn: '2026-11-03', amount: 1000 }] });
    expect(s).toMatchObject({ paid: 1, remaining: 12, nextDue: '2026-12-05', notCollected: 0 });
    expect(s.firstPaid).toEqual({ due: '2026-11-05', paidOn: '2026-11-03', amount: 1000 });
    expect(s.rows[0]).toMatchObject({ date: '2026-11-03', due: '2026-11-05', state: 'paid' });
  });

  it('a past goal date ends the plan: no "of N", no "to go", and the SIP can still run on', () => {
    const s = sipSchedule({ ...base, today: '2027-12-02', goalMonth: '2027-11-01' });
    expect(s).toMatchObject({ goalDatePassed: true, hasPlan: false, remaining: 0, nextDue: '2027-12-05' });
    expect(paidLabel(s)).toBe('1 instalment paid');
    expect(toGoLabel(s)).toBeNull();
  });

  it('never goes negative, whatever the goal date', () => {
    const s = sipSchedule({ ...base, goalMonth: '2026-10-01', marked: [{ date: '2026-12-05', kind: 'skipped' }, { date: '2027-01-05', kind: 'paused' }] });
    expect(s.remaining).toBe(0);
    expect(s.plannedPayable).toBe(1);
  });

  it('works across month ends and leap years', () => {
    const s = sipSchedule({ ...base, startedOn: '2028-01-31', dayOfMonth: 28, today: '2028-01-31', goalMonth: '2028-03-01', paid: [{ due: '2028-02-28', paidOn: '2028-01-31', amount: 1000 }] });
    expect(s).toMatchObject({ nextDue: '2028-03-28', remaining: 1, plannedPayable: 2, notCollected: 0 });
  });
});

describe('markedDates', () => {
  it('reads skips and pauses, and takes undone ones back off', () => {
    expect(
      markedDates([
        { kind: 'skipped', detail: { due_on: '2026-12-05' } },
        { kind: 'paused', detail: { due_dates: ['2027-01-05', '2027-02-05'] } },
        { kind: 'skip_undone', detail: { due_on: '2026-12-05' } },
        { kind: 'resumed', detail: { due_dates: ['2027-02-05'] } },
      ]),
    ).toEqual([{ date: '2027-01-05', kind: 'paused' }]);
  });
});

describe('every screen and the AI read the same schedule', () => {
  const DAY = '2026-11-05';
  let db: Db;
  let visitor: string;
  let sipId: number;

  // The QA scenario: a SIP, lowered to ₹500, Dec skipped, Jan and Feb paused, the goal moved to Nov 2027.
  beforeAll(async () => {
    db = pgliteDb();
    await setupDatabase(db, { today: '2026-10-27' });
    visitor = await clonePersona(db, 'kabir');
    const started = await startSip(
      db, visitor,
      { fundId: 1, amount: 1000, frequency: 'monthly', day: 5, goal: { kind: 'home', targetMonth: '2031-03' }, goalStep: 'saved' },
      DAY,
    );
    if (started.status !== 200) throw new Error(started.error);
    sipId = started.id;
    expect((await changeAmount(db, visitor, sipId, 500, DAY)).status).toBe(200);
    expect((await skipNext(db, visitor, sipId, DAY)).status).toBe(200);
    expect((await pauseSip(db, visitor, sipId, 2, DAY)).status).toBe(200);
    expect((await setGoal(db, visitor, sipId, { kind: 'home', targetMonth: '2027-11' }, DAY)).status).toBe(200);
  }, 120_000);

  it('tells one story on the SIP page, the goal card, the notification, the history and the AI facts', async () => {
    const state = await loadSip(db, visitor, sipId, DAY);
    const sip = sipView(state!, DAY);
    expect(sip.goalHeader).toContain('9 instalments to go');
    expect(sip.paidLabel).toBe('1 of 10 instalments paid · 9 instalments to go');
    expect(sip.skipsLabel).toBe('0 past skips · 3 scheduled skips');
    expect(sip.contribution).toBe('₹1,000 of ₹5,500 planned');

    const card = (await homeView(db, visitor, DAY)).goals.find((g) => g.sips.some((s) => s.id === sipId))!;
    expect(card.paidLabel).toBe(sip.paidLabel);
    expect(card.skipsLabel).toBe(sip.skipsLabel);
    expect(card.planned).toBe('₹5,500');

    const shell = await shellData(db, visitor, DAY);
    const goal = shell.notifications.find((n) => n.title === 'Goal milestone')!;
    expect(goal.text).toContain('of 10 instalments paid');

    const lookup = await retrieveFacts(db, visitor, sipId, DAY);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    expect(lookup.facts).toMatchObject({
      instalments_paid: 1, instalments_skipped: 0, scheduled_skips: 3, instalments_planned: 10, instalments_to_go: 9, planned_put_in: 5500,
    });
    expect(lookup.goalLine).toContain('1 of 10 paid');
    expect(lookup.unit.text).toContain('- Instalments skipped: 0');
    expect(lookup.unit.text).toContain('- Scheduled skips: 3');
    expect(lookup.unit.text).toContain('- Instalments planned: 10 (9 to go)');
    expect(lookup.unit.kinds.instalments).toEqual(expect.arrayContaining(['3', '10', '9']));

    const value = (name: string) => slotsFor(lookup.facts, { pause: false }).find((s) => s.name === name)?.values.en;
    expect(value('instalments_to_go')).toBe('9 instalments still to come');
    expect(value('instalments_skipped')).toBe('no instalments skipped');
    expect(value('scheduled_skips')).toBe('3 instalments set to be skipped');
  });

  it('keeps telling one story after the skips have passed', async () => {
    const later = '2027-03-01';
    const sip = sipView((await loadSip(db, visitor, sipId, later))!, later);
    expect(sip.skipsLabel).toBe('3 past skips · 0 scheduled skips');
    const card = (await homeView(db, visitor, later)).goals.find((g) => g.sips.some((s) => s.id === sipId))!;
    expect(card.skipsLabel).toBe(sip.skipsLabel);
    expect(card.paidLabel).toBe(sip.paidLabel);
  });

  it('a stopped SIP drops its plan everywhere at once', async () => {
    const other = await clonePersona(db, 'kabir');
    const started = await startSip(db, other, { fundId: 1, amount: 1000, frequency: 'monthly', day: 5, goal: { kind: 'home', targetMonth: '2027-11' }, goalStep: 'saved' }, DAY);
    if (started.status !== 200) throw new Error(started.error);
    expect((await skipNext(db, other, started.id, DAY)).status).toBe(200);
    expect((await stopSip(db, other, started.id, undefined, DAY)).status).toBe(200);
    const sip = sipView((await loadSip(db, other, started.id, DAY))!, DAY);
    expect(sip).toMatchObject({ paidLabel: '1 instalment paid', skipsLabel: '0 past skips · 0 scheduled skips', contribution: null, nextDue: null });
    const lookup = await retrieveFacts(db, other, started.id, DAY);
    expect(lookup.status === 'stopped' && lookup.facts).toMatchObject({ scheduled_skips: 0, instalments_to_go: 0, planned_put_in: 1000 });
  });
});

describe('the AI facts carry the same fields', () => {
  it('leaves "Scheduled skips" out when there are none, so a plain SIP reads as before', () => {
    const facts = {
      sip_id: 1, today: '2026-10-27', as_of: '2026-10-27', fund_name: 'F', fund_category: 'Equity', amount: 2000, months_invested: 7, instalments_paid: 7,
      instalments_skipped: 0, scheduled_skips: 0, invested: 14000, current_value: 12000, worst_fall_since_start_pct: -14, next_due_date: '2026-11-02',
      goal: { name: 'Home', target_month: '2031-03-01' }, instalments_planned: 60, instalments_to_go: 53, planned_put_in: 120000,
    } satisfies SipFacts;
    expect(buildFactsUnit(facts).text).not.toContain('Scheduled skips');
  });
});
