// POST /api/sips/[id]/cancel {aiCheckId?}: stop the SIP (the UI says Stop anyway). Only when not stopped.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply, idParam } from '@/server/api';
import { stopSip } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  return reply(await stopSip(getDb(), visitor.id, await idParam(params), body.aiCheckId, todayInIndia()));
}
