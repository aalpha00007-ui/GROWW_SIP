import { ComingNext } from '@/components/coming-next';
import { currentVisitor } from '@/server/visitor';

export default async function Home() {
  const visitor = await currentVisitor();
  return <ComingNext title={`Hi ${visitor?.firstName ?? ''}`} what="Your goal cards, the “no goal yet” row and “Simulate a market fall” arrive in the next build step." />;
}
