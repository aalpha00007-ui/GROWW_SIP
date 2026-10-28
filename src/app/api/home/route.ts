// GET /api/home: the Home screen's data for the cookie's visitor (PRD F4), formatted and ready to print.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { homeView } from '@/server/home';
import { currentVisitor } from '@/server/visitor';

export async function GET() {
  const visitor = await currentVisitor();
  if (!visitor) return NextResponse.json({ error: 'Start the demo first.' }, { status: 401 });
  return NextResponse.json(await homeView(getDb(), visitor.id, todayInIndia()));
}
