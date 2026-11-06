// The database for the regression suite (npm run e2e:regression): an in-memory Postgres inside the server process, seeded
// once on the first query. So the suite runs the real production build and never touches the live database. Only
// E2E_PGLITE=1 reaches this file; Render never sets it, so production never loads it.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { ClosableDb, Db } from './client';

/** The same Db interface as Neon, over PGlite. Tests use it too (src/tests/pglite-db.ts). */
export function wrapPglite(pg: PGlite): Db {
  return {
    query: async (sql, params) => ({ rows: (await pg.query(sql, params)).rows as never[] }),
    exec: async (sql) => {
      await pg.exec(sql);
    },
    transaction: (fn) => pg.transaction((tx) => fn(transactionDb(tx))),
  };
}

function transactionDb(tx: Transaction): Db {
  const db: Db = {
    query: async (sql, params) => ({ rows: (await tx.query(sql, params)).rows as never[] }),
    exec: async (sql) => {
      await tx.exec(sql);
    },
    transaction: (fn) => fn(db),
  };
  return db;
}

export function regressionDb(seedDate: string | undefined): ClosableDb {
  const ready = (async () => {
    const [{ PGlite }, { migrateDatabase }] = await Promise.all([import('@electric-sql/pglite'), import('../pipeline/loading/seed')]);
    const db = wrapPglite(new PGlite());
    await migrateDatabase(db, { today: seedDate });
    return db;
  })();
  return {
    query: async (sql, params) => (await ready).query(sql, params),
    exec: async (sql) => (await ready).exec(sql),
    transaction: async (fn) => (await ready).transaction(fn),
    close: async () => {},
  };
}
