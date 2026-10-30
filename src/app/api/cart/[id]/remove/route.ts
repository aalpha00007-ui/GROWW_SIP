// POST /api/cart/[id]/remove: takes one item out of the cookie visitor's cart.
import { getDb } from '@/db/pool';
import { idParam, noVisitor, reply } from '@/server/api';
import { removeFromCart } from '@/server/cart';
import { currentVisitor } from '@/server/visitor';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await removeFromCart(getDb(), visitor.id, await idParam(params)));
}
