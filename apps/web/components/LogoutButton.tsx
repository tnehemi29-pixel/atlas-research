'use client';

import { useRouter } from 'next/navigation';
import { logoutUser } from '@/lib/api/auth';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await logoutUser();
    router.push('/');
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} className="text-ink/50 text-sm hover:text-ink/80">
      Log out
    </button>
  );
}
