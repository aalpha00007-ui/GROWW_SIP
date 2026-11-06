// POST /api/e2e/clock {today}: sets the demo date for the regression suite. Not found unless the server was started with
// E2E_CLOCK=1, which Render never sets: on the live site this route does not exist in any way a visitor can see.
import { NextResponse } from 'next/server';
import { isIsoDate, setTestClock } from '@/pipeline/loading/dates';
import { readJson } from '@/server/api';

export async function POST(request: Request) {
  if (process.env.E2E_CLOCK !== '1') return new NextResponse(null, { status: 404 });
  const { today } = await readJson(request);
  if (!isIsoDate(today)) return NextResponse.json({ error: 'Give a date as YYYY-MM-DD.' }, { status: 400 });
  setTestClock(today);
  return NextResponse.json({ today });
}
