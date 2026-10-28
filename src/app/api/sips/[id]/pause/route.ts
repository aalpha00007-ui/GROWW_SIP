// POST /api/sips/[id]/pause {count}: skip the next 1-3 instalments (only when active).
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply, idParam } from '@/server/api';
import { pauseSip } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  return reply(await pauseSip(getDb(), visitor.id, await idParam(params), body.count, todayInIndia()));
}
