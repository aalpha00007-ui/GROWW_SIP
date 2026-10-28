// GET /api/sips: the SIPs tab, one row per SIP of the cookie's visitor.
// POST /api/sips {fundId, amount, frequency, day, goal?: {kind, name?, targetMonth?}}: Start SIP (PRD F2).
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, readJson, reply } from '@/server/api';
import { startSip } from '@/server/funds';
import { sipList } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

export async function GET() {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return NextResponse.json({ sips: await sipList(getDb(), visitor.id, todayInIndia()) });
}

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return reply(await startSip(getDb(), visitor.id, await readJson(request), todayInIndia()));
}
