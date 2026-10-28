// POST /api/sips/[id]/goal {kind, name?, targetMonth?}: set, change or remove the goal (name through the PII guard).
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply, idParam } from '@/server/api';
import { setGoal } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  return reply(await setGoal(getDb(), visitor.id, await idParam(params), body, todayInIndia()));
}
