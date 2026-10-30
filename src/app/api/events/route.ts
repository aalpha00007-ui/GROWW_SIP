// POST /api/events {event, sipId?, choice?, where?}: funnel events only the browser sees
// (the goal step opening, the tooltip closing, Keep at Before you stop).
import { getDb } from '@/db/pool';
import { noVisitor, readJson, reply } from '@/server/api';
import { logBrowserEvent } from '@/server/events';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await logBrowserEvent(getDb(), visitor.id, await readJson(request)));
}
