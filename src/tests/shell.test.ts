import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { signUp } from '../server/auth';
import { demoBalance, shellData } from '../server/shell';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('the app shell', () => {
  it('starts every investor at ₹1,00,000; a persona’s history before the demo does not count', async () => {
    const riya = await clonePersona(db, 'riya');
    expect(await demoBalance(db, riya)).toBe(100_000);
    await db.query("INSERT INTO lumpsums (investor_id, fund_id, amount, nav, units) VALUES ($1, 1, 5000, 50, 100)", [riya]);
    expect(await demoBalance(db, riya)).toBe(95_000);
  });

  it('gives a new account six notifications, no cart, and funds and stocks to search', async () => {
    const account = await signUp(db, { username: 'shell-otter-1', pin: '1357' }, 'shell-ip');
    if (account.status !== 200) throw new Error(account.error);
    const shell = await shellData(db, account.investorId, TODAY);
    expect(shell.balance).toBe('₹1,00,000');
    expect(shell.cartCount).toBe(0);
    expect(shell.notifications).toHaveLength(6);
    expect(shell.notifications[0].title).toBe('Start your first SIP');
    expect(shell.suggestions.some((s) => s.kind === 'Fund')).toBe(true);
    expect(shell.suggestions.some((s) => s.kind === 'Stock')).toBe(true);
  });

  it("tells Riya about her next instalment and her goal's progress", async () => {
    const shell = await shellData(db, await clonePersona(db, 'riya'), TODAY);
    expect(shell.notifications.map((n) => n.title)).toEqual([
      'Instalment due', 'Try a market fall', 'Instalment paid', 'Goal milestone', 'New: goals on your SIPs', 'Welcome to the Groww prototype',
    ]);
    expect(shell.notifications[0].text).toBe('₹2,000 for Banyan Flexi Cap Fund on 2 Nov 2026.');
    expect(shell.notifications[3].text).toBe('Home down payment: 7 of 60 instalments paid.');
  });
});
