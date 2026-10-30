// Small helpers the API routes share: every route acts only for the cookie's visitor (spec §8).
import { NextResponse } from 'next/server';
import { groqFromEnv, mistralFromEnv } from '../llm/chat';
import { getDb } from '../db/pool';
import type { CheckInDeps } from '../pipeline/retrieval/checkin';
import { SESSION_COOKIE, SESSION_DAYS } from './auth';

export const noVisitor = () => NextResponse.json({ error: 'Start the demo first.' }, { status: 401 });

/** The JSON body, or {} when there is none or it is not an object. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** A result with a status becomes the response: { status: 400, error } -> 400 { error }. */
export function reply({ status, ...body }: { status: number } & object) {
  return NextResponse.json(body, { status });
}

/** The [id] in the URL (a SIP or a fund); NaN when it is not a number, which reads as "not found". */
export async function idParam(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params;
  return /^\d{1,9}$/.test(id) ? Number(id) : NaN;
}

/**
 * Whether the browser came over HTTPS, directly or through Render's proxy. A secure cookie sent over plain http
 * is dropped by the browser (localhost aside), so a phone on the same Wi-Fi testing http://192.168.x.x:3000
 * would never stay signed in.
 */
export function overHttps(request: Request): boolean {
  return request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https' || request.url.startsWith('https:');
}

/** Signs the browser in: the session token in an httpOnly cookie for 7 days, secure whenever the page is on HTTPS. */
export function withSession(response: NextResponse, token: string, request: Request): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: overHttps(request),
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: '/',
  });
  return response;
}

export function withoutSession(response: NextResponse, request: Request): NextResponse {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: overHttps(request), maxAge: 0, path: '/' });
  return response;
}

/** The check-in's models: Groq reads the reason, Mistral writes the answer (decision D4). Server only. */
export function checkInDeps(): CheckInDeps {
  return { db: getDb(), llm: mistralFromEnv(), reader: groqFromEnv(), promptVersion: process.env.PROMPT_VERSION };
}
