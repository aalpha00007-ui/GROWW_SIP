// POST /api/watchlist {fundId, watch}: Mutual Funds -> Watchlist, from the button on a fund page.
import { getDb } from '@/db/pool';
import { noVisitor, readJson, reply } from '@/server/api';
import { setWatch } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await setWatch(getDb(), visitor.id, await readJson(request)));
}
