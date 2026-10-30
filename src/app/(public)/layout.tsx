// The public pages (calculators and Learn): open to anyone, no login. They sit outside the (demo) group, whose
// layout is the login gate, and share the landing page's header, the banner (root layout) and the slim footer.
// The sign-up / log-in modal opens on whichever page asked for it.
import { Suspense } from 'react';
import { AuthModal } from '@/components/auth-modal';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const visitor = await currentVisitor();
  return (
    <>
      <SiteHeader visitorName={visitor?.firstName ?? null} />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-10">{children}</main>
      <SiteFooter />
      <Suspense>
        <AuthModal />
      </Suspense>
    </>
  );
}
