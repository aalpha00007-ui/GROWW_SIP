import { redirect } from 'next/navigation';

// Your holdings, with their goals, live on the Dashboard.
export default function Portfolio() {
  redirect('/dashboard');
}
