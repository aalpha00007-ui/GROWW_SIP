// POST /api/invest {fundId, amount}: a one-time demo investment, paid from the demo balance.
import { getDb } from '@/db/pool';
import { noVisitor, readJson, reply } from '@/server/api';
import { investOnce } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await investOnce(getDb(), visitor.id, await readJson(request)));
}
