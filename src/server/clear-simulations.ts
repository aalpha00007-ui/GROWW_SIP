// One clean-up after the demo control was removed: deletes every simulated price saved for an account, so nobody stays
// stuck at simulated values. Seeded persona data lives in nav_history and instalments, so this leaves it alone.
import type { Db } from '../db/client';

export interface SimulationCount {
  rows: number;
  accounts: number;
}

export async function countSimulations(db: Db): Promise<SimulationCount> {
  const [row] = (await db.query<SimulationCount>('SELECT count(*)::int AS rows, count(DISTINCT investor_id)::int AS accounts FROM demo_nav_history')).rows;
  return row;
}

export async function clearSimulations(db: Db): Promise<SimulationCount> {
  const before = await countSimulations(db);
  await db.query('DELETE FROM demo_nav_history');
  return before;
}
