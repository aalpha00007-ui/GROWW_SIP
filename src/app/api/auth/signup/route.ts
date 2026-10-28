// POST /api/auth/signup {displayName, username, pin, pinConfirm, agreed}: "Create demo account".
// No email, phone or real password, ever. Rate-limited per network.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { readJson, reply, withSession } from '@/server/api';
import { ipHash, signUp } from '@/server/auth';

export async function POST(request: Request) {
  const result = await signUp(getDb(), await readJson(request), ipHash(request));
  return result.status === 200 ? withSession(NextResponse.json({ ok: true }), result.token) : reply(result);
}
