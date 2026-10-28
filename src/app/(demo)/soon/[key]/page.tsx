// "Not in this prototype" (spec §0 PLACEHOLDER): every product this case study does not build opens here.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PRODUCTS } from '@/components/products';

export default async function Soon({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const product = PRODUCTS.find((p) => p.key === key && p.key !== 'mf');
  if (!product) notFound();
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">{product.label}</h1>
      <p className="mt-2 text-muted">Not in this prototype. This case study builds the mutual fund SIP journey in full.</p>
      <Link href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-semibold text-primary hover:border-primary">
        Explore mutual funds
      </Link>
    </section>
  );
}
