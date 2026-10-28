// POST /api/ai/before-stop {sipId, text}: Before you stop (PRD F7). Returns the answer, declined or
// fallback card. The models are called from the server only; no key reaches the browser.
import { NextResponse } from 'next/server';
import { checkInDeps, noVisitor, readJson, reply } from '@/server/api';
import { checkInCard } from '@/server/checkin-card';
import { runCheckIn } from '@/pipeline/retrieval/checkin';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const body = await readJson(request);
  const text = typeof body.text === 'string' ? body.text : '';
  const result = await runCheckIn(checkInDeps(), { investorId: visitor.id, sipId: Number(body.sipId), moment: 'before_stop', text });
  return result.status === 200 ? NextResponse.json(checkInCard(result)) : reply(result);
}
