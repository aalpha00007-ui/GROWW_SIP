// POST /api/auth/logout: ends this browser's session.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { withoutSession } from '@/server/api';
import { endSession, SESSION_COOKIE } from '@/server/auth';

export async function POST(request: Request) {
  await endSession(getDb(), (await cookies()).get(SESSION_COOKIE)?.value);
  return withoutSession(NextResponse.json({ ok: true }), request);
}
