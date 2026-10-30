// POST /api/cart {fundId, kind: 'sip' | 'one_time', amount, day?}: Add to cart from the order card.
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply } from '@/server/api';
import { addToCart } from '@/server/cart';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await addToCart(getDb(), visitor.id, await readJson(request), todayInIndia()));
}
