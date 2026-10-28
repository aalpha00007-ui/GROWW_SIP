import { redirect } from 'next/navigation';

// Home moved to Mutual Funds → Dashboard; old links still land there.
export default function Home() {
  redirect('/dashboard');
}
