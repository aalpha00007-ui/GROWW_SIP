// POST /api/sips {fundId, amount, frequency, day, goal?: {kind, name?, targetMonth?}}: Start SIP (PRD F2).
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply } from '@/server/api';
import { startSip } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await startSip(getDb(), visitor.id, await readJson(request), todayInIndia()));
}
