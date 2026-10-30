// POST /api/auth/check {username}: step 1 of the modal. Says whether the username is new (create a PIN) or
// taken (enter your PIN). Email- and phone-like usernames are refused here, before any PIN is asked for.
// Each network gets 20 checks every 10 minutes, so the endpoint can't be used to list accounts.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { readJson, reply } from '@/server/api';
import { allowUsernameCheck, checkUsername, ipHash } from '@/server/auth';

export async function POST(request: Request) {
  if (!allowUsernameCheck(ipHash(request))) return NextResponse.json({ error: 'Too many tries. Wait a few minutes and try again.' }, { status: 429 });
  const result = await checkUsername(getDb(), await readJson(request));
  return result.status === 200 ? NextResponse.json({ exists: result.exists }) : reply(result);
}
