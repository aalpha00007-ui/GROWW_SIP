import { Pool, type PoolClient } from '@neondatabase/serverless';

/** The small slice of a Postgres client the app needs. Neon in the app, PGlite in tests. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs one or more statements with no parameters, such as the schema file. */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export interface ClosableDb extends Db {
  close(): Promise<void>;
}

export function connectNeon(connectionString: string): ClosableDb {
  const pool = new Pool({ connectionString });
  return {
    query: async (sql, params) => ({ rows: (await pool.query(sql, params)).rows }),
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(clientDb(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

function clientDb(client: PoolClient): Db {
  const db: Db = {
    query: async (sql, params) => ({ rows: (await client.query(sql, params)).rows }),
    exec: async (sql) => {
      await client.query(sql);
    },
    // Already inside a transaction: keep working on the same connection.
    transaction: (fn) => fn(db),
  };
  return db;
}
