import type { Metadata } from 'next';
import { CalculatorTabs, SipCalculator } from '@/components/calculators';
import { currentVisitor } from '@/server/visitor';

export const metadata: Metadata = { title: 'SIP calculator · Groww prototype' };

export default async function SipCalculatorPage() {
  const visitor = await currentVisitor();
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <CalculatorTabs />
        <div>
          <h1 className="text-3xl font-bold">SIP calculator</h1>
          <p className="mt-1 text-muted">Estimate what a monthly SIP could grow to.</p>
        </div>
      </div>
      <SipCalculator signedIn={visitor !== null} />
    </div>
  );
}
