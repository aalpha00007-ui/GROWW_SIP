import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../db/client';
import { wrapPglite } from '../db/e2e';

/** An in-memory Postgres behind the same Db interface as Neon, for tests. */
export function pgliteDb(pg: PGlite = new PGlite()): Db {
  return wrapPglite(pg);
}
