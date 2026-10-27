// POST /api/demo/start {persona}: a fresh copy of the persona for this visitor (PRD F1), so two
// testers never share data. Sets the visitor cookie.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { clonePersona } from '@/pipeline/loading/personas';
import { PERSONA_KEYS } from '@/pipeline/loading/raw';
import { VISITOR_COOKIE, VISITOR_MAX_AGE_S } from '@/server/visitor';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { persona?: unknown } | null;
  const persona = body?.persona;
  if (typeof persona !== 'string' || !(PERSONA_KEYS as readonly string[]).includes(persona)) {
    return NextResponse.json({ error: 'Choose Riya, Arjun or Meera.' }, { status: 400 });
  }
  const investorId = await clonePersona(getDb(), persona);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(VISITOR_COOKIE, investorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VISITOR_MAX_AGE_S,
    path: '/',
  });
  return response;
}
