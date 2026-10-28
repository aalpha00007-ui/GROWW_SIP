// POST /api/account/delete: "Delete my demo account". Deletes the investor and all its data, then signs out.
import { NextResponse } from 'next/server';
import { getDb } from '@/db/pool';
import { noVisitor, withoutSession } from '@/server/api';
import { deleteInvestor } from '@/server/auth';
import { currentVisitor } from '@/server/visitor';

export async function POST() {
  const visitor = await currentVisitor();
  if (!visitor) return noVisitor();
  await deleteInvestor(getDb(), visitor.id);
  return withoutSession(NextResponse.json({ ok: true }));
}
