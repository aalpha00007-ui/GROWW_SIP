// "Not part of this prototype" (spec §0 PLACEHOLDER): every product and tool this case study does not build.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PRODUCTS } from '@/components/products';

const TOOLS: Record<string, string> = {
  terminal: 'Terminal',
  nfo: 'New fund offers',
  'sip-calculator': 'SIP calculator',
  compare: 'Compare funds',
  import: 'Import funds',
  tax: 'File tax',
  'stock-sip': 'Stock SIP',
  screener: 'Screener',
  events: 'Events calendar',
  options: 'Option chain',
  margin: 'Margin calculator',
  'fo-learn': 'Learn F&O',
};

export default async function Soon({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const label = TOOLS[key] ?? PRODUCTS.find((p) => p.key === key && p.key !== 'mf')?.label;
  if (!label) notFound();
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">{label}</h1>
      <p className="mt-2 text-muted">Not part of this prototype. This case study covers mutual fund SIPs.</p>
      <Link href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-semibold text-primary hover:border-primary">
        Back to Mutual Funds
      </Link>
    </section>
  );
}
