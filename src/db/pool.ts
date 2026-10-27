// One Neon pool for the whole server process. Next.js reloads modules in development, so the pool
// lives on globalThis to avoid opening a new one on every edit. Next.js reads .env and .env.local itself.
import { connectNeon, type ClosableDb } from './client';

const holder = globalThis as { growwSipDb?: ClosableDb };

export function getDb(): ClosableDb {
  if (!holder.growwSipDb) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Add it to .env.local (locally) or to Render.');
    holder.growwSipDb = connectNeon(process.env.DATABASE_URL);
  }
  return holder.growwSipDb;
}
