// POST /api/ai/choice {aiCheckId, choice}: what the investor did after the card, logged in ai_checks.
import { getDb } from '@/db/pool';
import { noVisitor, readJson, reply } from '@/server/api';
import { recordChoice } from '@/pipeline/retrieval/checkin';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  return reply(await recordChoice(getDb(), visitor.id, Number(body.aiCheckId), String(body.choice)));
}
