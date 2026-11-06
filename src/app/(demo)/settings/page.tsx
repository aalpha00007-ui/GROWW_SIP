// Settings: who you are in the demo (a demo account can change its display name), the demo autopay, log out, and
// delete the demo account with all its data.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeleteAccount, DisplayNameForm, LogOutButton } from '@/components/account-actions';
import { Avatar } from '@/components/avatar';
import { getDb } from '@/db/pool';
import { autopay } from '@/server/autopay';
import { currentVisitor, NO_DEMO } from '@/server/visitor';

export default async function Settings() {
  const visitor = await currentVisitor();
  if (!visitor) redirect(NO_DEMO);
  const pay = await autopay(getDb(), visitor.id);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
        <Avatar name={visitor.firstName} size={48} />
        <div>
          <p className="font-semibold text-strong">{visitor.displayName}</p>
          <p className="text-sm text-muted">{visitor.username ? `@${visitor.username}` : 'Demo persona (a private copy)'}</p>
        </div>
      </section>
      {visitor.username && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <DisplayNameForm current={visitor.displayName} />
        </section>
      )}
      <section id="autopay" className="scroll-mt-32 space-y-2 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Autopay</h2>
        <p className="tabular text-sm font-medium text-strong">{pay ? `${pay.bank} · ${pay.method}` : 'No autopay is set up.'}</p>
        <p className="text-sm text-muted">
          Made up for this demo: no real bank is connected and no money moves, so the mandate can&apos;t be changed here. You can skip, pause or change
          the amount on any SIP.
        </p>
        <Link href="/sips" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2">
          Go to your SIPs
        </Link>
      </section>
      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Session</h2>
        <LogOutButton className="flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold hover:border-primary" />
      </section>
      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Delete</h2>
        <DeleteAccount isAccount={visitor.username !== null} />
      </section>
    </div>
  );
}
