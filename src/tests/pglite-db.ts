import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Db } from '../db/client';

/** An in-memory Postgres behind the same Db interface as Neon, for tests. */
export function pgliteDb(pg: PGlite = new PGlite()): Db {
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
