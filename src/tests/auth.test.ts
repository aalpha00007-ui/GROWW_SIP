import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { TEMPLATE_IDS } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { contactDetailsIn, createSession, deleteInvestor, endSession, logIn, sessionInvestor, signUp, startPersona, verifyPin } from '../server/auth';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;
let ipCounter = 0;
const freshIp = () => `ip-${++ipCounter}`;

const account = (over: Record<string, unknown> = {}) => ({
  displayName: 'Asha',
  username: `calm-tiger-${++ipCounter}`,
  pin: '4821',
  pinConfirm: '4821',
  agreed: true,
  ...over,
});

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('Create demo account', () => {
  it('creates an investor with no SIPs, a demo mandate and a session, and hashes the PIN', async () => {
    const input = account();
    const result = await signUp(db, input, freshIp());
    if (result.status !== 200) throw new Error(result.error);
    expect(await sessionInvestor(db, result.token)).toBe(result.investorId);

    const [row] = (await db.query<{ username: string; pin_hash: string }>('SELECT username, pin_hash FROM accounts WHERE investor_id = $1', [result.investorId])).rows;
    expect(row.username).toBe(input.username);
    expect(row.pin_hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(row.pin_hash).not.toContain('4821');
    expect(await verifyPin('4821', row.pin_hash)).toBe(true);
    expect(await verifyPin('4822', row.pin_hash)).toBe(false);

    const sips = (await db.query('SELECT 1 FROM sips WHERE investor_id = $1', [result.investorId])).rows;
    expect(sips).toHaveLength(0);
    const mandates = (await db.query<{ bank_label: string }>('SELECT bank_label FROM mandates WHERE investor_id = $1', [result.investorId])).rows;
    expect(mandates).toEqual([{ bank_label: 'Demo Bank ····0000' }]);
    // The session cookie's token is never stored, only its hash.
    const stored = (await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE investor_id = $1', [result.investorId])).rows;
    expect(stored[0].token_hash).not.toBe(result.token);
  });

  it('blocks email- and phone-like names, and checks every field', async () => {
    const contact = { status: 400, error: "Please don't use real contact details here." };
    expect(await signUp(db, account({ username: 'asha@mail.com' }), freshIp())).toEqual(contact);
    expect(await signUp(db, account({ displayName: 'asha@mail.com' }), freshIp())).toEqual(contact);
    expect(await signUp(db, account({ username: '9876543210' }), freshIp())).toEqual(contact);
    expect(await signUp(db, account({ displayName: '+91 98765 43210' }), freshIp())).toEqual(contact);
    expect(contactDetailsIn('ABCDE1234F')).toBe("Please don't put personal details here.");
    expect((await signUp(db, account({ displayName: 'A' }), freshIp())).status).toBe(400);
    expect((await signUp(db, account({ username: 'ab' }), freshIp())).status).toBe(400);
    expect((await signUp(db, account({ username: 'no spaces!' }), freshIp())).status).toBe(400);
    expect(await signUp(db, account({ pin: '12a4', pinConfirm: '12a4' }), freshIp())).toEqual({ status: 400, error: 'Make up a 4-digit demo PIN.' });
    expect(await signUp(db, account({ pinConfirm: '0000' }), freshIp())).toEqual({ status: 400, error: "The two PINs don't match." });
    expect((await signUp(db, account({ agreed: false }), freshIp())).status).toBe(400);
  });

  it('keeps usernames unique, ignoring case', async () => {
    await signUp(db, account({ username: 'river-otter-7' }), freshIp());
    expect((await signUp(db, account({ username: 'River-Otter-7' }), freshIp())).status).toBe(400);
  });

  it('allows 5 sign-ups an hour from one network, then refuses', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await signUp(db, account(), ip)).status).toBe(200);
    expect((await signUp(db, account(), ip)).status).toBe(429);
    expect((await signUp(db, account(), freshIp())).status).toBe(200);
  });
});

describe('Log in', () => {
  it('logs in with the right PIN and gives an unknown user the same answer as a wrong PIN', async () => {
    const input = account();
    await signUp(db, input, freshIp());
    expect((await logIn(db, { username: input.username.toUpperCase(), pin: '4821' })).status).toBe(200);
    expect(await logIn(db, { username: input.username, pin: '0000' })).toEqual({ status: 401, error: "That username and PIN don't match." });
    expect(await logIn(db, { username: 'nobody-here', pin: '0000' })).toEqual({ status: 401, error: "That username and PIN don't match." });
  });

  it('locks log-in for 5 minutes after 5 wrong PINs, even for the right PIN', async () => {
    const input = account();
    await signUp(db, input, freshIp());
    for (let i = 0; i < 5; i++) await logIn(db, { username: input.username, pin: '0000' });
    expect(await logIn(db, { username: input.username, pin: '4821' })).toEqual({ status: 429, error: 'Too many wrong PINs. Try again in 5 minutes.' });
    await db.query("UPDATE accounts SET locked_until = now() - interval '1 second' WHERE username = $1", [input.username]);
    expect((await logIn(db, { username: input.username, pin: '4821' })).status).toBe(200);
  });
});

describe('Sessions and deleting an account', () => {
  it('ends a session, and does not accept an expired one', async () => {
    const { investorId, token } = await startPersona(db, 'riya');
    expect(await sessionInvestor(db, token)).toBe(investorId);
    await endSession(db, token);
    expect(await sessionInvestor(db, token)).toBeNull();

    const old = await createSession(db, investorId);
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE investor_id = $1", [investorId]);
    expect(await sessionInvestor(db, old)).toBeNull();
  });

  it('deletes the account and all its data, and never a persona template', async () => {
    const result = await signUp(db, account(), freshIp());
    if (result.status !== 200) throw new Error(result.error);
    await deleteInvestor(db, result.investorId);
    for (const table of ['investors WHERE id', 'accounts WHERE investor_id', 'sessions WHERE investor_id', 'mandates WHERE investor_id']) {
      expect((await db.query(`SELECT 1 FROM ${table} = $1`, [result.investorId])).rows).toHaveLength(0);
    }
    await expect(deleteInvestor(db, TEMPLATE_IDS.riya)).rejects.toThrow('cannot be deleted');
  });
});
