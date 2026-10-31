import { describe, expect, it } from 'vitest';
import { clonePersona } from '../pipeline/loading/personas';
import { migrateDatabase } from '../pipeline/loading/seed';
import { pgliteDb } from './pglite-db';

describe('npm run db:migrate on every deploy', () => {
  it('seeds an empty database once, and leaves a seeded one and its visitors alone', async () => {
    const db = pgliteDb();
    const first = await migrateDatabase(db, { today: '2026-10-27' });
    expect(first?.funds).toBeGreaterThan(0);
    expect(first?.personas.map((p) => p.key)).toContain('kabir');
    const visitor = await clonePersona(db, 'kabir');
    expect(await migrateDatabase(db, { today: '2026-10-28' })).toBeNull();
    expect((await db.query('SELECT 1 FROM investors WHERE id = $1', [visitor])).rows).toHaveLength(1);
  }, 120_000);
});
