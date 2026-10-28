// Who is signed in: a demo persona copy ("Start as <persona>") or a demo account. The httpOnly session cookie
// holds a random token (server/auth.ts). This is the one source of truth for the visitor's id and name;
// every page and API reads only that investor's rows.
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getDb } from '../db/pool';
import { SESSION_COOKIE, SESSION_DAYS, sessionInvestor } from './auth';

export { SESSION_COOKIE };
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * SESSION_DAYS;

export interface Visitor {
  id: string;
  persona: string;
  /** "Riya, 27, salaried", or a demo account's display name. */
  displayName: string;
  /** "Riya" */
  firstName: string;
  /** A demo account's username; null for a persona copy. */
  username: string | null;
}

/** The signed-in visitor, or null. Cached per request, so the layout and the page share one lookup. */
export const currentVisitor = cache(async (): Promise<Visitor | null> => {
  const db = getDb();
  const id = await sessionInvestor(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const [row] = (
    await db.query<{ persona_key: string; display_name: string; username: string | null }>(
      'SELECT i.persona_key, i.display_name, a.username FROM investors i LEFT JOIN accounts a ON a.investor_id = i.id WHERE i.id = $1',
      [id],
    )
  ).rows;
  if (!row) return null;
  return { id, persona: row.persona_key, displayName: row.display_name, firstName: row.display_name.split(',')[0].trim(), username: row.username };
});
