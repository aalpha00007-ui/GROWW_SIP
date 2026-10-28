// GET /api/quality: the eval result for the live version (Render's RENDER_GIT_COMMIT) and live AI counts (PRD F11).
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { qualityView } from '@/server/quality';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await qualityView(getDb(), process.env.RENDER_GIT_COMMIT));
}
