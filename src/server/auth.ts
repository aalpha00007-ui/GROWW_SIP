// Demo accounts and sessions. An account is a made-up display name, a username and a 4-digit demo PIN:
// never an email, phone, real password, PAN or bank detail. PINs are stored as salted scrypt hashes (a
// password-hashing function of the same family as bcrypt and Argon2, built into Node), never in plain text.
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from '../db/client';
import { clonePersona, isTemplateId } from '../pipeline/loading/personas';
import { findPii } from '../pipeline/retrieval/pii';

export const SESSION_COOKIE = 'groww_sip_session';
export const SESSION_DAYS = 7;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 5;
export const SIGNUPS_PER_IP_PER_HOUR = 5;
/** The demo money every investor starts with. */
export const DEMO_BALANCE = 100_000;

const scryptAsync = promisify(scrypt) as (pin: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

export type AuthResult = { status: 200; investorId: string; token: string } | { status: 400 | 401 | 429; error: string };

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, KEY_LENGTH, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(pin, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A new session: the cookie gets the random token, the database only its hash. */
export async function createSession(db: Db, investorId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO sessions (token_hash, investor_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [
    sha256(token),
    investorId,
  ]);
  return token;
}

/** The investor a session token belongs to, or null when it is unknown or expired. */
export async function sessionInvestor(db: Db, token: string | undefined): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [row] = (
    await db.query<{ investor_id: string }>('SELECT investor_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [sha256(token)])
  ).rows;
  return row?.investor_id ?? null;
}

export async function endSession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

/** "Start as <persona>": a fresh private copy of the persona, signed in. */
export async function startPersona(db: Db, personaKey: string): Promise<{ investorId: string; token: string }> {
  const investorId = await clonePersona(db, personaKey);
  return { investorId, token: await createSession(db, investorId) };
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Ten or more digits, allowing spaces, dots, dashes and a leading +: looks like a phone number. */
const PHONE = /(?:\+?\d[\s.-]?){10,}/;
const CONTACT_MESSAGE = "Please don't use real contact details here.";

/** Null when fine, or the plain-English reason a name or username is refused. */
export function contactDetailsIn(text: string): string | null {
  if (EMAIL.test(text) || PHONE.test(text)) return CONTACT_MESSAGE;
  if (findPii(text).found.length > 0) return "Please don't put personal details here.";
  return null;
}

export const USERNAME = /^[a-z0-9_-]{3,20}$/;

export interface SignUpInput {
  displayName?: unknown;
  username?: unknown;
  pin?: unknown;
  pinConfirm?: unknown;
  agreed?: unknown;
}

/** "Create demo account": a new investor with no SIPs, the demo balance and a demo mandate, signed in. */
export async function signUp(db: Db, input: SignUpInput, ipHash: string): Promise<AuthResult> {
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  if (displayName.length < 2 || displayName.length > 20) return { status: 400, error: 'Use a display name of 2 to 20 characters.' };
  const nameIssue = contactDetailsIn(displayName);
  if (nameIssue) return { status: 400, error: nameIssue };
  const userIssue = contactDetailsIn(username);
  if (userIssue) return { status: 400, error: userIssue };
  if (!USERNAME.test(username)) return { status: 400, error: 'Use a username of 3 to 20 letters, numbers, - or _.' };
  if (typeof input.pin !== 'string' || !/^\d{4}$/.test(input.pin)) return { status: 400, error: 'Make up a 4-digit demo PIN.' };
  if (input.pin !== input.pinConfirm) return { status: 400, error: "The two PINs don't match." };
  if (input.agreed !== true) return { status: 400, error: 'Tick the box to confirm this is a demo.' };

  await db.query("DELETE FROM signup_attempts WHERE created_at < now() - interval '1 day'");
  const [recent] = (
    await db.query<{ n: number }>("SELECT count(*)::int AS n FROM signup_attempts WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'", [ipHash])
  ).rows;
  if (recent.n >= SIGNUPS_PER_IP_PER_HOUR) return { status: 429, error: 'Too many new demo accounts from this network. Try again in an hour.' };
  const taken = await db.query('SELECT 1 FROM accounts WHERE username = $1', [username]);
  if (taken.rows.length) return { status: 400, error: 'That username is taken. Try another, or tap Suggest one.' };

  const pinHash = await hashPin(input.pin);
  const investorId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO investors (id, persona_key, display_name) VALUES ($1, 'account', $2)", [investorId, displayName]);
    await tx.query('INSERT INTO accounts (investor_id, username, pin_hash) VALUES ($1, $2, $3)', [investorId, username, pinHash]);
    await tx.query("INSERT INTO mandates (investor_id, bank_label, method) VALUES ($1, 'Demo Bank ····0000', 'UPI')", [investorId]);
    await tx.query('INSERT INTO signup_attempts (ip_hash) VALUES ($1)', [ipHash]);
  });
  return { status: 200, investorId, token: await createSession(db, investorId) };
}

const WRONG = { status: 401, error: "That username and PIN don't match." } as const;

/** Log in with username + PIN. Five wrong PINs lock the account for five minutes. */
export async function logIn(db: Db, input: { username?: unknown; pin?: unknown }): Promise<AuthResult> {
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const pin = typeof input.pin === 'string' ? input.pin : '';
  if (!username || !/^\d{4}$/.test(pin)) return { status: 400, error: 'Enter your username and 4-digit demo PIN.' };
  const [account] = (
    await db.query<{ investor_id: string; pin_hash: string; locked_minutes: number | null }>(
      `SELECT investor_id, pin_hash,
         CASE WHEN locked_until > now() THEN ceil(extract(epoch FROM locked_until - now()) / 60)::int END AS locked_minutes
       FROM accounts WHERE username = $1`,
      [username],
    )
  ).rows;
  // An unknown username gets the same answer as a wrong PIN, so usernames cannot be probed.
  if (!account) return WRONG;
  if (account.locked_minutes) {
    return { status: 429, error: `Too many wrong PINs. Try again in ${account.locked_minutes} ${account.locked_minutes === 1 ? 'minute' : 'minutes'}.` };
  }
  if (!(await verifyPin(pin, account.pin_hash))) {
    await db.query(
      `UPDATE accounts SET
         failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
         locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END
       WHERE investor_id = $1`,
      [account.investor_id, MAX_FAILED_LOGINS],
    );
    return WRONG;
  }
  await db.query('UPDATE accounts SET failed_logins = 0, locked_until = NULL WHERE investor_id = $1', [account.investor_id]);
  return { status: 200, investorId: account.investor_id, token: await createSession(db, account.investor_id) };
}

/** "Delete my demo account": the investor and everything that hangs off it (SIPs, goals, sessions, events). */
export async function deleteInvestor(db: Db, investorId: string): Promise<void> {
  if (isTemplateId(investorId)) throw new Error('Persona templates cannot be deleted.');
  await db.query('DELETE FROM investors WHERE id = $1', [investorId]);
}

/** A salted hash of the caller's IP, for the sign-up rate limit; the IP itself is never stored. */
export function ipHash(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  return sha256(`${process.env.AUTH_SALT ?? 'groww-sip-demo'}:${ip}`);
}
