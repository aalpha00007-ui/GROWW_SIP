import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { TEMPLATE_IDS } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { allowUsernameCheck, checkUsername, contactDetailsIn, createSession, deleteInvestor, endSession, logIn, sessionInvestor, setDisplayName, signUp, startPersona, verifyPin } from '../server/auth';
import { DEMOS, FEATURE_TRIES } from '../server/demos';
import { exploreFunds } from '../server/funds';
import { PERSONA_KEYS } from '../pipeline/loading/raw';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;
let ipCounter = 0;
const freshIp = () => `ip-${++ipCounter}`;

const account = (over: Record<string, unknown> = {}) => ({
  username: `calm-tiger-${++ipCounter}`,
  pin: '4821',
  ...over,
});

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('Step 1: the username', () => {
  it('says whether a username is new or taken, ignoring case and spaces', async () => {
    const input = account();
    expect(await checkUsername(db, { username: input.username })).toEqual({ status: 200, exists: false });
    await signUp(db, input, freshIp());
    expect(await checkUsername(db, { username: ` ${input.username.toUpperCase()} ` })).toEqual({ status: 200, exists: true });
  });

  it('lets one network check 20 usernames every 10 minutes, so nobody can list the accounts', () => {
    const start = Date.parse('2026-10-30T10:00:00Z');
    for (let i = 0; i < 20; i++) expect(allowUsernameCheck('net-a', start + i * 1000)).toBe(true);
    expect(allowUsernameCheck('net-a', start + 30_000)).toBe(false);
    // Another network is not affected, and the first can try again once the window has passed.
    expect(allowUsernameCheck('net-b', start + 30_000)).toBe(true);
    expect(allowUsernameCheck('net-a', start + 10 * 60_000 + 1000)).toBe(true);
  });

  it('blocks email- and phone-like usernames before any PIN is asked for', async () => {
    const contact = { status: 400, error: "Please don't use real contact details here." };
    expect(await checkUsername(db, { username: 'asha@mail.com' })).toEqual(contact);
    expect(await checkUsername(db, { username: '9876543210' })).toEqual(contact);
    expect(await checkUsername(db, { username: '+91 98765 43210' })).toEqual(contact);
    expect((await checkUsername(db, { username: 'ab' })).status).toBe(400);
    expect((await checkUsername(db, {})).status).toBe(400);
  });
});

describe('Create demo account', () => {
  it('creates an investor with no SIPs, a demo mandate and a session, and hashes the PIN', async () => {
    const input = account();
    const result = await signUp(db, input, freshIp());
    if (result.status !== 200) throw new Error(result.error);
    expect(await sessionInvestor(db, result.token)).toBe(result.investorId);

    const [row] = (await db.query<{ username: string; pin_hash: string }>('SELECT username, pin_hash FROM accounts WHERE investor_id = $1', [result.investorId])).rows;
    expect(row.username).toBe(input.username);
    // The display name starts as the username.
    const [investor] = (await db.query<{ display_name: string }>('SELECT display_name FROM investors WHERE id = $1', [result.investorId])).rows;
    expect(investor.display_name).toBe(input.username);
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

  it('blocks email- and phone-like usernames, and checks the username and PIN', async () => {
    const contact = { status: 400, error: "Please don't use real contact details here." };
    expect(await signUp(db, account({ username: 'asha@mail.com' }), freshIp())).toEqual(contact);
    expect(await signUp(db, account({ username: '9876543210' }), freshIp())).toEqual(contact);
    expect(contactDetailsIn('ABCDE1234F')).toBe("Please don't put personal details here.");
    expect((await signUp(db, account({ username: 'ab' }), freshIp())).status).toBe(400);
    expect((await signUp(db, account({ username: 'no spaces!' }), freshIp())).status).toBe(400);
    expect(await signUp(db, account({ pin: '12a4' }), freshIp())).toEqual({ status: 400, error: 'Make up a 4-digit demo PIN.' });
    expect(await signUp(db, account({ pin: '123' }), freshIp())).toEqual({ status: 400, error: 'Make up a 4-digit demo PIN.' });
  });

  it('lets a demo account change its display name, never to contact details', async () => {
    const result = await signUp(db, account(), freshIp());
    if (result.status !== 200) throw new Error(result.error);
    expect(await setDisplayName(db, result.investorId, { displayName: '  Asha  ' })).toEqual({ status: 200 });
    const name = async () => (await db.query<{ display_name: string }>('SELECT display_name FROM investors WHERE id = $1', [result.investorId])).rows[0].display_name;
    expect(await name()).toBe('Asha');
    expect(await setDisplayName(db, result.investorId, { displayName: 'asha@mail.com' })).toEqual({ status: 400, error: "Please don't use real contact details here." });
    expect((await setDisplayName(db, result.investorId, { displayName: 'A' })).status).toBe(400);
    // The header shows the part before the first comma, so it can't be empty.
    expect((await setDisplayName(db, result.investorId, { displayName: ', ab' })).status).toBe(400);
    expect(await name()).toBe('Asha');
    // A persona copy keeps its name, and is told so.
    const persona = await startPersona(db, 'riya');
    expect(await setDisplayName(db, persona.investorId, { displayName: 'Someone' })).toEqual({ status: 400, error: 'Only a demo account can change its display name.' });
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
  it('works again after logging out: new account, log out, log in', async () => {
    const input = account();
    const created = await signUp(db, input, freshIp());
    if (created.status !== 200) throw new Error(created.error);
    await endSession(db, created.token);
    expect(await sessionInvestor(db, created.token)).toBeNull();
    const again = await logIn(db, input);
    if (again.status !== 200) throw new Error(again.error);
    expect(again.investorId).toBe(created.investorId);
  });

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

describe('The three demos on the landing page', () => {
  it('offers Kabir, Riya and Arjun, each a fresh private copy with its own sign-in', async () => {
    expect(DEMOS.map((d) => d.key)).toEqual(['kabir', 'riya', 'arjun']);
    // The other personas stay in the seed data for tests and evals.
    expect(PERSONA_KEYS).toEqual(expect.arrayContaining(['meera', 'sana', 'vikram', 'dev']));
    for (const demo of DEMOS) {
      const first = await startPersona(db, demo.key);
      const second = await startPersona(db, demo.key);
      expect(first.investorId).not.toBe(second.investorId);
      expect(await sessionInvestor(db, first.token)).toBe(first.investorId);
      const [row] = (await db.query<{ persona_key: string; display_name: string }>('SELECT persona_key, display_name FROM investors WHERE id = $1', [first.investorId])).rows;
      expect(row.persona_key).toBe(demo.key);
      expect(row.display_name.split(',')[0]).toBe(demo.name.split(',')[0]);
    }
  });

  it("sends the More menu's three tries to the right demo and page", async () => {
    expect(FEATURE_TRIES.map((t) => [t.persona, t.href])).toEqual([
      ['kabir', expect.stringMatching(/^\/fund\/\d+$/)],
      ['riya', '/dashboard'],
      ['arjun', '/sips'],
    ]);
    // Kabir's try opens the first of Explore's popular funds, where the order card has the goal row.
    const kabir = await startPersona(db, 'kabir');
    const { popular } = await exploreFunds(db, kabir.investorId);
    expect(FEATURE_TRIES[0].href).toBe(`/fund/${popular[0].id}`);
  });
});
