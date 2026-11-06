// The demo autopay: each investor's made-up mandate, never a real bank or account number. Settings and the order card
// both read it here, so they always name the same one. No real bank is connected, so it's shown and never edited.
import type { Db } from '../db/client';

export interface Autopay {
  bank: string;
  method: string;
}

export async function autopay(db: Db, investorId: string): Promise<Autopay | null> {
  const { rows } = await db.query<{ bank_label: string; method: string }>(
    'SELECT bank_label, method FROM mandates WHERE investor_id = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [investorId],
  );
  return rows[0] ? { bank: rows[0].bank_label, method: rows[0].method } : null;
}
