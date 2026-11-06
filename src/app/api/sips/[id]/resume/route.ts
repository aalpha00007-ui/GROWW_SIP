// POST /api/sips/[id]/resume: end a pause early.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, reply, idParam } from '@/server/api';
import { resumeSip } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await resumeSip(getDb(), visitor.id, await idParam(params), todayInIndia()));
}
