// A Home section title (22px semibold) with an optional "See all >" link on the right.
import Link from 'next/link';
import { Icon } from './icons';

export function SectionTitle({ title, link, id }: { title: string; link?: { label: string; href: string }; id?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="scroll-mt-28 text-[22px] font-semibold">
        {title}
      </h2>
      {link && (
        <Link href={link.href} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:text-primary-hover">
          {link.label}
          <Icon name="chevron" size={16} />
        </Link>
      )}
    </div>
  );
}
