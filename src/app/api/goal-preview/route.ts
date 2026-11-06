// GET /api/goal-preview?fundId&amount&day&targetMonth&target: the SIP box's live goal line (spec §2A), and the gap to a target.
// What the investor will put in by the target month, never what it will be worth.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, reply } from '@/server/api';
import { goalPreview } from '@/server/funds';
import { validTarget } from '@/server/goal-gap';
import { currentVisitor } from '@/server/visitor';

export async function GET(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const q = new URL(request.url).searchParams;
  const number = (key: string) => (/^\d{1,9}$/.test(q.get(key) ?? '') ? Number(q.get(key)) : NaN);
  return reply(
    await goalPreview(getDb(), { fundId: number('fundId'), amount: number('amount'), day: number('day'), targetMonth: q.get('targetMonth') ?? '', name: q.get('name'), target: validTarget(q.get('target')) }, todayInIndia()),
  );
}
