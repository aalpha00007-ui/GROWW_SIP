// GET /api/funds?category&risk: the Mutual funds tab (spec §8). Made-up funds, shown as simulated.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { noVisitor } from '@/server/api';
import { fundList } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export async function GET(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const q = new URL(request.url).searchParams;
  return NextResponse.json(await fundList(getDb(), visitor.id, { category: q.get('category') ?? undefined, risk: q.get('risk') ?? undefined }));
}
