// POST /api/ai/is-normal {sipId}: "What does this dip mean for my goal?" (PRD F6). Facts, an answer on
// the doubt route and the checks, with no reason to read.
import { NextResponse } from 'next/server';
import { checkInDeps, noVisitor, readJson, reply } from '@/server/api';
import { checkInCard } from '@/server/checkin-card';
import { runCheckIn } from '@/pipeline/retrieval/checkin';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  const result = await runCheckIn(checkInDeps(), { investorId: visitor.id, sipId: Number(body.sipId), moment: 'is_this_normal' });
  return result.status === 200 ? NextResponse.json(checkInCard(result)) : reply(result);
}
