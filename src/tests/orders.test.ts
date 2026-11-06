// The Orders ledger, notifications that open it and stay read, and the reversible actions: Undo and Resume now.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { startSip } from '../server/funds';
import { homeView } from '../server/home';
import { ordersView } from '../server/orders';
import { markNotificationsRead, shellData } from '../server/shell';
import { loadSip, sipView } from '../server/sip';
import { pauseSip, resumeSip, skipNext, stopSip, undoSkip } from '../server/sip-actions';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

async function riya() {
  const id = await clonePersona(db, 'riya');
  const sips = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id', [id])).rows;
  return { id, banyan: sips[0].id, harbor: sips[1].id, kestrel: sips[2].id };
}
const view = async (id: string, sipId: number, today = TODAY) => sipView((await loadSip(db, id, sipId, today))!, today);

describe('Orders ledger', () => {
  it('lists every instalment across all SIPs, newest first', async () => {
    const r = await riya();
    const { rows, hasNotCollected } = await ordersView(db, r.id, TODAY);
    expect(rows.length).toBeGreaterThan(10);
    expect(new Set(rows.map((o) => o.fund)).size).toBe(3);
    expect(rows.every((o) => o.status === 'Paid' && /^₹/.test(o.amount))).toBe(true);
    expect(rows.map((o) => o.sortDate)).toEqual([...rows.map((o) => o.sortDate)].sort().reverse());
    expect(hasNotCollected).toBe(false);
  });

  it('shows skips and scheduled skips apart, the same as the SIP page', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY);
    await pauseSip(db, r.id, r.banyan, 1, TODAY);
    const { rows } = await ordersView(db, r.id, TODAY);
    const scheduled = rows.filter((o) => o.state === 'scheduled_skip');
    expect(scheduled.map((o) => [o.date, o.status, o.amount])).toEqual([
      ['2 Dec 2026', 'Scheduled skip (paused)', '₹2,000'],
      ['2 Nov 2026', 'Scheduled skip', '₹2,000'],
    ]);
    // Once their dates pass they are plain skips, and no amount was charged.
    const later = await ordersView(db, r.id, '2026-12-10');
    expect(later.rows.filter((o) => o.state === 'skipped').map((o) => [o.date, o.amount])).toEqual([['2 Dec 2026', '—'], ['2 Nov 2026', '—']]);
    expect((await view(r.id, r.banyan, '2026-12-10')).skipsLabel).toBe('2 past skips · 0 scheduled skips');
  });

  it('says when a due date passed with no payment, and never calls it paid', async () => {
    const r = await riya();
    const { rows, hasNotCollected } = await ordersView(db, r.id, '2026-11-06');
    expect(hasNotCollected).toBe(true);
    expect(rows.find((o) => o.state === 'not_collected')).toMatchObject({ date: '2 Nov 2026', amount: '—', status: 'Not collected' });
  });

  it('includes one-time orders, and only this investor sees theirs', async () => {
    const r = await riya();
    await db.query('INSERT INTO lumpsums (investor_id, fund_id, amount, nav, units) VALUES ($1, 1, 5000, 50, 100)', [r.id]);
    expect((await ordersView(db, r.id, TODAY)).rows.find((o) => o.state === 'one_time')).toMatchObject({ status: 'One-time', amount: '₹5,000', sipId: null });
    const other = await riya();
    expect((await ordersView(db, other.id, TODAY)).rows.some((o) => o.state === 'one_time')).toBe(false);
  });
});

describe('Notifications', () => {
  it('"Instalment paid" opens that very instalment in Orders, never an empty page', async () => {
    const r = await riya();
    const paid = (await shellData(db, r.id, TODAY)).notifications.find((n) => n.title === 'Instalment paid')!;
    const [, id] = /^\/orders\?instalment=(\d+)#instalment-\d+$/.exec(paid.href)!;
    const row = (await ordersView(db, r.id, TODAY)).rows.find((o) => o.instalmentId === Number(id));
    expect(row).toMatchObject({ anchor: `instalment-${id}`, state: 'paid' });
    expect(paid.text).toContain(row!.amount);
    expect(paid.text).toContain(row!.date);
  });

  it('keeps read notifications read, for this investor only, and a new event is new', async () => {
    const r = await riya();
    const before = await shellData(db, r.id, TODAY);
    expect(before.notifications.every((n) => !n.read)).toBe(true);
    await markNotificationsRead(db, r.id, { ids: before.notifications.map((n) => n.id) });
    expect((await shellData(db, r.id, TODAY)).notifications.every((n) => n.read)).toBe(true);
    // Reading twice is fine.
    expect(await markNotificationsRead(db, r.id, { ids: before.notifications.map((n) => n.id) })).toMatchObject({ status: 200 });

    const other = await riya();
    expect((await shellData(db, other.id, TODAY)).notifications.every((n) => !n.read)).toBe(true);

    await skipNext(db, r.id, r.banyan, TODAY);
    const after = (await shellData(db, r.id, TODAY)).notifications;
    expect(after.find((n) => n.title === 'Instalment due')?.read).toBe(false);
    expect(after.find((n) => n.title === 'Welcome to the Groww prototype')?.read).toBe(true);
  });

  it('refuses a body it cannot read', async () => {
    const r = await riya();
    for (const body of [{}, { ids: 'all' }, { ids: [1] }, { ids: [''] }, { ids: Array(21).fill('x') }]) {
      expect(await markNotificationsRead(db, r.id, body)).toMatchObject({ status: 400 });
    }
  });
});

describe('Undo a scheduled skip', () => {
  it('puts the instalment back, everywhere', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY);
    expect((await view(r.id, r.banyan)).undoable).toEqual([{ due: '2026-11-02', date: '2 Nov 2026' }]);
    expect(await undoSkip(db, r.id, r.banyan, '2026-11-02', TODAY)).toEqual({ status: 200, message: 'The 2 Nov 2026 instalment is back on.' });
    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({ nextDue: '2 Nov 2026', skipsLabel: '0 past skips · 0 scheduled skips', undoable: [], notes: [] });
    expect(sip.goalHeader).toContain('53 instalments to go');
    expect((await homeView(db, r.id, TODAY)).goals[0].paidLabel).toBe('7 of 60 instalments paid · 53 instalments to go');
  });

  it('keeps the skip on record, as a new event', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY);
    await undoSkip(db, r.id, r.banyan, '2026-11-02', TODAY);
    const kinds = (await db.query<{ kind: string }>('SELECT kind FROM sip_events WHERE sip_id = $1 ORDER BY id', [r.banyan])).rows.map((e) => e.kind);
    expect(kinds).toEqual(['skipped', 'skip_undone']);
  });

  it('can skip again after an undo', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY);
    await undoSkip(db, r.id, r.banyan, '2026-11-02', TODAY);
    expect((await skipNext(db, r.id, r.banyan, TODAY)).status).toBe(200);
    expect((await view(r.id, r.banyan)).nextDue).toBe('2 Dec 2026');
  });

  it('refuses a skip that has passed, a date never skipped, a paused date and a stopped SIP', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY);
    expect((await undoSkip(db, r.id, r.banyan, '2026-11-02', '2026-11-03')).status).toBe(400);
    expect((await undoSkip(db, r.id, r.banyan, '2026-12-02', TODAY)).status).toBe(400);
    expect((await undoSkip(db, r.id, r.banyan, 'soon', TODAY)).status).toBe(400);
    await pauseSip(db, r.id, r.harbor, 1, TODAY);
    const paused = (await view(r.id, r.harbor)).history.find((h) => h.state === 'scheduled_skip');
    expect(paused).toBeDefined();
    expect((await undoSkip(db, r.id, r.harbor, '2026-11-15', TODAY)).status).toBe(400);
    await stopSip(db, r.id, r.banyan, undefined, TODAY);
    expect(await undoSkip(db, r.id, r.banyan, '2026-11-02', TODAY)).toEqual({ status: 400, error: 'This SIP is already stopped.' });
  });

  it("reads someone else's SIP as not found", async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY);
    const other = await riya();
    expect((await undoSkip(db, other.id, r.banyan, '2026-11-02', TODAY)).status).toBe(404);
    expect((await resumeSip(db, other.id, r.banyan, TODAY)).status).toBe(404);
  });
});

describe('Resume now', () => {
  it('ends a pause early, shows the next payable date, and needs no new SIP', async () => {
    const r = await riya();
    await pauseSip(db, r.id, r.banyan, 3, TODAY);
    const paused = await view(r.id, r.banyan);
    expect(paused).toMatchObject({ status: 'paused', resumeNote: 'If you resume now, the next instalment is on 2 Nov 2026.', nextDue: '2 Feb 2027' });
    expect(await resumeSip(db, r.id, r.banyan, TODAY)).toEqual({ status: 200, message: 'Resumed. The next instalment is on 2 Nov 2026.' });
    const sip = await view(r.id, r.banyan);
    expect(sip).toMatchObject({ status: 'active', nextDue: '2 Nov 2026', resumeNote: null, controls: { skip: true, pause: true }, skipsLabel: '0 past skips · 0 scheduled skips' });
    expect(sip.goalHeader).toContain('53 instalments to go');
    const count = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM sips WHERE investor_id = $1', [r.id])).rows[0].n;
    expect(count).toBe(3);
  });

  it('gives back only the paused dates: its own skip and the dates already past stay', async () => {
    const r = await riya();
    await skipNext(db, r.id, r.banyan, TODAY); // 2 Nov
    await pauseSip(db, r.id, r.banyan, 2, TODAY); // 2 Dec and 2 Jan
    expect((await view(r.id, r.banyan)).resumeNote).toBe('If you resume now, the next instalment is on 2 Dec 2026.');
    const day = '2026-12-10'; // 2 Dec has passed by now.
    await resumeSip(db, r.id, r.banyan, day);
    const sip = await view(r.id, r.banyan, day);
    expect(sip).toMatchObject({ status: 'active', nextDue: '2 Jan 2027', skipsLabel: '2 past skips · 0 scheduled skips' });
  });

  it('refuses when not paused, and on a stopped SIP', async () => {
    const r = await riya();
    expect(await resumeSip(db, r.id, r.banyan, TODAY)).toEqual({ status: 400, error: 'This SIP is not paused.' });
    await stopSip(db, r.id, r.banyan, undefined, TODAY);
    expect(await resumeSip(db, r.id, r.banyan, TODAY)).toEqual({ status: 400, error: 'This SIP is already stopped.' });
  });

  it('allows skip and pause again afterwards', async () => {
    const r = await riya();
    await pauseSip(db, r.id, r.banyan, 1, TODAY);
    expect(await skipNext(db, r.id, r.banyan, TODAY)).toEqual({ status: 400, error: 'This SIP is paused. Resume it to skip or pause again.' });
    await resumeSip(db, r.id, r.banyan, TODAY);
    expect((await skipNext(db, r.id, r.banyan, TODAY)).status).toBe(200);
    expect((await pauseSip(db, r.id, r.banyan, 1, TODAY)).status).toBe(200);
  });
});

describe('Skip next asks first', () => {
  it('has the words for the confirm step', async () => {
    const r = await riya();
    expect((await view(r.id, r.banyan)).skipConfirm).toBe("Skip the 2 Nov 2026 instalment? It won't be taken later. You can undo this until that date.");
  });
});

describe('Stopped SIP', () => {
  it('points to a new SIP in the same fund, and says the units stay', async () => {
    const r = await riya();
    await stopSip(db, r.id, r.banyan, undefined, TODAY);
    const sip = await view(r.id, r.banyan);
    expect(sip.fundId).toBeGreaterThan(0);
    expect(sip.notes.join(' ')).toContain('Your units stay invested until you redeem them.');
    const started = await startSip(db, r.id, { fundId: sip.fundId, amount: 1000, frequency: 'monthly', day: 5 }, TODAY);
    expect(started.status).toBe(200);
  });
});
