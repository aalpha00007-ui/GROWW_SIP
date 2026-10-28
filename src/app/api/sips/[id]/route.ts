// GET /api/sips/[id]: the SIP page's data (PRD F5). Someone else's SIP reads as not found.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, idParam } from '@/server/api';
import { loadSip, sipView } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const today = todayInIndia();
  const sip = await loadSip(getDb(), visitor.id, await idParam(params), today);
  if (!sip) return NextResponse.json({ error: 'We could not find that SIP.' }, { status: 404 });
  return NextResponse.json(sipView(sip, today));
}
