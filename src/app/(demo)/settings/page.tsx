// Settings: who you are in the demo, log out, and delete the demo account with all its data.
import { redirect } from 'next/navigation';
import { DeleteAccount, LogOutButton } from '@/components/account-actions';
import { Avatar } from '@/components/avatar';
import { currentVisitor } from '@/server/visitor';

export default async function Settings() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
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
