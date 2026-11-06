// GET /api/sips/[id]/goal-preview?targetMonth&target: Edit goal's live gap to the target, for this SIP's own schedule.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { idParam, noVisitor, reply } from '@/server/api';
import { sipGoalPreview, validTarget } from '@/server/goal-gap';
import { currentVisitor } from '@/server/visitor';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const q = new URL(request.url).searchParams;
  return reply(await sipGoalPreview(getDb(), visitor.id, await idParam(params), { targetMonth: q.get('targetMonth'), target: validTarget(q.get('target')) }, todayInIndia()));
}
