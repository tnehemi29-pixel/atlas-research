import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWatchlistDetail, WatchlistNotFoundError } from '@/lib/services/watchlistService';
import { WatchlistDetailWorkspace } from '@/components/watchlists/WatchlistDetailWorkspace';
import type { WatchlistDetailResponse } from '@/lib/api/watchlists';

export const dynamic = 'force-dynamic';

interface WatchlistDetailPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: WatchlistDetailPageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: 'Watchlist · Atlas Research' };
  try {
    const { watchlist } = await getWatchlistDetail(user.id, params.id);
    return { title: `${watchlist.name} · Atlas Research` };
  } catch {
    return { title: 'Watchlist · Atlas Research' };
  }
}

export default async function WatchlistDetailPage({ params }: WatchlistDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let detail;
  try {
    detail = await getWatchlistDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) notFound();
    throw error;
  }

  const response: WatchlistDetailResponse = {
    watchlist: {
      id: detail.watchlist.id,
      userId: detail.watchlist.userId,
      name: detail.watchlist.name,
      createdAt: detail.watchlist.createdAt.toISOString(),
      updatedAt: detail.watchlist.updatedAt.toISOString(),
    },
    rows: detail.rows,
  };

  return <WatchlistDetailWorkspace initial={response} />;
}
