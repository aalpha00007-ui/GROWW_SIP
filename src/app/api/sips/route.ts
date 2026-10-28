// GET /api/sips: the SIPs tab, one row per SIP of the cookie's visitor.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor } from '@/server/api';
import { sipList } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

export async function GET() {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  return NextResponse.json({ sips: await sipList(getDb(), visitor.id, todayInIndia()) });
}
