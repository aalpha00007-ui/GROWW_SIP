import type { Metadata } from 'next';
import { CalculatorTabs, GoalPlanner } from '@/components/calculators';
import { currentVisitor } from '@/server/visitor';

export const metadata: Metadata = { title: 'Goal planner · Groww prototype' };

export default async function GoalPlannerPage() {
  const visitor = await currentVisitor();
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <CalculatorTabs />
        <div>
          <h1 className="text-3xl font-bold">Goal planner</h1>
          <p className="mt-1 text-muted">Find the monthly SIP for a goal and a date.</p>
        </div>
      </div>
      <GoalPlanner signedIn={visitor !== null} />
    </div>
  );
}
