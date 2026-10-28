import Link from 'next/link';
import { currentVisitor } from '@/server/visitor';

export default async function Profile() {
  const visitor = await currentVisitor();
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">Profile</h1>
      <p className="mt-2 text-muted">You are using the demo as {visitor?.displayName}. Autopay and bank details arrive in a later build step.</p>
      <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-semibold text-primary hover:border-primary">
        Switch demo investor
      </Link>
    </section>
  );
}
