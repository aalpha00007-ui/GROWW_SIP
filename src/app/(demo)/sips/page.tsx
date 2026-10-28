// The SIPs tab (spec §8 /sips): fund, amount, goal or "No goal", and the next instalment.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { sipList } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

export default async function Sips() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const sips = await sipList(getDb(), visitor.id, todayInIndia());

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Your SIPs</h1>
      {sips.length ? (
        <ul className="space-y-3">
          {sips.map((sip) => (
            <li key={sip.id}>
              <Link href={`/sips/${sip.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 hover:border-brand">
                <span>
                  <span className="block font-semibold">{sip.fund}</span>
                  <span className={`block text-sm ${sip.hasGoal ? 'text-brand' : 'text-muted'}`}>{sip.goal}</span>
                  <span className="tabular block text-sm text-muted">{sip.next}</span>
                </span>
                <span className="tabular shrink-0 font-semibold">{sip.amount}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-line bg-card p-4 text-muted">
          No SIPs yet.{' '}
          <Link href="/explore" className="font-semibold text-brand underline">
            Explore mutual funds
          </Link>
        </p>
      )}
    </div>
  );
}
