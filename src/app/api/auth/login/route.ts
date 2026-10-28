// POST /api/auth/login {username, pin}. Five wrong PINs lock log-in for five minutes.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { readJson, reply, withSession } from '@/server/api';
import { logIn } from '@/server/auth';

export async function POST(request: Request) {
  const result = await logIn(getDb(), await readJson(request));
  return result.status === 200 ? withSession(NextResponse.json({ ok: true }), result.token) : reply(result);
}
