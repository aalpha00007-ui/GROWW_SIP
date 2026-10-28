// GET /api/funds/[id]: the fund page and its SIP box (PRD F2).
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { noVisitor, idParam } from '@/server/api';
import { fundPage } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const fund = await fundPage(getDb(), visitor.id, await idParam(params), todayInIndia());
  return fund ? NextResponse.json(fund) : NextResponse.json({ error: 'We could not find that fund.' }, { status: 404 });
}
