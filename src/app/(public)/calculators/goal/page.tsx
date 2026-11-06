import type { Metadata } from 'next';
import { CalculatorTabs, GoalPlanner } from '@/components/calculators';
import { todayInIndia } from '@/pipeline/loading/dates';
import { currentVisitor } from '@/server/visitor';

export const metadata: Metadata = { title: 'Goal planner · Groww prototype' };

/** ?target=500000&years=5 (from the goal step's "Try amounts in the Goal planner"), kept inside the sliders' ranges. */
export default async function GoalPlannerPage({ searchParams }: { searchParams: Promise<{ target?: string; years?: string }> }) {
  const visitor = await currentVisitor();
  const q = await searchParams;
  const whole = (text: string | undefined, min: number, max: number) => (/^\d{1,10}$/.test(text ?? '') ? Math.min(max, Math.max(min, Number(text))) : undefined);
  const initialGoal = whole(q.target, 10_000, 10_00_00_000);
  const initialYears = whole(q.years, 1, 40);
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <CalculatorTabs />
        <div>
          <h1 className="text-3xl font-bold">Goal planner</h1>
          <p className="mt-1 text-muted">Find the monthly SIP for a goal and a date.</p>
        </div>
      </div>
      <GoalPlanner signedIn={visitor !== null} thisMonth={todayInIndia().slice(0, 7)} initialGoal={initialGoal} initialYears={initialYears} />
    </div>
  );
}
