// GET /api/goal-preview?fundId&amount&day&targetMonth: the SIP box's live goal line (spec §2A).
// What the investor will put in by the target month, never what it will be worth.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, reply } from '@/server/api';
import { goalPreview } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export async function GET(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const q = new URL(request.url).searchParams;
  const number = (key: string) => (/^\d{1,9}$/.test(q.get(key) ?? '') ? Number(q.get(key)) : NaN);
  return reply(
    await goalPreview(getDb(), { fundId: number('fundId'), amount: number('amount'), day: number('day'), targetMonth: q.get('targetMonth') ?? '' }, todayInIndia()),
  );
}
