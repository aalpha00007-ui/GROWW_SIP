// One Explore collection: 6-8 made-up funds, each opening the fund page and its order card.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FundRows } from '@/components/fund-rows';
import { getDb } from '@/db/pool';
import { collection } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export default async function Collection({ params }: { params: Promise<{ key: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const found = await collection(getDb(), visitor.id, (await params).key);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary-hover">
          ← Explore
        </Link>
        <h1 className="text-2xl font-bold">{found.label}</h1>
        <p className="text-sm text-muted">{found.about}</p>
      </div>
      <FundRows funds={found.funds} />
      <p className="text-xs text-muted">Made-up funds and returns for a case study. Not investment advice.</p>
    </div>
  );
}
