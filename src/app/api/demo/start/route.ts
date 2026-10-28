// POST /api/demo/start {persona}: a fresh copy of the persona for this visitor (PRD F1), so two
// testers never share data. Signs the browser in to that copy.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { PERSONA_KEYS } from '@/pipeline/loading/raw';
import { withSession } from '@/server/api';
import { startPersona } from '@/server/auth';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { persona?: unknown } | null;
  const persona = body?.persona;
  if (typeof persona !== 'string' || !(PERSONA_KEYS as readonly string[]).includes(persona)) {
    return NextResponse.json({ error: 'Choose one of the demo personas.' }, { status: 400 });
  }
  const { token } = await startPersona(getDb(), persona);
  return withSession(NextResponse.json({ ok: true }), token);
}
