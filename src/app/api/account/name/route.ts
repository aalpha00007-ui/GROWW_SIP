// POST /api/account/name {displayName}: Settings, a demo account's display name (it starts as the username).
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { noVisitor, readJson, reply } from '@/server/api';
import { setDisplayName } from '@/server/auth';
import { currentVisitor } from '@/server/visitor';

export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  const result = await setDisplayName(getDb(), visitor.id, await readJson(request));
  return result.status === 200 ? NextResponse.json({ ok: true }) : reply(result);
}
