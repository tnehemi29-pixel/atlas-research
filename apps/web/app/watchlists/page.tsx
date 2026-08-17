import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { listWatchlists } from '@/lib/services/watchlistService';
import { WatchlistsWorkspace } from '@/components/watchlists/WatchlistsWorkspace';
import type { WatchlistListItem } from '@/lib/api/watchlists';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Watchlists · Atlas Research' };

export default async function WatchlistsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const watchlists = await listWatchlists(user.id);
  const initialWatchlists: WatchlistListItem[] = watchlists.map((w) => ({
    id: w.id,
    userId: w.userId,
    name: w.name,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    _count: w._count,
  }));

  return <WatchlistsWorkspace initialWatchlists={initialWatchlists} />;
}
