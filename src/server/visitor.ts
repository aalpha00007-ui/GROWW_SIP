// The demo visitor (PRD F1): "Start as <persona>" copies the persona into a fresh investor, and an
// httpOnly cookie holds that investor's id. Every page and API reads only that investor's rows.
import { cookies } from 'next/headers';
import { getDb } from '../db/pool';
import { isTemplateId } from '../pipeline/loading/personas';

export const VISITOR_COOKIE = 'groww_sip_demo_id';
/** A demo lasts a month; starting again makes a new copy. */
export const VISITOR_MAX_AGE_S = 60 * 60 * 24 * 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Visitor {
  id: string;
  persona: string;
  /** "Riya, 27, salaried" */
  displayName: string;
  /** "Riya" */
  firstName: string;
}

/** The visitor from the cookie, or null when there is none (or it points at nothing, or at a template). */
export async function currentVisitor(): Promise<Visitor | null> {
  const id = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!id || !UUID.test(id) || isTemplateId(id)) return null;
  const [row] = (
    await getDb().query<{ persona_key: string; display_name: string }>('SELECT persona_key, display_name FROM investors WHERE id = $1', [id])
  ).rows;
  if (!row) return null;
  return { id, persona: row.persona_key, displayName: row.display_name, firstName: row.display_name.split(',')[0] };
}
