// POST /api/notifications/read {ids}: remembers what this investor has read, so the unread badge stays gone.
import { getDb } from '@/db/pool';
import { noVisitor, readJson, reply } from '@/server/api';
import { markNotificationsRead } from '@/server/shell';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await markNotificationsRead(getDb(), visitor.id, await readJson(request)));
}
