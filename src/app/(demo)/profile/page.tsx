import { redirect } from 'next/navigation';

// The profile opens from the avatar; its page is Settings.
export default function Profile() {
  redirect('/settings');
}
