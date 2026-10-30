import type { Metadata } from 'next';
import { CalculatorTabs, SwpCalculator } from '@/components/calculators';

export const metadata: Metadata = { title: 'SWP calculator · Groww prototype' };

export default function SwpCalculatorPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <CalculatorTabs />
        <div>
          <h1 className="text-3xl font-bold">SWP calculator</h1>
          <p className="mt-1 text-muted">Plan monthly withdrawals from your savings.</p>
        </div>
      </div>
      <SwpCalculator />
    </div>
  );
}
