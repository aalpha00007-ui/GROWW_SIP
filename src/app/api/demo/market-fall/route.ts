// POST /api/demo/market-fall: "Simulate a market fall" (PRD F12). Adds a -6% NAV day to every fund,
// labelled demo and seen only by this visitor. Pressing it again adds another day.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { dayMonthYear } from '@/pipeline/chunking/format';
import { applyMarketFall, DEMO_FALL } from '@/pipeline/loading/market-fall';
import { logEvent } from '@/server/events';
import { currentVisitor } from '@/server/visitor';

export async function POST() {
  const visitor = await currentVisitor();
  if (!visitor) return NextResponse.json({ error: 'Start the demo first.' }, { status: 401 });
  const db = getDb();
  const days = await applyMarketFall(db, visitor.id);
  await logEvent(db, visitor.id, 'market_fall_simulated', { nav_date: days[0]?.nav_date ?? null });
  const date = days[0] ? dayMonthYear(days[0].nav_date) : null;
  return NextResponse.json({
    ok: true,
    message: `Added a simulated -${DEMO_FALL * 100}% day${date ? ` on ${date}` : ''}. The numbers now include it.`,
  });
}
