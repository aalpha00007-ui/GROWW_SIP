import { describe, expect, it } from 'vitest';
import { TEMPLATE_IDS } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { verifyDatabase } from '../pipeline/loading/verify';
import { pgliteDb } from './pglite-db';

// Each test starts its own PGlite database, which can take longer than vitest's 5 s default when the suite runs in parallel.
const PGLITE_TIMEOUT = 60_000;

describe('db:verify', () => {
  it('says what is missing on an empty database', async () => {
    const [tables] = await verifyDatabase(pgliteDb());
    expect(tables).toMatchObject({ name: 'Tables', ok: false });
    expect(tables.detail).toContain('run npm run db:setup');
  }, PGLITE_TIMEOUT);

  it('passes after setup, and catches a lost instalment and a missing function', async () => {
    const db = pgliteDb();
    await setupDatabase(db, { today: '2026-10-27' });
    const checks = await verifyDatabase(db);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.find((c) => c.name === 'Persona riya')?.detail).toBe('3 SIPs, 14 of 14 instalments');

    await db.query(
      'DELETE FROM instalments WHERE id = (SELECT i.id FROM instalments i JOIN sips s ON s.id = i.sip_id WHERE s.investor_id = $1 LIMIT 1)',
      [TEMPLATE_IDS.riya],
    );
    await db.query('DROP FUNCTION visible_nav_history(uuid)');
    const failed = (await verifyDatabase(db)).filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toEqual(['Persona riya', 'visible_nav_history()']);
  }, PGLITE_TIMEOUT);
});
