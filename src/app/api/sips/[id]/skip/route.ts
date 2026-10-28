// POST /api/sips/[id]/skip: skip the next instalment (only when active).
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, reply, sipIdParam } from '@/server/api';
import { skipNext } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await skipNext(getDb(), visitor.id, await sipIdParam(params), todayInIndia()));
}
