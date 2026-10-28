// POST /api/sips/[id]/amount {amount}: a whole number from the fund's minimum to Rs 1,00,000.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply, idParam } from '@/server/api';
import { changeAmount } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  return reply(await changeAmount(getDb(), visitor.id, await idParam(params), body.amount, todayInIndia()));
}
